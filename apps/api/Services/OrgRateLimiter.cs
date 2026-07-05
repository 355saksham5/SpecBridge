namespace SpecBridge.Api.Services;

/// <summary>
/// Per-organization concurrency and throughput limiter: caps concurrent brownfield jobs
/// and Cursor agent invocations per rolling hour. Charging happens once, at the point a
/// job is actually accepted (not at the HTTP boundary), so rejected/invalid requests never
/// consume a slot.
/// </summary>
/// <remarks>
/// State is in-process only. Safe for a single API replica; back this with a shared store
/// (e.g. Redis) before scaling the API horizontally, or limits will be enforced per-instance.
/// </remarks>
public sealed class OrgRateLimiter
{
    public const int MaxConcurrentJobs = 10;
    public const int MaxAgentRunsPerHour = 50;
    private static readonly TimeSpan Window = TimeSpan.FromHours(1);

    private readonly Dictionary<Guid, OrgCounters> _counters = new();
    private readonly object _gate = new();

    /// <summary>Read-only check used at the HTTP boundary to fail fast without hitting the DB.</summary>
    public bool IsOverLimit(Guid orgId, out TimeSpan retryAfter)
    {
        lock (_gate)
        {
            var counters = GetOrCreate(orgId);
            PruneWindow(counters);
            retryAfter = ComputeRetryAfter(counters);
            return IsOverLimit(counters);
        }
    }

    /// <summary>
    /// Atomically checks and reserves one concurrent-job slot. Call only once a job is
    /// otherwise guaranteed to be created, so a rejected slot never leaks.
    /// </summary>
    public bool TryStartJob(Guid orgId, out TimeSpan retryAfter)
    {
        lock (_gate)
        {
            var counters = GetOrCreate(orgId);
            PruneWindow(counters);
            retryAfter = ComputeRetryAfter(counters);

            if (IsOverLimit(counters))
            {
                return false;
            }

            counters.ActiveJobs++;
            return true;
        }
    }

    /// <summary>Releases a concurrent-job slot when a job reaches a terminal state.</summary>
    public void CompleteJob(Guid orgId)
    {
        lock (_gate)
        {
            if (_counters.TryGetValue(orgId, out var counters))
            {
                counters.ActiveJobs = Math.Max(0, counters.ActiveJobs - 1);
            }
        }
    }

    /// <summary>Records one or more Cursor agent invocations against the org's hourly budget.</summary>
    public void RecordAgentRun(Guid orgId, int count = 1)
    {
        lock (_gate)
        {
            var counters = GetOrCreate(orgId);
            PruneWindow(counters);
            counters.AgentRunsInWindow += count;
        }
    }

    private static bool IsOverLimit(OrgCounters counters) =>
        counters.ActiveJobs >= MaxConcurrentJobs || counters.AgentRunsInWindow >= MaxAgentRunsPerHour;

    private static TimeSpan ComputeRetryAfter(OrgCounters counters)
    {
        var retryAfter = counters.WindowStartedAt.Add(Window) - DateTime.UtcNow;
        return retryAfter < TimeSpan.Zero ? TimeSpan.FromSeconds(60) : retryAfter;
    }

    private OrgCounters GetOrCreate(Guid orgId)
    {
        if (!_counters.TryGetValue(orgId, out var counters))
        {
            counters = new OrgCounters { WindowStartedAt = DateTime.UtcNow };
            _counters[orgId] = counters;
        }

        return counters;
    }

    private static void PruneWindow(OrgCounters counters)
    {
        if (DateTime.UtcNow - counters.WindowStartedAt >= Window)
        {
            counters.WindowStartedAt = DateTime.UtcNow;
            counters.AgentRunsInWindow = 0;
        }
    }

    private sealed class OrgCounters
    {
        public int ActiveJobs { get; set; }
        public int AgentRunsInWindow { get; set; }
        public DateTime WindowStartedAt { get; set; }
    }
}
