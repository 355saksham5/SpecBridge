using SpecBridge.Api.Services;

namespace SpecBridge.Api.Middleware;

/// <summary>
/// Fast-fail guard for <c>POST /v1/brownfield-jobs</c>: rejects requests from orgs already
/// at their concurrency/throughput ceiling before they reach validation or the database.
/// The authoritative check-and-reserve happens in <see cref="OrgRateLimiter.TryStartJob"/>,
/// called from <c>BrownfieldJobService.CreateAsync</c> once the request is otherwise valid —
/// this middleware never itself consumes a slot.
/// </summary>
public sealed class OrgRateLimitMiddleware
{
    private readonly RequestDelegate _next;
    private readonly OrgRateLimiter _rateLimiter;

    public OrgRateLimitMiddleware(RequestDelegate next, OrgRateLimiter rateLimiter)
    {
        _next = next;
        _rateLimiter = rateLimiter;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (!IsJobCreationRequest(context))
        {
            await _next(context);
            return;
        }

        var orgId = ResolveOrganizationId(context);
        if (orgId != Guid.Empty && _rateLimiter.IsOverLimit(orgId, out var retryAfter))
        {
            await WriteRateLimitedAsync(context, retryAfter);
            return;
        }

        await _next(context);
    }

    private static bool IsJobCreationRequest(HttpContext context) =>
        context.Request.Method.Equals("POST", StringComparison.OrdinalIgnoreCase)
        && context.Request.Path.Equals("/v1/brownfield-jobs", StringComparison.OrdinalIgnoreCase);

    private static async Task WriteRateLimitedAsync(HttpContext context, TimeSpan retryAfter)
    {
        context.Response.Headers["Retry-After"] = ((int)Math.Ceiling(retryAfter.TotalSeconds)).ToString();
        context.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        await context.Response.WriteAsJsonAsync(new
        {
            title = "Rate limit exceeded",
            detail = $"Organization has reached the limit of {OrgRateLimiter.MaxConcurrentJobs} concurrent jobs or {OrgRateLimiter.MaxAgentRunsPerHour} agent runs per hour.",
            status = 429,
        });
    }

    private static Guid ResolveOrganizationId(HttpContext context)
    {
        var claim = context.User.FindFirst("org_id")?.Value
            ?? context.User.FindFirst("extension_OrganizationId")?.Value;
        return Guid.TryParse(claim, out var id) ? id : Guid.Empty;
    }
}
