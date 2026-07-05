using Microsoft.EntityFrameworkCore;
using SpecBridge.Api.Data;
using SpecBridge.Api.Data.Entities;
using SpecBridge.Api.Services;

namespace SpecBridge.Api.Data;

public class SpecBridgeDbContext : DbContext
{
    private readonly ITenantContextAccessor _tenant;

    public SpecBridgeDbContext(DbContextOptions<SpecBridgeDbContext> options, ITenantContextAccessor tenant)
        : base(options)
    {
        _tenant = tenant;
    }

    /// <summary>Evaluated per query for EF global filters.</summary>
    private Guid? CurrentOrganizationId => _tenant.CurrentOrganizationId;

    public DbSet<BrownfieldJob> BrownfieldJobs => Set<BrownfieldJob>();
    public DbSet<JobCommit> JobCommits => Set<JobCommit>();
    public DbSet<JobPhaseRun> JobPhaseRuns => Set<JobPhaseRun>();
    public DbSet<JobEventRecord> JobEvents => Set<JobEventRecord>();
    public DbSet<Organization> Organizations => Set<Organization>();
    public DbSet<CursorCredential> CursorCredentials => Set<CursorCredential>();
    public DbSet<GitHubConnection> GitHubConnections => Set<GitHubConnection>();
    public DbSet<JiraConnection> JiraConnections => Set<JiraConnection>();
    public DbSet<ConfluenceConnection> ConfluenceConnections => Set<ConfluenceConnection>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(SpecBridgeDbContext).Assembly);

        // Fail closed: when there is no tenant on the accessor (e.g. a bug drops the org_id
        // claim), the filter must match zero rows, never every organization's rows. Code
        // paths that genuinely need cross-tenant access (internal/worker scopes) must opt in
        // explicitly via IgnoreQueryFilters() plus their own organization check.
        modelBuilder.Entity<BrownfieldJob>()
            .HasQueryFilter(j => j.OrganizationId == CurrentOrganizationId);
        modelBuilder.Entity<CursorCredential>()
            .HasQueryFilter(c => c.OrganizationId == CurrentOrganizationId);
        modelBuilder.Entity<GitHubConnection>()
            .HasQueryFilter(g => g.OrganizationId == CurrentOrganizationId);
        modelBuilder.Entity<JiraConnection>()
            .HasQueryFilter(j => j.OrganizationId == CurrentOrganizationId);
        modelBuilder.Entity<ConfluenceConnection>()
            .HasQueryFilter(c => c.OrganizationId == CurrentOrganizationId);
    }
}
