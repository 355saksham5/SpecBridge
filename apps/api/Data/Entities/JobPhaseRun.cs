namespace SpecBridge.Api.Data.Entities;

/// <summary>
/// Represents a single agent run within a brownfield job phase.
/// </summary>
public class JobPhaseRun
{
    public Guid Id { get; set; }
    public Guid BrownfieldJobId { get; set; }
    public required string AgentRole { get; set; } // knowledge-architect, feature-historian, etc.
    public string? CommitSha { get; set; }
    public string? CursorAgentId { get; set; }
    public string? CursorRunId { get; set; }
    public int? TokensIn { get; set; }
    public int? TokensOut { get; set; }
    public int? DurationMs { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    
    // Navigation
    public BrownfieldJob Job { get; set; } = null!;
}
