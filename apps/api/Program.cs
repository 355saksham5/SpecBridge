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

builder.Services.AddSingleton<JobCancellationRegistry>();
builder.Services.AddSingleton<BrownfieldJobQueue>();

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
    version = "1.0.0-phase5"
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

app.MapGet("/v1/brownfield-jobs", () => Results.Ok(new { jobs = Array.Empty<object>() }))
    .RequireAuthorization()
    .WithName("ListBrownfieldJobs")
    .WithTags("Brownfield Jobs");

app.MapPost("/v1/brownfield-jobs", async (BrownfieldJobQueue queue, HttpContext http) =>
{
    var jobId = Guid.NewGuid();
    var payload = new
    {
        jobId,
        organizationId = http.User.FindFirst("org_id")?.Value,
        options = new { enqueuedAt = DateTime.UtcNow },
    };

    if (queue.IsConfigured)
    {
        await queue.EnqueueAsync(payload);
    }

    return Results.Accepted($"/v1/brownfield-jobs/{jobId}", new
    {
        jobId,
        status = "queued",
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
