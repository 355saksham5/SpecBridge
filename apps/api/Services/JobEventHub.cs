using System.Collections.Concurrent;
using System.Text.Json;
using System.Threading.Channels;

namespace SpecBridge.Api.Services;

public sealed record JobEvent(string EventType, string DataJson, DateTimeOffset Timestamp);

/// <summary>
/// In-process pub/sub for job SSE streams. Workers fan in via the internal events endpoint.
/// Buffers recent events for late-connecting clients; terminal on job_completed / job_failed.
/// </summary>
public sealed class JobEventHub
{
    private const int MaxBufferedEvents = 500;
    private static readonly HashSet<string> TerminalEvents = new(StringComparer.Ordinal)
    {
        "job_completed",
        "job_failed",
    };

    private readonly ConcurrentDictionary<Guid, JobEventState> _jobs = new();

    public JobEvent Publish(Guid jobId, string eventType, object data)
    {
        var json = JsonSerializer.Serialize(data);
        var jobEvent = new JobEvent(eventType, json, DateTimeOffset.UtcNow);
        var state = _jobs.GetOrAdd(jobId, _ => new JobEventState());

        lock (state.Sync)
        {
            state.History.Add(jobEvent);
            if (state.History.Count > MaxBufferedEvents)
            {
                state.History.RemoveAt(0);
            }

            if (TerminalEvents.Contains(eventType))
            {
                state.IsTerminal = true;
            }

            state.Live.Writer.TryWrite(jobEvent);
        }

        return jobEvent;
    }

    public IReadOnlyList<JobEvent> GetHistory(Guid jobId)
    {
        if (!_jobs.TryGetValue(jobId, out var state))
        {
            return Array.Empty<JobEvent>();
        }

        lock (state.Sync)
        {
            return state.History.ToArray();
        }
    }

    public bool IsTerminal(Guid jobId)
    {
        return _jobs.TryGetValue(jobId, out var state) && state.IsTerminal;
    }

    public async IAsyncEnumerable<JobEvent> SubscribeAsync(
        Guid jobId,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var state = _jobs.GetOrAdd(jobId, _ => new JobEventState());
        List<JobEvent> snapshot;

        lock (state.Sync)
        {
            snapshot = state.History.ToList();
        }

        foreach (var existing in snapshot)
        {
            yield return existing;
            if (TerminalEvents.Contains(existing.EventType))
            {
                yield break;
            }
        }

        if (state.IsTerminal)
        {
            yield break;
        }

        await foreach (var live in state.Live.Reader.ReadAllAsync(cancellationToken))
        {
            yield return live;
            if (TerminalEvents.Contains(live.EventType))
            {
                yield break;
            }
        }
    }

    private sealed class JobEventState
    {
        public object Sync { get; } = new();
        public List<JobEvent> History { get; } = new();
        public Channel<JobEvent> Live { get; } = Channel.CreateUnbounded<JobEvent>(
            new UnboundedChannelOptions { SingleReader = false, SingleWriter = false });
        public bool IsTerminal { get; set; }
    }
}
