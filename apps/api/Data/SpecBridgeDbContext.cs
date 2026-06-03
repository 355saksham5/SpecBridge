using Microsoft.EntityFrameworkCore;
using SpecBridge.Api.Data.Entities;

namespace SpecBridge.Api.Data;

/// <summary>
/// EF Core DbContext for SpecBridge database.
/// Supports PostgreSQL Flexible Server.
/// </summary>
public class SpecBridgeDbContext : DbContext
{
    public SpecBridgeDbContext(DbContextOptions<SpecBridgeDbContext> options)
        : base(options)
    {
    }

    // ===== Tables =====
    
    public DbSet<BrownfieldJob> BrownfieldJobs => Set<BrownfieldJob>();
    public DbSet<JobCommit> JobCommits => Set<JobCommit>();
    public DbSet<JobPhaseRun> JobPhaseRuns => Set<JobPhaseRun>();
    public DbSet<Organization> Organizations => Set<Organization>();
    public DbSet<CursorCredential> CursorCredentials => Set<CursorCredential>();
    public DbSet<GitHubConnection> GitHubConnections => Set<GitHubConnection>();
    public DbSet<JiraConnection> JiraConnections => Set<JiraConnection>();
    public DbSet<ConfluenceConnection> ConfluenceConnections => Set<ConfluenceConnection>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        
        // Apply entity configurations
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(SpecBridgeDbContext).Assembly);
        
        // Global query filters for tenant isolation
        modelBuilder.Entity<BrownfieldJob>().HasQueryFilter(j => EF.Property<Guid>(j, "OrganizationId") != Guid.Empty);
        modelBuilder.Entity<CursorCredential>().HasQueryFilter(c => EF.Property<Guid>(c, "OrganizationId") != Guid.Empty);
        modelBuilder.Entity<GitHubConnection>().HasQueryFilter(g => EF.Property<Guid>(g, "OrganizationId") != Guid.Empty);
        modelBuilder.Entity<JiraConnection>().HasQueryFilter(j => EF.Property<Guid>(j, "OrganizationId") != Guid.Empty);
        modelBuilder.Entity<ConfluenceConnection>().HasQueryFilter(c => EF.Property<Guid>(c, "OrganizationId") != Guid.Empty);
    }
}
