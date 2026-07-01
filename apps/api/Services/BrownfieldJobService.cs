using System.Text.Json;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SpecBridge.Api.Contracts;
using SpecBridge.Api.Data;
using SpecBridge.Api.Data.Entities;

namespace SpecBridge.Api.Services;

public sealed class BrownfieldJobService
{
    private static readonly HashSet<string> AllowedEventTypes = new(StringComparer.Ordinal)
    {
        "phase_started",
        "agent_started",
        "agent_completed",
        "agent_handoff_written",
        "commit_skipped",
        "shard_written",
        "audit_verdict",
        "bundle_ready",
        "job_completed",
        "job_failed",
    };

    private readonly SpecBridgeDbContext _db;
    private readonly BrownfieldJobQueue _queue;
    private readonly IValidator<CreateBrownfieldJobRequest> _validator;
    private readonly TenantContext _tenantContext;
    private readonly JobEventHub _eventHub;
    private readonly JobArtifactStore _artifactStore;

    public BrownfieldJobService(
        SpecBridgeDbContext db,
        BrownfieldJobQueue queue,
        IValidator<CreateBrownfieldJobRequest> validator,
        TenantContext tenantContext,
        JobEventHub eventHub,
        JobArtifactStore artifactStore)
    {
        _db = db;
        _queue = queue;
        _validator = validator;
        _tenantContext = tenantContext;
        _eventHub = eventHub;
        _artifactStore = artifactStore;
    }

    public async Task<(BrownfieldJob? Job, IReadOnlyDictionary<string, string[]>? Errors, int StatusCode, string? Detail)> CreateAsync(
        CreateBrownfieldJobRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!_tenantContext.TryGetOrganizationId(out var organizationId))
        {
            return (null, null, StatusCodes.Status403Forbidden, "Missing org_id claim on authenticated principal.");
        }

        var validation = await _validator.ValidateAsync(request, cancellationToken);
        if (!validation.IsValid)
        {
            return (null, validation.ToDictionary(), StatusCodes.Status400BadRequest, null);
        }

        var githubExists = await _db.GitHubConnections
            .IgnoreQueryFilters()
            .AnyAsync(
                g => g.Id == request.GitHubConnectionId && g.OrganizationId == organizationId,
                cancellationToken);

        if (!githubExists)
        {
            return (null, new Dictionary<string, string[]>
            {
                ["githubConnectionId"] = ["GitHub connection not found for this organization."],
            }, StatusCodes.Status400BadRequest, null);
        }

        var cursorExists = await _db.CursorCredentials
            .IgnoreQueryFilters()
            .AnyAsync(
                c => c.Id == request.CursorCredentialId && c.OrganizationId == organizationId,
                cancellationToken);

        if (!cursorExists)
        {
            return (null, new Dictionary<string, string[]>
            {
                ["cursorCredentialId"] = ["Cursor credential not found for this organization."],
            }, StatusCodes.Status400BadRequest, null);
        }

        if (request.Jira?.ConnectionId is Guid jiraConnectionId)
        {
            var jiraExists = await _db.JiraConnections
                .IgnoreQueryFilters()
                .AnyAsync(
                    j => j.Id == jiraConnectionId && j.OrganizationId == organizationId,
                    cancellationToken);

            if (!jiraExists)
            {
                return (null, new Dictionary<string, string[]>
                {
                    ["jira.connectionId"] = ["Jira connection not found for this organization."],
                }, StatusCodes.Status400BadRequest, null);
            }
        }

        var jobId = Guid.NewGuid();
        var now = DateTime.UtcNow;
        var job = new BrownfieldJob
        {
            Id = jobId,
            OrganizationId = organizationId,
            RepoUrl = request.RepoUrl.Trim(),
            Status = "queued",
            CreatedAt = now,
            UpdatedAt = now,
        };

        _db.BrownfieldJobs.Add(job);
        await _db.SaveChangesAsync(cancellationToken);

        _eventHub.Publish(jobId, "phase_started", new { phase = "queued", jobId });

        var workerMessage = BuildWorkerMessage(jobId, organizationId, request);
        if (_queue.IsConfigured)
        {
            await _queue.EnqueueAsync(workerMessage, cancellationToken);
        }

