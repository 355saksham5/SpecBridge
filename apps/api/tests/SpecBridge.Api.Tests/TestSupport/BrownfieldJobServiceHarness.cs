using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using SpecBridge.Api.Contracts;
using SpecBridge.Api.Data;
using SpecBridge.Api.Data.Entities;
using SpecBridge.Api.Services;
using SpecBridge.Api.Validation;

namespace SpecBridge.Api.Tests.TestSupport;

/// <summary>
/// Wires a real <see cref="BrownfieldJobService"/> against an EF Core InMemory database and an
/// unconfigured queue/blob storage, so tests exercise the actual tenant filters, rate limiter,
/// and redirect logic without needing PostgreSQL, Service Bus, or Azure Storage.
/// </summary>
internal sealed class BrownfieldJobServiceHarness
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public SpecBridgeDbContext Db { get; }
    public OrgRateLimiter RateLimiter { get; }
    public BrownfieldJobService Service { get; }

    public BrownfieldJobServiceHarness(Guid? organizationId = null)
    {
        _httpContextAccessor = FakeTenant.AccessorFor(organizationId);

        var emptyConfig = new ConfigurationBuilder().Build();
        var tenantAccessor = new TenantContextAccessor(_httpContextAccessor);

        var options = new DbContextOptionsBuilder<SpecBridgeDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        Db = new SpecBridgeDbContext(options, tenantAccessor);

        RateLimiter = new OrgRateLimiter();

        Service = new BrownfieldJobService(
            Db,
            new BrownfieldJobQueue(emptyConfig),
            new CreateBrownfieldJobRequestValidator(new GhesHostRegistry(emptyConfig)),
            new TenantContext(_httpContextAccessor),
            new JobEventHub(new NoOpServiceScopeFactory()),
            new JobArtifactStore(),
            new BundleStorageService(emptyConfig),
            new ListJobsQueryValidator(),
            new JobProgressWriter(Db),
            RateLimiter);
    }

    public void ActAs(Guid? organizationId) => FakeTenant.SetOrganization(_httpContextAccessor, organizationId);

    /// <summary>
    /// Each call defaults to a distinct <c>RepoUrl</c> (via <paramref name="repoSuffix"/>) so
    /// concurrency-limit tests can create many jobs for one org without tripping the separate
    /// duplicate-active-job (same repo+branch) conflict check.
    /// </summary>
    public static CreateBrownfieldJobRequest ValidRequest(Guid githubConnectionId, Guid cursorCredentialId, string? repoSuffix = null) => new()
    {
        RepoUrl = $"https://github.com/acme/widgets-{repoSuffix ?? Guid.NewGuid().ToString("N")}",
        GitHubConnectionId = githubConnectionId,
        CursorCredentialId = cursorCredentialId,
        SddKitId = "csharp-sdd-starter-kit",
        Knowledge = new KnowledgeOptions { GranularityPrompt = "tokenize_class" },
    };

    public async Task<GitHubConnection> SeedGitHubConnectionAsync(Guid organizationId)
    {
        var connection = new GitHubConnection
        {
            Id = Guid.NewGuid(),
            OrganizationId = organizationId,
            HostType = "github.com",
            WebUrl = "https://github.com/acme/widgets",
            ApiBaseUrl = "https://api.github.com",
            KeyVaultSecretName = "gh-secret",
            CreatedAt = DateTime.UtcNow,
        };
        Db.GitHubConnections.Add(connection);
        await Db.SaveChangesAsync();
        return connection;
    }

    public async Task<CursorCredential> SeedCursorCredentialAsync(Guid organizationId)
    {
        var credential = new CursorCredential
        {
            Id = Guid.NewGuid(),
            OrganizationId = organizationId,
            KeyVaultSecretName = "cursor-secret",
            CreatedAt = DateTime.UtcNow,
        };
        Db.CursorCredentials.Add(credential);
        await Db.SaveChangesAsync();
        return credential;
    }
}
