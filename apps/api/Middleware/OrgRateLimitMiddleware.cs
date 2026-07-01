namespace SpecBridge.Api.Middleware;

/// <summary>
/// In-memory per-org rate limiter for Phase 5.
/// Production should back this with Redis; limits match the plan:
/// 10 concurrent active jobs, 50 agent-run slots per rolling hour.
/// </summary>
public sealed class OrgRateLimitMiddleware
{
    private const int MaxConcurrentJobs = 10;
    private const int MaxAgentRunsPerHour = 50;
    private static readonly TimeSpan Window = TimeSpan.FromHours(1);

    private readonly RequestDelegate _next;
    private static readonly Dictionary<Guid, OrgCounters> Counters = new();
    private static readonly object Lock = new();

    public OrgRateLimitMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        if (!context.Request.Path.StartsWithSegments("/v1/brownfield-jobs", StringComparison.OrdinalIgnoreCase))
        {
            await _next(context);
            return;
        }

        if (context.Request.Method.Equals("POST", StringComparison.OrdinalIgnoreCase)
            && context.Request.Path.Equals("/v1/brownfield-jobs", StringComparison.OrdinalIgnoreCase))
        {
            var orgId = ResolveOrganizationId(context);
            if (orgId != Guid.Empty && IsOverLimit(orgId, out var retryAfter))
            {
                context.Response.Headers["Retry-After"] = ((int)Math.Ceiling(retryAfter.TotalSeconds)).ToString();
                context.Response.StatusCode = StatusCodes.Status429TooManyRequests;
                await context.Response.WriteAsJsonAsync(new
                {
                    title = "Rate limit exceeded",
                    detail = $"Organization has reached the limit of {MaxConcurrentJobs} concurrent jobs or {MaxAgentRunsPerHour} agent runs per hour.",
                    status = 429,
                });
                return;
            }

            if (orgId != Guid.Empty) RecordJobStart(orgId);
        }

        await _next(context);
    }

    internal static void RecordJobComplete(Guid orgId)
    {
        lock (Lock)
        {
            if (!Counters.TryGetValue(orgId, out var c)) return;
            c.ActiveJobs = Math.Max(0, c.ActiveJobs - 1);
        }
    }

    internal static void RecordAgentRun(Guid orgId, int count = 1)
    {
        lock (Lock)
        {
            var c = GetOrCreate(orgId);
            PruneWindow(c);
            c.AgentRunsInWindow += count;
        }
    }

    private static bool IsOverLimit(Guid orgId, out TimeSpan retryAfter)
    {
        lock (Lock)
        {
            var c = GetOrCreate(orgId);
            PruneWindow(c);
            retryAfter = c.WindowStartedAt.Add(Window) - DateTime.UtcNow;
            if (retryAfter < TimeSpan.Zero) retryAfter = TimeSpan.FromSeconds(60);
            return c.ActiveJobs >= MaxConcurrentJobs || c.AgentRunsInWindow >= MaxAgentRunsPerHour;
        }
    }

    private static void RecordJobStart(Guid orgId)
    {
        lock (Lock)
        {
            var c = GetOrCreate(orgId);
            PruneWindow(c);
            c.ActiveJobs++;
        }
    }

    private static OrgCounters GetOrCreate(Guid orgId)
    {
        if (!Counters.TryGetValue(orgId, out var c))
        {
            c = new OrgCounters { WindowStartedAt = DateTime.UtcNow };
            Counters[orgId] = c;
        }
        return c;
    }

    private static void PruneWindow(OrgCounters c)
    {
        if (DateTime.UtcNow - c.WindowStartedAt >= Window)
        {
            c.WindowStartedAt = DateTime.UtcNow;
            c.AgentRunsInWindow = 0;
        }
    }

    private static Guid ResolveOrganizationId(HttpContext context)
    {
        var claim = context.User.FindFirst("org_id")?.Value
            ?? context.User.FindFirst("extension_OrganizationId")?.Value;
        return Guid.TryParse(claim, out var id) ? id : Guid.Empty;
    }

    private sealed class OrgCounters
    {
        public int ActiveJobs { get; set; }
        public int AgentRunsInWindow { get; set; }
        public DateTime WindowStartedAt { get; set; }
    }
}
