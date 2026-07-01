using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SpecBridge.Api.Data;
using SpecBridge.Api.Data.Entities;

namespace SpecBridge.Api.Services;

/// <summary>
/// Persists job_commits, job_phase_runs, and job_events from worker SSE payloads.
/// </summary>
public sealed class JobProgressWriter
{
    private const int MaxEventJsonLength = 32_768;
    private readonly SpecBridgeDbContext _db;

    public JobProgressWriter(SpecBridgeDbContext db)
    {
        _db = db;
    }

    public async Task PersistEventAsync(
        Guid jobId,
        string eventType,
        string dataJson,
        Dictionary<string, object?> payload,
        CancellationToken cancellationToken = default)
    {
        var trimmedJson = dataJson.Length > MaxEventJsonLength
            ? dataJson[..MaxEventJsonLength]
            : dataJson;

        _db.JobEvents.Add(new JobEventRecord
        {
            Id = Guid.NewGuid(),
            BrownfieldJobId = jobId,
            EventType = eventType,
            DataJson = trimmedJson,
            CreatedAt = DateTime.UtcNow,
        });

        switch (eventType)
        {
            case "commit_skipped":
                await RecordCommitSkippedAsync(jobId, payload, cancellationToken);
                break;
            case "agent_started":
                await RecordAgentStartedAsync(jobId, payload, cancellationToken);
                break;
            case "agent_completed":
                await RecordAgentCompletedAsync(jobId, payload, cancellationToken);
                break;
        }

        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<JobEvent>> LoadEventsAsync(Guid jobId, CancellationToken cancellationToken = default)
    {
        var rows = await _db.JobEvents
            .AsNoTracking()
            .Where(e => e.BrownfieldJobId == jobId)
            .OrderBy(e => e.CreatedAt)
            .Take(500)
            .ToListAsync(cancellationToken);

        return rows
            .Select(r => new JobEvent(r.EventType, r.DataJson, new DateTimeOffset(r.CreatedAt, TimeSpan.Zero)))
            .ToArray();
    }

    private async Task RecordCommitSkippedAsync(
        Guid jobId,
        Dictionary<string, object?> payload,
        CancellationToken cancellationToken)
    {
        if (!TryGetString(payload, "commitSha", out var commitSha))
        {
            return;
        }

        _db.JobCommits.Add(new JobCommit
        {
            Id = Guid.NewGuid(),
            BrownfieldJobId = jobId,
            CommitSha = commitSha!,
            Processed = false,
            SkipReason = TryGetString(payload, "reason", out var reason) ? reason : "skipped",
            CreatedAt = DateTime.UtcNow,
        });

        await Task.CompletedTask;
    }

    private Task RecordAgentStartedAsync(Guid jobId, Dictionary<string, object?> payload, CancellationToken cancellationToken)
    {
        if (!TryGetString(payload, "agentRole", out var agentRole))
        {
            return Task.CompletedTask;
        }

        _db.JobPhaseRuns.Add(new JobPhaseRun
        {
            Id = Guid.NewGuid(),
            BrownfieldJobId = jobId,
            AgentRole = agentRole!,
            CommitSha = TryGetString(payload, "commitSha", out var sha) ? sha : null,
            CursorRunId = TryGetString(payload, "runId", out var runId) ? runId
                : TryGetString(payload, "cursorRunId", out var cursorRunId) ? cursorRunId : null,
            StartedAt = DateTime.UtcNow,
        });

        return Task.CompletedTask;
    }

    private async Task RecordAgentCompletedAsync(
        Guid jobId,
        Dictionary<string, object?> payload,
        CancellationToken cancellationToken)
    {
        if (!TryGetString(payload, "agentRole", out var agentRole))
        {
            return;
        }

        var commitSha = TryGetString(payload, "commitSha", out var sha) ? sha : null;
        var runId = TryGetString(payload, "runId", out var rid) ? rid
            : TryGetString(payload, "cursorRunId", out var crid) ? crid : null;

        var query = _db.JobPhaseRuns
            .Where(r => r.BrownfieldJobId == jobId && r.AgentRole == agentRole && r.CompletedAt == null);

        if (!string.IsNullOrWhiteSpace(runId))
        {
            query = query.Where(r => r.CursorRunId == runId);
        }
        else if (!string.IsNullOrWhiteSpace(commitSha))
        {
            query = query.Where(r => r.CommitSha == commitSha);
        }

        var phaseRun = await query
            .OrderByDescending(r => r.StartedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (phaseRun is null)
        {
            phaseRun = new JobPhaseRun
            {
                Id = Guid.NewGuid(),
                BrownfieldJobId = jobId,
                AgentRole = agentRole!,
                CommitSha = commitSha,
                CursorRunId = runId,
                StartedAt = DateTime.UtcNow,
            };
            _db.JobPhaseRuns.Add(phaseRun);
        }

        phaseRun.CompletedAt = DateTime.UtcNow;
        if (TryGetInt(payload, "tokensIn", out var tokensIn))
        {
            phaseRun.TokensIn = tokensIn;
        }

        if (TryGetInt(payload, "tokensOut", out var tokensOut))
        {
            phaseRun.TokensOut = tokensOut;
        }

        if (TryGetInt(payload, "durationMs", out var durationMs))
        {
            phaseRun.DurationMs = durationMs;
        }
    }

    private static bool TryGetString(Dictionary<string, object?> payload, string key, out string? value)
    {
        value = null;
        if (!payload.TryGetValue(key, out var raw) || raw is null)
        {
            return false;
        }

        value = raw switch
        {
            string s => s,
            JsonElement el when el.ValueKind == JsonValueKind.String => el.GetString(),
            _ => null,
        };

        return !string.IsNullOrWhiteSpace(value);
    }

    private static bool TryGetInt(Dictionary<string, object?> payload, string key, out int value)
    {
        value = 0;
        if (!payload.TryGetValue(key, out var raw) || raw is null)
        {
            return false;
        }

        return raw switch
        {
            int i => (value = i) == i,
            long l when l <= int.MaxValue => (value = (int)l) == (int)l,
            JsonElement el when el.TryGetInt32(out value) => true,
            _ => false,
        };
    }
}
