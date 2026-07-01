using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Identity.Web;
using FluentValidation;
using FluentValidation.AspNetCore;
using Microsoft.EntityFrameworkCore;
using Azure.Identity;
using Azure.Security.KeyVault.Secrets;
using SpecBridge.Api.Contracts;
using SpecBridge.Api.Data;
using SpecBridge.Api.Endpoints;
using SpecBridge.Api.Middleware;
using SpecBridge.Api.Services;
using SpecBridge.Api.Validation;

var builder = WebApplication.CreateBuilder(args);

builder.Configuration.AddEnvironmentVariables("SPECBRIDGE_");
if (builder.Environment.IsDevelopment())
{
    builder.Configuration.AddUserSecrets<Program>();
}

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddMicrosoftIdentityWebApi(builder.Configuration.GetSection("EntraId"));

builder.Services.AddAuthorization();
builder.Services.AddHttpContextAccessor();

var connectionString = builder.Configuration.GetConnectionString("PostgreSQL");
builder.Services.AddDbContext<SpecBridgeDbContext>(options =>
{
    if (!string.IsNullOrWhiteSpace(connectionString))
    {
        options.UseNpgsql(connectionString);
    }
    else
    {
        options.UseNpgsql("Host=127.0.0.1;Port=5432;Database=__specbridge_unconfigured__;Username=unused;Password=unused");
    }
});

builder.Services.AddScoped<ITenantContextAccessor, TenantContextAccessor>();

var keyVaultUri = builder.Configuration["Azure:KeyVaultUri"];
if (!string.IsNullOrEmpty(keyVaultUri))
{
    var credential = new DefaultAzureCredential();
    builder.Services.AddSingleton(sp => new SecretClient(new Uri(keyVaultUri), credential));
}

builder.Services.AddSingleton<GhesHostRegistry>();
builder.Services.AddSingleton<JobCancellationRegistry>();
builder.Services.AddSingleton<BrownfieldJobQueue>();
builder.Services.AddSingleton<RepoPreflightService>();
builder.Services.AddSingleton<JobEventHub>();
builder.Services.AddSingleton<JobArtifactStore>();
builder.Services.AddSingleton<InternalEventsAuth>();
builder.Services.AddSingleton<BundleStorageService>();
builder.Services.AddSingleton<SddKitRegistry>();
builder.Services.AddScoped<TenantContext>();
builder.Services.AddScoped<BrownfieldJobService>();
builder.Services.AddScoped<IntegrationsService>();
builder.Services.AddScoped<WorkerCredentialService>();
builder.Services.AddScoped<JobProgressWriter>();
builder.Services.AddHttpClient<AtlassianOAuthService>();
builder.Services.AddScoped<AtlassianOAuthService>();

builder.Services.AddProblemDetails(options =>
{
    options.CustomizeProblemDetails = context =>
    {
        context.ProblemDetails.Instance = context.HttpContext.Request.Path;
    };
});
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

builder.Services.AddFluentValidationAutoValidation();
builder.Services.AddValidatorsFromAssemblyContaining<Program>();

var appInsightsKey = builder.Configuration["ApplicationInsights:ConnectionString"];
if (!string.IsNullOrEmpty(appInsightsKey))
{
    builder.Services.AddApplicationInsightsTelemetry(options =>
    {
        options.ConnectionString = appInsightsKey;
    });
}

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

if (builder.Environment.IsDevelopment())
{
    builder.Services.AddCors(options =>
    {
        options.AddDefaultPolicy(policy =>
        {
            policy.AllowAnyOrigin()
                  .AllowAnyMethod()
                  .AllowAnyHeader();
        });
    });
}

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    if (!string.IsNullOrWhiteSpace(app.Configuration.GetConnectionString("PostgreSQL")))
    {
        var db = scope.ServiceProvider.GetRequiredService<SpecBridgeDbContext>();
        try
        {
            await db.Database.MigrateAsync();
        }
        catch (Exception ex)
        {
            app.Logger.LogWarning(ex, "Database migration skipped — ensure PostgreSQL is reachable for persistence.");
        }
    }
    else
    {
        app.Logger.LogWarning(
            "PostgreSQL connection string not configured — set SPECBRIDGE_ConnectionStrings__PostgreSQL before using persistence endpoints.");
    }
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    app.UseCors();
}

