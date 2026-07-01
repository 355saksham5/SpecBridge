namespace SpecBridge.Api.Services;

/// <summary>
/// Resolves tenant identity from the authenticated JWT.
/// </summary>
public sealed class TenantContext(IHttpContextAccessor httpContextAccessor)
{
    public bool TryGetOrganizationId(out Guid organizationId)
    {
        organizationId = Guid.Empty;
        var claim = httpContextAccessor.HttpContext?.User.FindFirst("org_id")?.Value;
        return !string.IsNullOrWhiteSpace(claim) && Guid.TryParse(claim, out organizationId);
    }

    public Guid RequireOrganizationId()
    {
        if (!TryGetOrganizationId(out var organizationId))
        {
            throw new InvalidOperationException("Authenticated principal is missing org_id claim.");
        }

        return organizationId;
    }
}
