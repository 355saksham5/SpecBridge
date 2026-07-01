namespace SpecBridge.Api.Services;

/// <summary>
/// Tracks in-flight job cancellation requests. The worker polls this via
/// Service Bus cancel messages or shared state in production; Phase 5 keeps
/// an in-process registry for the API cancel endpoint skeleton.
/// </summary>
public sealed class JobCancellationRegistry
{
    private readonly HashSet<Guid> _cancelled = new();
    private readonly object _lock = new();

    public void RequestCancel(Guid jobId)
    {
        lock (_lock) _cancelled.Add(jobId);
    }

    public bool IsCancelled(Guid jobId)
    {
        lock (_lock) return _cancelled.Contains(jobId);
    }

    public void Clear(Guid jobId)
    {
        lock (_lock) _cancelled.Remove(jobId);
    }
}