app.UseExceptionHandler();
app.UseStatusCodePages(async statusContext =>
{
    if (statusContext.HttpContext.Response.HasStarted)
    {
        return;
    }

    var statusCode = statusContext.HttpContext.Response.StatusCode;
    if (statusCode is StatusCodes.Status401Unauthorized or StatusCodes.Status403Forbidden)
    {
        statusContext.HttpContext.Response.ContentType = "application/problem+json";
        await statusContext.HttpContext.Response.WriteAsJsonAsync(new
        {
            type = "https://tools.ietf.org/html/rfc9110#section-15.5",
            title = statusCode == StatusCodes.Status401Unauthorized ? "Unauthorized" : "Forbidden",
            status = statusCode,
            instance = statusContext.HttpContext.Request.Path.Value,
        });
    }
});

app.UseMiddleware<EventSourceTokenMiddleware>();
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<OrgRateLimitMiddleware>();

app.MapGet("/health", () => Results.Ok(new
{
    status = "healthy",
    timestamp = DateTime.UtcNow,
    version = "1.0.0"
}))
.AllowAnonymous()
.WithName("GetHealth")
.WithTags("Health");

app.MapGet("/", () => Results.Ok(new
{
    service = "SpecBridge API",
    version = "v1",
    description = "Make brownfield repos SDD-ready",
    docs = "/swagger"
}))
.AllowAnonymous()
.WithName("GetRoot");

app.MapGet("/v1/preflight/repo", async (
    string repoUrl,
    GhesHostRegistry registry,
    RepoPreflightService preflight) =>
{
    if (!RepoUrlValidation.TryParse(repoUrl, out var uri, out var parseError))
    {
        return Results.BadRequest(new { title = "Invalid repoUrl", detail = parseError });
    }

    var host = uri!.Host;
    if (!registry.IsAllowedHost(host))
    {
        return Results.BadRequest(new
        {
            title = "Host not allowlisted",
            detail = $"Host '{host}' is not github.com or a registered GHES host.",
            registeredGhesHosts = registry.RegisteredGhesHosts,
        });
    }

    var (reachable, detail) = host.Equals("github.com", StringComparison.OrdinalIgnoreCase)
        ? (true, "github.com — skipped reachability probe")
        : await preflight.CheckHostReachableAsync(host);

    return Results.Ok(new
    {
        repoUrl,
        host,
        allowlisted = true,
        reachable,
        detail,
        cursorEgressNote = "Cursor Cloud Agents must reach this host — customer may need to allowlist Cursor egress IPs for GHES.",
    });
})
.RequireAuthorization()
.WithName("PreflightRepo")
.WithTags("Preflight");

app.MapGet("/v1/brownfield-jobs", async (
    [AsParameters] ListJobsQuery query,
    BrownfieldJobService jobs,
    CancellationToken cancellationToken) =>
{
    var (jobList, nextCursor, errors, statusCode) = await jobs.ListAsync(query, cancellationToken);

    if (errors is not null)
    {
        return Results.ValidationProblem(errors, statusCode: statusCode);
    }

    if (statusCode == StatusCodes.Status403Forbidden)
    {
        return Results.Json(
            new { title = "Forbidden", detail = "Missing org_id claim on authenticated principal." },
            statusCode: statusCode);
    }

    return Results.Ok(new
    {
        jobs = jobList.Select(j => new
        {
            jobId = j.Id,
            status = j.Status,
            repoUrl = j.RepoUrl,
            createdAt = j.CreatedAt,
            updatedAt = j.UpdatedAt,
        }),
        nextCursor,
    });
})
    .RequireAuthorization()
    .WithName("ListBrownfieldJobs")
    .WithTags("Brownfield Jobs");

app.MapPost("/v1/brownfield-jobs", async (
    CreateBrownfieldJobRequest request,
    BrownfieldJobService jobs,
    CancellationToken cancellationToken) =>
{
    var (job, errors, statusCode, detail) = await jobs.CreateAsync(request, cancellationToken);

    if (errors is not null)
    {
        return Results.ValidationProblem(errors, statusCode: statusCode);
    }

    if (statusCode == StatusCodes.Status409Conflict)
    {
        return Results.Conflict(new { title = "Conflict", detail });
    }

    if (job is null)
    {
        return Results.Json(new { title = "Forbidden", detail }, statusCode: statusCode);
    }

    var jobId = job.Id;
    return Results.Accepted($"/v1/brownfield-jobs/{jobId}", new
    {
        jobId,
        status = job.Status,
        estimatedCommitsToProcess = request.History?.CommitDepth ?? 50,
        createdAt = job.CreatedAt,
        _links = new
        {
            self = $"/v1/brownfield-jobs/{jobId}",
            events = $"/v1/brownfield-jobs/{jobId}/events",
            bundle = $"/v1/brownfield-jobs/{jobId}/bundle",
            report = $"/v1/brownfield-jobs/{jobId}/report",
            cancel = $"/v1/brownfield-jobs/{jobId}/cancel",
        },
    });
})
.RequireAuthorization()
.WithName("CreateBrownfieldJob")
.WithTags("Brownfield Jobs");

