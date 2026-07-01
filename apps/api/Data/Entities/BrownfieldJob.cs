namespace SpecBridge.Api.Data.Entities;

/// <summary>
/// Represents a brownfield onboarding job.
/// </summary>
public class BrownfieldJob
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public required string RepoUrl { get; set; }
    public required string Status { get; set; } // queued, cloning, knowledge_bootstrap, commit_walk, etc.
    public string? HeadSha { get; set; }
    public string? CurrentPhase { get; set; }
    public string? CurrentAgentRole { get; set; }
    public string? CurrentCommitSha { get; set; }
    public int CommitsProcessed { get; set; }
    public int CommitsSkipped { get; set; }
    public int? CommitsRemaining { get; set; }
    public int? TokenEstimateStart { get; set; }
    public int? TokenEstimateCurrent { get; set; }
    public float? MeanQaScore { get; set; }
    public string? PrUrl { get; set; }
    public string? BundleBlobName { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    
    // Navigation properties
    public ICollection<JobCommit> Commits { get; set; } = new List<JobCommit>();
    public ICollection<JobPhaseRun> PhaseRuns { get; set; } = new List<JobPhaseRun>();
}
