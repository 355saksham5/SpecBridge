using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Identity.Web;
using FluentValidation;
using FluentValidation.AspNetCore;
using Microsoft.EntityFrameworkCore;
using Azure.Identity;
using Azure.Security.KeyVault.Secrets;
using Swashbuckle.AspNetCore.SwaggerGen;
using SpecBridge.Api.Data;

var builder = WebApplication.CreateBuilder(args);

// =====  Configuration =====
builder.Configuration.AddEnvironmentVariables("SPECBRIDGE_");
if (builder.Environment.IsDevelopment())
{
    builder.Configuration.AddUserSecrets<Program>();
}

// ===== Authentication & Authorization =====
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddMicrosoftIdentityWebApi(builder.Configuration.GetSection("EntraId"));

builder.Services.AddAuthorization();

// ===== Database =====
var connectionString = builder.Configuration.GetConnectionString("PostgreSQL") 
    ?? throw new InvalidOperationException("PostgreSQL connection string not found");

builder.Services.AddDbContext<SpecBridgeDbContext>(options =>
    options.UseNpgsql(connectionString));

// ===== Azure Services =====
var keyVaultUri = builder.Configuration["Azure:KeyVaultUri"];
if (!string.IsNullOrEmpty(keyVaultUri))
{
    var credential = new DefaultAzureCredential();
    builder.Services.AddSingleton(sp => new SecretClient(new Uri(keyVaultUri), credential));
}

// ===== Validation =====
builder.Services.AddFluentValidationAutoValidation();
builder.Services.AddValidatorsFromAssemblyContaining<Program>();

// ===== OpenTelemetry & Application Insights =====
var appInsightsKey = builder.Configuration["ApplicationInsights:ConnectionString"];
if (!string.IsNullOrEmpty(appInsightsKey))
{
    builder.Services.AddApplicationInsightsTelemetry(options =>
    {
        options.ConnectionString = appInsightsKey;
    });
}

// ===== Swagger / OpenAPI =====
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// ===== CORS (for local dev) =====
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

// ===== Build Application =====
var app = builder.Build();

// ===== Middleware Pipeline =====
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    app.UseCors();
}

app.UseAuthentication();
app.UseAuthorization();

// ===== API Endpoints =====

// Health check
app.MapGet("/health", () => Results.Ok(new
{
    status = "healthy",
    timestamp = DateTime.UtcNow,
    version = "1.0.0-phase1"
}))
.AllowAnonymous()
.WithName("GetHealth")
.WithTags("Health");

// Root
app.MapGet("/", () => Results.Ok(new
{
    service = "SpecBridge API",
    version = "v1",
    description = "Make brownfield repos SDD-ready",
    docs = "/swagger"
}))
.AllowAnonymous()
.WithName("GetRoot");

// Placeholder endpoints (Phase 1 skeleton)
app.MapGet("/v1/brownfield-jobs", () => Results.Ok(new { jobs = Array.Empty<object>() }))
    .RequireAuthorization()
    .WithName("ListBrownfieldJobs")
    .WithTags("Brownfield Jobs");

app.MapPost("/v1/brownfield-jobs", () => Results.Accepted("/v1/brownfield-jobs/fake-job-id", new
{
    jobId = Guid.NewGuid(),
    status = "queued",
    createdAt = DateTime.UtcNow
}))
.RequireAuthorization()
.WithName("CreateBrownfieldJob")
.WithTags("Brownfield Jobs");

app.Run();
