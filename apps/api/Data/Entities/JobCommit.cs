namespace SpecBridge.Api.Data.Entities;

/// <summary>
/// Represents a commit processed in a brownfield job.
/// </summary>
public class JobCommit
{
    public Guid Id { get; set; }
    public Guid BrownfieldJobId { get; set; }
    public required string CommitSha { get; set; }
    public bool Processed { get; set; }
    public string? SkipReason { get; set; }
    public string? JiraIssueKey { get; set; }
    public int? TokenEstimateAfter { get; set; }
    public float? QaScore { get; set; }
    public DateTime CreatedAt { get; set; }
    
    // Navigation
    public BrownfieldJob Job { get; set; } = null!;
}
