using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Identity.Web;
using FluentValidation;
using FluentValidation.AspNetCore;
using Microsoft.EntityFrameworkCore;
using Azure.Identity;
using Azure.Security.KeyVault.Secrets;
using SpecBridge.Api.Data;
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

var connectionString = builder.Configuration.GetConnectionString("PostgreSQL")
    ?? throw new InvalidOperationException("PostgreSQL connection string not found");

builder.Services.AddDbContext<SpecBridgeDbContext>(options =>
    options.UseNpgsql(connectionString));

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
builder.Services.AddHttpClient();

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

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    app.UseCors();
}

app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<OrgRateLimitMiddleware>();

app.MapGet("/health", () => Results.Ok(new
{
    status = "healthy",
    timestamp = DateTime.UtcNow,
    version = "1.0.0-phase6"
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

app.MapGet("/v1/brownfield-jobs", () => Results.Ok(new { jobs = Array.Empty<object>() }))
    .RequireAuthorization()
    .WithName("ListBrownfieldJobs")
    .WithTags("Brownfield Jobs");

app.MapPost("/v1/brownfield-jobs", async (
    BrownfieldJobQueue queue,
    GhesHostRegistry registry,
    HttpContext http) =>
{
    if (!http.Request.Headers.TryGetValue("X-Repo-Url", out var repoUrlHeader))
    {
        return Results.BadRequest(new { title = "Missing repo URL", detail = "Provide X-Repo-Url header until full request body validation lands in Phase 6+" });
    }

    var repoUrl = repoUrlHeader.ToString();
    if (!RepoUrlValidation.TryParse(repoUrl, out var uri, out var parseError))
    {
        return Results.BadRequest(new { title = "Invalid repoUrl", detail = parseError });
    }

    if (!registry.IsAllowedHost(uri!.Host))
    {
        return Results.BadRequest(new
        {
            title = "Host not allowlisted",
            detail = $"Host '{uri.Host}' is not permitted.",
        });
    }

    var jobId = Guid.NewGuid();
    var payload = new
    {
        jobId,
        organizationId = http.User.FindFirst("org_id")?.Value,
        options = new { repoUrl, enqueuedAt = DateTime.UtcNow },
    };

    if (queue.IsConfigured)
    {
        await queue.EnqueueAsync(payload);
    }

    return Results.Accepted($"/v1/brownfield-jobs/{jobId}", new
    {
        jobId,
        status = "queued",
        repoUrl,
        createdAt = DateTime.UtcNow,
    });
})
.RequireAuthorization()
.WithName("CreateBrownfieldJob")
.WithTags("Brownfield Jobs");

app.MapPost("/v1/brownfield-jobs/{id:guid}/cancel", async (
    Guid id,
    JobCancellationRegistry registry,
    BrownfieldJobQueue queue) =>
{
    registry.RequestCancel(id);
    await queue.PublishCancelAsync(id);

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

app.Run();
