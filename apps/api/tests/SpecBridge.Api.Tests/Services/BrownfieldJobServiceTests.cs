using Microsoft.AspNetCore.Http;
using SpecBridge.Api.Contracts;
using SpecBridge.Api.Services;
using SpecBridge.Api.Tests.TestSupport;
using Xunit;

namespace SpecBridge.Api.Tests.Services;

public class BrownfieldJobServiceTests
{
    [Fact]
    public async Task CreateAsync_RejectsTheEleventhConcurrentJob_ThenAcceptsAgainAfterOneCompletes()
    {
        var orgId = Guid.NewGuid();
        var harness = new BrownfieldJobServiceHarness(orgId);
        var github = await harness.SeedGitHubConnectionAsync(orgId);
        var cursor = await harness.SeedCursorCredentialAsync(orgId);

        var createdJobIds = new List<Guid>();
        for (var i = 0; i < OrgRateLimiter.MaxConcurrentJobs; i++)
        {
            var request = BrownfieldJobServiceHarness.ValidRequest(github.Id, cursor.Id, repoSuffix: $"job-{i}");
            var (job, errors, statusCode, _, _) = await harness.Service.CreateAsync(request);

            Assert.Null(errors);
            Assert.Equal(StatusCodes.Status202Accepted, statusCode);
            Assert.NotNull(job);
            createdJobIds.Add(job!.Id);
        }

        var overLimitRequest = BrownfieldJobServiceHarness.ValidRequest(github.Id, cursor.Id, repoSuffix: "one-too-many");
        var (blockedJob, blockedErrors, blockedStatus, _, retryAfter) = await harness.Service.CreateAsync(overLimitRequest);

        Assert.Null(blockedJob);
        Assert.Null(blockedErrors);
        Assert.Equal(StatusCodes.Status429TooManyRequests, blockedStatus);
        Assert.NotNull(retryAfter);

        await harness.Service.PublishWorkerEventAsync(createdJobIds[0], new PublishJobEventRequest
        {
            EventType = "job_completed",
            Payload = new Dictionary<string, object?>(),
        });

        var (freedJob, freedErrors, freedStatus, _, _) = await harness.Service.CreateAsync(overLimitRequest);

        Assert.Null(freedErrors);
        Assert.Equal(StatusCodes.Status202Accepted, freedStatus);
        Assert.NotNull(freedJob);
    }

    [Fact]
    public async Task CreateAsync_DoesNotChargeTheRateLimit_WhenRequestFailsValidation()
    {
        var orgId = Guid.NewGuid();
        var harness = new BrownfieldJobServiceHarness(orgId);
        var github = await harness.SeedGitHubConnectionAsync(orgId);
        var cursor = await harness.SeedCursorCredentialAsync(orgId);

        for (var i = 0; i < 20; i++)
        {
            var badRequest = BrownfieldJobServiceHarness.ValidRequest(Guid.NewGuid(), Guid.NewGuid(), repoSuffix: $"bad-{i}");
            var (job, errors, statusCode, _, _) = await harness.Service.CreateAsync(badRequest);

            Assert.Null(job);
            Assert.NotNull(errors);
            Assert.Equal(StatusCodes.Status400BadRequest, statusCode);
        }

        for (var i = 0; i < OrgRateLimiter.MaxConcurrentJobs; i++)
        {
            var validRequest = BrownfieldJobServiceHarness.ValidRequest(github.Id, cursor.Id, repoSuffix: $"good-{i}");
            var (job, errors, statusCode, _, _) = await harness.Service.CreateAsync(validRequest);

            Assert.Null(errors);
            Assert.Equal(StatusCodes.Status202Accepted, statusCode);
            Assert.NotNull(job);
        }
    }

    [Fact]
    public async Task CreateAsync_RecordsAgentRuns_AgainstTheHourlyBudget()
    {
        var orgId = Guid.NewGuid();
        var harness = new BrownfieldJobServiceHarness(orgId);
        var github = await harness.SeedGitHubConnectionAsync(orgId);
        var cursor = await harness.SeedCursorCredentialAsync(orgId);

        var request = BrownfieldJobServiceHarness.ValidRequest(github.Id, cursor.Id);
        var (job, _, statusCode, _, _) = await harness.Service.CreateAsync(request);
        Assert.Equal(StatusCodes.Status202Accepted, statusCode);

        await harness.Service.PublishWorkerEventAsync(job!.Id, new PublishJobEventRequest
        {
            EventType = "agent_started",
            Payload = new Dictionary<string, object?> { ["agentRole"] = "knowledge-architect" },
        });

        Assert.True(harness.RateLimiter.IsOverLimit(orgId, out _) == false);
        harness.RateLimiter.RecordAgentRun(orgId, OrgRateLimiter.MaxAgentRunsPerHour - 1);
        Assert.True(harness.RateLimiter.IsOverLimit(orgId, out _));
    }

    [Fact]
    public async Task GetBundleRedirectAsync_NeverRedirectsToAWorkerSuppliedRawUrl()
    {
        var orgId = Guid.NewGuid();
        var harness = new BrownfieldJobServiceHarness(orgId);
        var github = await harness.SeedGitHubConnectionAsync(orgId);
        var cursor = await harness.SeedCursorCredentialAsync(orgId);

        var request = BrownfieldJobServiceHarness.ValidRequest(github.Id, cursor.Id);
        var (job, _, _, _, _) = await harness.Service.CreateAsync(request);

        // Simulate a malicious or compromised worker publishing an event with an
        // attacker-controlled bundleUrl. No blob storage is configured in this harness,
        // so the only remaining redirect path used to be this raw URL fallback.
        await harness.Service.PublishWorkerEventAsync(job!.Id, new PublishJobEventRequest
        {
            EventType = "bundle_ready",
            Payload = new Dictionary<string, object?> { ["bundleUrl"] = "https://evil.example.com/phish" },
        });
        await harness.Service.PublishWorkerEventAsync(job.Id, new PublishJobEventRequest
        {
            EventType = "job_completed",
            Payload = new Dictionary<string, object?>(),
        });

        var (redirectUrl, statusCode, _) = await harness.Service.GetBundleRedirectAsync(job.Id);

        Assert.Null(redirectUrl);
        Assert.Equal(StatusCodes.Status404NotFound, statusCode);
    }
}