        return (job, null, StatusCodes.Status202Accepted, null);
    }

    public async Task<(BrownfieldJob? Job, int StatusCode)> GetByIdAsync(
        Guid jobId,
        CancellationToken cancellationToken = default)
    {
        if (!_tenantContext.TryGetOrganizationId(out var organizationId))
        {
            return (null, StatusCodes.Status403Forbidden);
        }

        var job = await FindJobAsync(jobId, organizationId, cancellationToken);
        if (job is null)
        {
            return (null, StatusCodes.Status404NotFound);
        }

        return (job, StatusCodes.Status200OK);
    }

    public async Task<(bool Accepted, int StatusCode, string? Detail)> PublishWorkerEventAsync(
        Guid jobId,
        PublishJobEventRequest request,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.EventType) || request.EventType.Length > 64)
        {
            return (false, StatusCodes.Status400BadRequest, "eventType is required and must be at most 64 characters.");
        }

        if (!AllowedEventTypes.Contains(request.EventType))
        {
            return (false, StatusCodes.Status400BadRequest, $"Unsupported eventType '{request.EventType}'.");
        }

        if (request.Payload.Count > 100)
        {
            return (false, StatusCodes.Status400BadRequest, "payload may contain at most 100 keys.");
        }

        var job = await _db.BrownfieldJobs
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(j => j.Id == jobId, cancellationToken);

        if (job is null)
        {
            return (false, StatusCodes.Status404NotFound, "Job not found.");
        }

        var payload = new Dictionary<string, object?>(request.Payload)
        {
            ["jobId"] = jobId,
            ["ts"] = DateTime.UtcNow,
        };

        var published = _eventHub.Publish(jobId, request.EventType, payload);
        _artifactStore.RecordEvent(jobId, request.EventType, published.DataJson);
        await ApplyEventToJobAsync(job, request.EventType, payload, cancellationToken);

        return (true, StatusCodes.Status202Accepted, null);
    }

    public async Task<(string? RedirectUrl, int StatusCode, string? Detail)> GetBundleRedirectAsync(
        Guid jobId,
        CancellationToken cancellationToken = default)
    {
        var (job, statusCode) = await GetByIdAsync(jobId, cancellationToken);
        if (job is null)
        {
            return (null, statusCode, statusCode == StatusCodes.Status403Forbidden
                ? "Missing org_id claim on authenticated principal."
                : "Job not found.");
        }

        var artifacts = _artifactStore.Get(jobId);
        if (!string.IsNullOrWhiteSpace(artifacts?.BundleUrl))
        {
            return (artifacts.BundleUrl, StatusCodes.Status302Found, null);
        }

        if (!string.Equals(job.Status, "completed", StringComparison.OrdinalIgnoreCase))
        {
            return (null, StatusCodes.Status409Conflict, "Bundle is not ready — job has not completed.");
        }

        return (null, StatusCodes.Status404NotFound, "No bundle URL recorded for this job.");
    }

    public async Task<(object? Report, int StatusCode, string? Detail)> GetReportAsync(
        Guid jobId,
        CancellationToken cancellationToken = default)
    {
        var (job, statusCode) = await GetByIdAsync(jobId, cancellationToken);
        if (job is null)
        {
            return (null, statusCode, statusCode == StatusCodes.Status403Forbidden
                ? "Missing org_id claim on authenticated principal."
                : "Job not found.");
        }

        var artifacts = _artifactStore.Get(jobId);
        if (!string.IsNullOrWhiteSpace(artifacts?.QualityReportJson))
        {
            using var doc = JsonDocument.Parse(artifacts.QualityReportJson);
            var metrics = doc.RootElement.TryGetProperty("metrics", out var metricsEl)
                ? metricsEl
                : doc.RootElement;

            return (BuildReportFromMetrics(job, metrics), StatusCodes.Status200OK, null);
        }

        if (job.TokenEstimateStart is null && job.MeanQaScore is null)
        {
            return (null, StatusCodes.Status404NotFound, "Quality report not available yet.");
        }

        return (BuildReportFromJob(job), StatusCodes.Status200OK, null);
    }

    private async Task ApplyEventToJobAsync(
        BrownfieldJob job,
        string eventType,
        Dictionary<string, object?> payload,
        CancellationToken cancellationToken)
    {
        job.UpdatedAt = DateTime.UtcNow;

        switch (eventType)
        {
            case "phase_started":
                if (payload.TryGetValue("phase", out var phase) && phase is string phaseName)
                {
                    job.Status = phaseName;
                    job.CurrentPhase = phaseName;
                }
                break;

            case "agent_started":
                if (payload.TryGetValue("agentRole", out var role) && role is string agentRole)
                {
                    job.CurrentAgentRole = agentRole;
                }

                if (payload.TryGetValue("commitSha", out var sha) && sha is string commitSha)
                {
                    job.CurrentCommitSha = commitSha;
                }
                break;

            case "commit_skipped":
                job.CommitsSkipped += 1;
                break;

            case "audit_verdict":
                job.CommitsProcessed += 1;
                break;

            case "job_completed":
                job.Status = "completed";
                job.CurrentPhase = null;
                job.CurrentAgentRole = null;
                ApplyCompletionMetrics(job, payload);
                if (payload.TryGetValue("prUrl", out var prUrl) && prUrl is string url)
                {
                    job.PrUrl = url;
                }
                break;

            case "job_failed":
                job.Status = "failed";
                job.CurrentPhase = null;
                job.CurrentAgentRole = null;
                break;
        }

        await _db.SaveChangesAsync(cancellationToken);
    }

    private static void ApplyCompletionMetrics(BrownfieldJob job, Dictionary<string, object?> payload)
    {
        if (!payload.TryGetValue("metrics", out var metricsObj) || metricsObj is null)
        {
            return;
        }

        if (metricsObj is JsonElement jsonMetrics)
        {
            ApplyMetricsElement(job, jsonMetrics);
            return;
        }

        if (metricsObj is Dictionary<string, object?> dict)
        {
            if (dict.TryGetValue("tokenEstimateStart", out var start) && TryToInt(start, out var startInt))
            {
                job.TokenEstimateStart = startInt;
            }

            if (dict.TryGetValue("tokenEstimateEnd", out var end) && TryToInt(end, out var endInt))
            {
                job.TokenEstimateCurrent = endInt;
            }

            if (dict.TryGetValue("meanQaScore", out var qa) && TryToFloat(qa, out var qaScore))
            {
                job.MeanQaScore = qaScore;
            }

            if (dict.TryGetValue("commitsProcessed", out var processed) && TryToInt(processed, out var processedInt))
            {
                job.CommitsProcessed = processedInt;
            }

            if (dict.TryGetValue("commitsSkipped", out var skipped) && TryToInt(skipped, out var skippedInt))
            {
                job.CommitsSkipped = skippedInt;
            }

            if (dict.TryGetValue("prUrl", out var prUrl) && prUrl is string url)
            {
                job.PrUrl = url;
            }
        }
    }

    private static void ApplyMetricsElement(BrownfieldJob job, JsonElement metrics)
    {
        if (metrics.TryGetProperty("tokenEstimateStart", out var start) && start.TryGetInt32(out var startInt))
        {
            job.TokenEstimateStart = startInt;
        }

        if (metrics.TryGetProperty("tokenEstimateEnd", out var end) && end.TryGetInt32(out var endInt))
        {
            job.TokenEstimateCurrent = endInt;
        }

        if (metrics.TryGetProperty("meanQaScore", out var qa) && qa.TryGetSingle(out var qaScore))
        {
            job.MeanQaScore = qaScore;
        }

        if (metrics.TryGetProperty("commitsProcessed", out var processed) && processed.TryGetInt32(out var processedInt))
        {
            job.CommitsProcessed = processedInt;
        }

        if (metrics.TryGetProperty("commitsSkipped", out var skipped) && skipped.TryGetInt32(out var skippedInt))
        {
            job.CommitsSkipped = skippedInt;
        }

        if (metrics.TryGetProperty("prUrl", out var prUrl) && prUrl.ValueKind == JsonValueKind.String)
        {
            job.PrUrl = prUrl.GetString();
        }
    }

    private static object BuildReportFromMetrics(BrownfieldJob job, JsonElement metrics)
    {
        return new
        {
            jobId = job.Id,
            repoUrl = job.RepoUrl,
            headSha = job.HeadSha,
            tokenEstimateStart = metrics.TryGetProperty("tokenEstimateStart", out var s) && s.TryGetInt32(out var si) ? si : job.TokenEstimateStart,
            tokenEstimateEnd = metrics.TryGetProperty("tokenEstimateEnd", out var e) && e.TryGetInt32(out var ei) ? ei : job.TokenEstimateCurrent,
            tokenReduction = metrics.TryGetProperty("tokenReduction", out var r) && r.ValueKind == JsonValueKind.String ? r.GetString() : null,
            meanQaScore = metrics.TryGetProperty("meanQaScore", out var q) && q.TryGetSingle(out var qf) ? qf : job.MeanQaScore,
            calibrationOverlapMean = metrics.TryGetProperty("calibrationOverlapMean", out var c) && c.TryGetSingle(out var cf) ? (float?)cf : null,
            commitsProcessed = metrics.TryGetProperty("commitsProcessed", out var p) && p.TryGetInt32(out var pi) ? pi : job.CommitsProcessed,
            commitsSkipped = metrics.TryGetProperty("commitsSkipped", out var sk) && sk.TryGetInt32(out var ski) ? ski : job.CommitsSkipped,
            tokenCurve = Array.Empty<object>(),
        };
    }

    private static object BuildReportFromJob(BrownfieldJob job) => new
    {
        jobId = job.Id,
        repoUrl = job.RepoUrl,
        headSha = job.HeadSha,
        tokenEstimateStart = job.TokenEstimateStart,
        tokenEstimateEnd = job.TokenEstimateCurrent,
        meanQaScore = job.MeanQaScore,
        commitsProcessed = job.CommitsProcessed,
        commitsSkipped = job.CommitsSkipped,
        tokenCurve = Array.Empty<object>(),
    };

    private async Task<BrownfieldJob?> FindJobAsync(Guid jobId, Guid organizationId, CancellationToken cancellationToken) =>
        await _db.BrownfieldJobs
            .IgnoreQueryFilters()
            .AsNoTracking()
            .FirstOrDefaultAsync(j => j.Id == jobId && j.OrganizationId == organizationId, cancellationToken);

    internal static object BuildWorkerMessage(Guid jobId, Guid organizationId, CreateBrownfieldJobRequest request)
    {
        var history = request.History ?? new HistoryOptions();
        var knowledge = request.Knowledge!;
        var validation = request.Validation ?? new ValidationOptions();
        var delivery = request.Delivery ?? new DeliveryOptions();
        var jira = request.Jira;

        return new
        {
            jobId,
            organizationId,
            options = new
            {
                repoUrl = request.RepoUrl.Trim(),
                branch = string.IsNullOrWhiteSpace(request.DefaultBranch) ? "main" : request.DefaultBranch.Trim(),
                headSha = "HEAD",
                granularityPrompt = knowledge.GranularityPrompt,
                advisorPrompt = knowledge.AdvisorPrompt,
                maxShardTokens = knowledge.MaxShardTokens,
                commitDepth = history.CommitDepth,
                walkOrder = history.WalkOrder,
                issueKeyPattern = jira?.IssueKeyPattern,
                extractFrom = jira?.ExtractFrom,
                sddKit = new
                {
                    id = request.SddKitId,
                    version = request.SddKitVersion ?? "1.0.0",
                },
                validation = new
                {
                    devilsAdvocateQuestionCount = validation.DevilsAdvocateQuestionCount,
                    minAnswerScore = validation.MinAnswerScore,
                    maxRoundsPerCommit = validation.MaxRoundsPerCommit,
                },
                delivery = new
                {
                    openPr = delivery.OpenPr,
                    prTitle = delivery.PrTitle,
                    prBranch = delivery.PrBranch,
                },
                confluencePageIds = knowledge.IncludeConfluencePageIds,
                excludePathPatterns = knowledge.ExcludePathPatterns,
                requestSnapshot = JsonSerializer.Serialize(request),
            },
        };
    }

    private static bool TryToInt(object? value, out int result)
    {
        result = 0;
        return value switch
        {
            int i => (result = i) == i,
            long l when l <= int.MaxValue => (result = (int)l) == (int)l,
            JsonElement el when el.TryGetInt32(out result) => true,
            _ => false,
        };
    }

    private static bool TryToFloat(object? value, out float result)
    {
        result = 0;
        return value switch
        {
            float f => (result = f) == f,
            double d => (result = (float)d) == (float)d,
            JsonElement el when el.TryGetSingle(out result) => true,
            _ => false,
        };
    }
}
