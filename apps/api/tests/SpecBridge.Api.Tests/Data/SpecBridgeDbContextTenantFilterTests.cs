using Microsoft.EntityFrameworkCore;
using SpecBridge.Api.Data;
using SpecBridge.Api.Data.Entities;
using SpecBridge.Api.Services;
using SpecBridge.Api.Tests.TestSupport;
using Xunit;

namespace SpecBridge.Api.Tests.Data;

/// <summary>
/// Guards the tenant-isolation invariant that <see cref="SpecBridgeDbContext"/> must fail
/// closed: a missing/null tenant must see zero rows, never every organization's rows.
/// </summary>
public class SpecBridgeDbContextTenantFilterTests
{
    [Fact]
    public async Task WithNoTenantOnContext_QueryReturnsNoRows_NotEveryOrganizations()
    {
        var dbName = Guid.NewGuid().ToString();
        var orgA = Guid.NewGuid();
        var orgB = Guid.NewGuid();

        await SeedJobForOrgAsync(dbName, orgA, "https://github.com/acme/repo-a");
        await SeedJobForOrgAsync(dbName, orgB, "https://github.com/acme/repo-b");

        using var db = CreateContext(dbName, organizationId: null);

        var visibleJobs = await db.BrownfieldJobs.ToListAsync();

        Assert.Empty(visibleJobs);
    }

    [Fact]
    public async Task WithTenantOnContext_QueryReturnsOnlyThatOrganizationsRows()
    {
        var dbName = Guid.NewGuid().ToString();
        var orgA = Guid.NewGuid();
        var orgB = Guid.NewGuid();

        await SeedJobForOrgAsync(dbName, orgA, "https://github.com/acme/repo-a");
        await SeedJobForOrgAsync(dbName, orgB, "https://github.com/acme/repo-b");

        using var db = CreateContext(dbName, organizationId: orgA);

        var visibleJobs = await db.BrownfieldJobs.ToListAsync();

        Assert.Single(visibleJobs);
        Assert.Equal(orgA, visibleJobs[0].OrganizationId);
    }

    [Fact]
    public async Task IgnoreQueryFilters_StillAllowsExplicitCrossTenantLookupsForInternalCallers()
    {
        var dbName = Guid.NewGuid().ToString();
        var orgA = Guid.NewGuid();
        var orgB = Guid.NewGuid();

        await SeedJobForOrgAsync(dbName, orgA, "https://github.com/acme/repo-a");
        await SeedJobForOrgAsync(dbName, orgB, "https://github.com/acme/repo-b");

        using var db = CreateContext(dbName, organizationId: null);

        var allJobs = await db.BrownfieldJobs.IgnoreQueryFilters().ToListAsync();

        Assert.Equal(2, allJobs.Count);
    }

    private static async Task SeedJobForOrgAsync(string dbName, Guid organizationId, string repoUrl)
    {
        using var db = CreateContext(dbName, organizationId: null);
        db.BrownfieldJobs.Add(new BrownfieldJob
        {
            Id = Guid.NewGuid(),
            OrganizationId = organizationId,
            RepoUrl = repoUrl,
            Status = "queued",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();
    }

    private static SpecBridgeDbContext CreateContext(string dbName, Guid? organizationId)
    {
        var options = new DbContextOptionsBuilder<SpecBridgeDbContext>()
            .UseInMemoryDatabase(dbName)
            .Options;
        var tenantAccessor = new TenantContextAccessor(FakeTenant.AccessorFor(organizationId));
        return new SpecBridgeDbContext(options, tenantAccessor);
    }
}