app.MapGet("/v1/brownfield-jobs/{id:guid}", async (
    Guid id,
    BrownfieldJobService jobs,
    CancellationToken cancellationToken) =>
{
    var (job, statusCode) = await jobs.GetByIdAsync(id, cancellationToken);

    if (job is null)
    {
        return statusCode == StatusCodes.Status403Forbidden
            ? Results.Json(new { title = "Forbidden", detail = "Missing org_id claim on authenticated principal." }, statusCode: statusCode)
            : Results.NotFound(new { title = "Job not found", detail = $"No job with id '{id}' for this organization." });
    }

    return Results.Ok(new
    {
        jobId = job.Id,
        status = job.Status,
        repoUrl = job.RepoUrl,
        headSha = job.HeadSha,
        currentPhase = job.CurrentPhase,
        currentAgentRole = job.CurrentAgentRole,
        commitsProcessed = job.CommitsProcessed,
        commitsSkipped = job.CommitsSkipped,
        tokenEstimateStart = job.TokenEstimateStart,
        tokenEstimateCurrent = job.TokenEstimateCurrent,
        meanQaScore = job.MeanQaScore,
        prUrl = job.PrUrl,
        createdAt = job.CreatedAt,
        updatedAt = job.UpdatedAt,
        _links = new
        {
            self = $"/v1/brownfield-jobs/{job.Id}",
            events = $"/v1/brownfield-jobs/{job.Id}/events",
            bundle = $"/v1/brownfield-jobs/{job.Id}/bundle",
            report = $"/v1/brownfield-jobs/{job.Id}/report",
            cancel = $"/v1/brownfield-jobs/{job.Id}/cancel",
        },
    });
})
.RequireAuthorization()
.WithName("GetBrownfieldJob")
.WithTags("Brownfield Jobs");

app.MapGet("/v1/brownfield-jobs/{id:guid}/events", async (
    Guid id,
    BrownfieldJobService jobs,
    JobEventHub hub,
    HttpContext http,
    CancellationToken cancellationToken) =>
{
    var (job, statusCode) = await jobs.GetByIdAsync(id, cancellationToken);
    if (job is null)
    {
        http.Response.StatusCode = statusCode;
        await http.Response.WriteAsJsonAsync(new
        {
            title = statusCode == StatusCodes.Status403Forbidden ? "Forbidden" : "Not found",
            detail = statusCode == StatusCodes.Status403Forbidden
                ? "Missing org_id claim on authenticated principal."
                : $"No job with id '{id}' for this organization.",
        }, cancellationToken);
        return;
    }

    http.Response.StatusCode = StatusCodes.Status200OK;
    http.Response.Headers.CacheControl = "no-cache";
    http.Response.ContentType = "text/event-stream";

    await foreach (var jobEvent in hub.SubscribeAsync(id, cancellationToken))
    {
        await http.Response.WriteAsync(SseFormatter.Format(jobEvent.EventType, jobEvent.DataJson), cancellationToken);
        await http.Response.Body.FlushAsync(cancellationToken);
    }
})
.RequireAuthorization()
.WithName("GetBrownfieldJobEvents")
.WithTags("Brownfield Jobs");

app.MapGet("/v1/brownfield-jobs/{id:guid}/bundle", async (
    Guid id,
    BrownfieldJobService jobs,
    CancellationToken cancellationToken) =>
{
    var (redirectUrl, statusCode, detail) = await jobs.GetBundleRedirectAsync(id, cancellationToken);

    if (redirectUrl is not null)
    {
        return Results.Redirect(redirectUrl, permanent: false);
    }

    return statusCode switch
    {
        StatusCodes.Status403Forbidden => Results.Json(new { title = "Forbidden", detail }, statusCode: statusCode),
        StatusCodes.Status409Conflict => Results.Json(new { title = "Conflict", detail }, statusCode: statusCode),
        _ => Results.NotFound(new { title = "Not found", detail }),
    };
})
.RequireAuthorization()
.WithName("GetBrownfieldJobBundle")
.WithTags("Brownfield Jobs");

