using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using SpecBridge.Api.Services;

namespace SpecBridge.Api.Data;

public sealed class SpecBridgeDbContextFactory : IDesignTimeDbContextFactory<SpecBridgeDbContext>
{
    public SpecBridgeDbContext CreateDbContext(string[] args)
    {
        var optionsBuilder = new DbContextOptionsBuilder<SpecBridgeDbContext>();
        optionsBuilder.UseNpgsql("Host=localhost;Database=specbridge;Username=postgres;Password=postgres");
        return new SpecBridgeDbContext(optionsBuilder.Options, new DesignTimeTenantAccessor());
    }

    private sealed class DesignTimeTenantAccessor : ITenantContextAccessor
    {
        public Guid? CurrentOrganizationId => null;
    }
}
