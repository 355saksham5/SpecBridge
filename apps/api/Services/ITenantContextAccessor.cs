namespace SpecBridge.Api.Services;

/// <summary>
/// Per-request tenant id for EF global query filters. Null for internal/worker scopes.
/// </summary>
public interface ITenantContextAccessor
{
    Guid? CurrentOrganizationId { get; }
}

public sealed class TenantContextAccessor(IHttpContextAccessor httpContextAccessor) : ITenantContextAccessor
{
    public Guid? CurrentOrganizationId
    {
        get
        {
            var claim = httpContextAccessor.HttpContext?.User.FindFirst("org_id")?.Value;
            return !string.IsNullOrWhiteSpace(claim) && Guid.TryParse(claim, out var orgId)
                ? orgId
                : null;
        }
    }
}