app.MapGet("/v1/brownfield-jobs/{id:guid}/report", async (
    Guid id,
    BrownfieldJobService jobs,
    CancellationToken cancellationToken) =>
{
    var (report, statusCode, detail) = await jobs.GetReportAsync(id, cancellationToken);

    if (report is not null)
    {
        return Results.Ok(report);
    }

    return statusCode switch
    {
        StatusCodes.Status403Forbidden => Results.Json(new { title = "Forbidden", detail }, statusCode: statusCode),
        _ => Results.NotFound(new { title = "Not found", detail }),
    };
})
.RequireAuthorization()
.WithName("GetBrownfieldJobReport")
.WithTags("Brownfield Jobs");

app.MapPost("/v1/internal/brownfield-jobs/{id:guid}/events", async (
    Guid id,
    PublishJobEventRequest request,
    BrownfieldJobService jobs,
    InternalEventsAuth auth,
    HttpContext http,
    CancellationToken cancellationToken) =>
{
    if (!auth.IsConfigured)
    {
        return Results.Json(
            new { title = "Not configured", detail = "Internal events endpoint is disabled — set Internal:EventsApiKey." },
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }

    if (!auth.TryValidate(http.Request.Headers["X-SpecBridge-Events-Key"]))
    {
        return Results.Unauthorized();
    }

    var (accepted, statusCode, detail) = await jobs.PublishWorkerEventAsync(id, request, cancellationToken);
    if (!accepted)
    {
        return Results.Json(new { title = "Rejected", detail }, statusCode: statusCode);
    }

    return Results.Accepted($"/v1/brownfield-jobs/{id}/events", new { jobId = id, eventType = request.EventType });
})
.AllowAnonymous()
.WithName("PublishBrownfieldJobEvent")
.WithTags("Internal");

app.MapPost("/v1/internal/worker/resolve-credentials", async (
    ResolveWorkerCredentialsRequest request,
    WorkerCredentialService credentials,
    InternalEventsAuth auth,
    HttpContext http,
    CancellationToken cancellationToken) =>
{
    if (!auth.IsConfigured)
    {
        return Results.Json(
            new { title = "Not configured", detail = "Internal worker API is disabled — set Internal:EventsApiKey." },
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }

    if (!auth.TryValidate(http.Request.Headers["X-SpecBridge-Events-Key"]))
    {
        return Results.Unauthorized();
    }

    var (resolved, statusCode, detail) = await credentials.ResolveAsync(request, cancellationToken);
    if (resolved is null)
    {
        return Results.Json(new { title = "Rejected", detail }, statusCode: statusCode);
    }

    return Results.Ok(resolved);
})
.AllowAnonymous()
.WithName("ResolveWorkerCredentials")
.WithTags("Internal");

app.MapPost("/v1/brownfield-jobs/{id:guid}/cancel", async (
    Guid id,
    BrownfieldJobService jobs,
    JobCancellationRegistry registry,
    BrownfieldJobQueue queue,
    CancellationToken cancellationToken) =>
{
    var (accepted, statusCode, detail) = await jobs.CancelAsync(id, cancellationToken);
    if (!accepted)
    {
        return statusCode switch
        {
            StatusCodes.Status404NotFound => Results.NotFound(new { title = "Not found", detail }),
            StatusCodes.Status409Conflict => Results.Conflict(new { title = "Conflict", detail }),
            _ => Results.Json(new { title = "Forbidden", detail }, statusCode: statusCode),
        };
    }

    registry.RequestCancel(id);
    await queue.PublishCancelAsync(id, cancellationToken);

    return Results.Accepted($"/v1/brownfield-jobs/{id}", new
    {
        jobId = id,
        status = "cancelled",
        message = "Cancellation requested. In-flight Cursor agent runs will stop at the next checkpoint; partial artifacts are preserved.",
    });
})
.RequireAuthorization()
.WithName("CancelBrownfieldJob")
.WithTags("Brownfield Jobs");

app.MapIntegrationEndpoints();
app.MapSddKitEndpoints();

app.Run();
