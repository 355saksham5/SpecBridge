using System.Security.Claims;
using Microsoft.AspNetCore.Http;

namespace SpecBridge.Api.Tests.TestSupport;

/// <summary>
/// Builds an <see cref="IHttpContextAccessor"/> whose current organization claim can be
/// swapped between calls, so a single instance can drive both <c>TenantContext</c> and
/// <c>ITenantContextAccessor</c> (mirroring how both read the same per-request HttpContext).
/// </summary>
internal static class FakeTenant
{
    public static IHttpContextAccessor AccessorFor(Guid? organizationId)
    {
        return new HttpContextAccessor { HttpContext = ContextFor(organizationId) };
    }

    public static void SetOrganization(IHttpContextAccessor accessor, Guid? organizationId)
    {
        accessor.HttpContext = ContextFor(organizationId);
    }

    private static HttpContext ContextFor(Guid? organizationId)
    {
        var context = new DefaultHttpContext();
        if (organizationId is { } id)
        {
            var identity = new ClaimsIdentity([new Claim("org_id", id.ToString())], "test");
            context.User = new ClaimsPrincipal(identity);
        }

        return context;
    }
}
