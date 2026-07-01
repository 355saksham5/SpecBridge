namespace SpecBridge.Api.Data.Entities;

/// <summary>
/// Durable SSE event log for job progress replay across API restarts.
/// </summary>
public class JobEventRecord
{
    public Guid Id { get; set; }
    public Guid BrownfieldJobId { get; set; }
    public required string EventType { get; set; }
    public required string DataJson { get; set; }
    public DateTime CreatedAt { get; set; }
}
