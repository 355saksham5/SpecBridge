using SpecBridge.Api.Services;
using Xunit;

namespace SpecBridge.Api.Tests.Services;

public class OrgRateLimiterTests
{
    [Fact]
    public void TryStartJob_AllowsUpToMaxConcurrentJobs_ThenBlocks()
    {
        var limiter = new OrgRateLimiter();
        var orgId = Guid.NewGuid();

        for (var i = 0; i < OrgRateLimiter.MaxConcurrentJobs; i++)
        {
            Assert.True(limiter.TryStartJob(orgId, out _), $"job {i} should have been allowed");
        }

        var blocked = limiter.TryStartJob(orgId, out var retryAfter);

        Assert.False(blocked);
        Assert.True(retryAfter > TimeSpan.Zero);
    }

    [Fact]
    public void CompleteJob_ReleasesASlotForReuse()
    {
        var limiter = new OrgRateLimiter();
        var orgId = Guid.NewGuid();

        for (var i = 0; i < OrgRateLimiter.MaxConcurrentJobs; i++)
        {
            Assert.True(limiter.TryStartJob(orgId, out _));
        }

        Assert.False(limiter.TryStartJob(orgId, out _));

        limiter.CompleteJob(orgId);

        Assert.True(limiter.TryStartJob(orgId, out _));
    }

    [Fact]
    public void CompleteJob_NeverGoesNegative_EvenIfCalledWithoutAMatchingStart()
    {
        var limiter = new OrgRateLimiter();
        var orgId = Guid.NewGuid();

        limiter.CompleteJob(orgId);
        limiter.CompleteJob(orgId);

        for (var i = 0; i < OrgRateLimiter.MaxConcurrentJobs; i++)
        {
            Assert.True(limiter.TryStartJob(orgId, out _));
        }

        Assert.False(limiter.TryStartJob(orgId, out _));
    }

    [Fact]
    public void RecordAgentRun_BlocksNewJobsAfterHourlyBudgetIsExhausted()
    {
        var limiter = new OrgRateLimiter();
        var orgId = Guid.NewGuid();

        limiter.RecordAgentRun(orgId, OrgRateLimiter.MaxAgentRunsPerHour);

        var blocked = limiter.TryStartJob(orgId, out var retryAfter);

        Assert.False(blocked);
        Assert.True(retryAfter > TimeSpan.Zero);
    }

    [Fact]
    public void IsOverLimit_IsAReadOnlyPeek_AndDoesNotConsumeASlot()
    {
        var limiter = new OrgRateLimiter();
        var orgId = Guid.NewGuid();

        for (var i = 0; i < 50; i++)
        {
            Assert.False(limiter.IsOverLimit(orgId, out _));
        }

        for (var i = 0; i < OrgRateLimiter.MaxConcurrentJobs; i++)
        {
            Assert.True(limiter.TryStartJob(orgId, out _));
        }

        Assert.True(limiter.IsOverLimit(orgId, out _));
    }

    [Fact]
    public void DifferentOrganizations_HaveIndependentBudgets()
    {
        var limiter = new OrgRateLimiter();
        var orgA = Guid.NewGuid();
        var orgB = Guid.NewGuid();

        for (var i = 0; i < OrgRateLimiter.MaxConcurrentJobs; i++)
        {
            Assert.True(limiter.TryStartJob(orgA, out _));
        }

        Assert.False(limiter.TryStartJob(orgA, out _));
        Assert.True(limiter.TryStartJob(orgB, out _));
    }
}
