using System.Text.Json;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SpecBridge.Api.Contracts;
using SpecBridge.Api.Data;
using SpecBridge.Api.Data.Entities;

namespace SpecBridge.Api.Services;

public sealed class BrownfieldJobService
{
    private readonly SpecBridgeDbContext _db;
    private readonly BrownfieldJobQueue _queue;
    private readonly IValidator<CreateBrownfieldJobRequest> _validator;
    private readonly TenantContext _tenantContext;

    public BrownfieldJobService(
        SpecBridgeDbContext db,
        BrownfieldJobQueue queue,
        IValidator<CreateBrownfieldJobRequest> validator,
        TenantContext tenantContext)
    {
        _db = db;
        _queue = queue;
        _validator = validator;
        _tenantContext = tenantContext;
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

        var job = await _db.BrownfieldJobs
            .IgnoreQueryFilters()
            .AsNoTracking()
            .FirstOrDefaultAsync(
                j => j.Id == jobId && j.OrganizationId == organizationId,
                cancellationToken);

        if (job is null)
        {
            return (null, StatusCodes.Status404NotFound);
        }

        return (job, StatusCodes.Status200OK);
    }

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
}
