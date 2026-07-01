namespace SpecBridge.Api.Contracts;

public sealed class PublishJobEventRequest
{
    public string EventType { get; set; } = string.Empty;
    public Dictionary<string, object?> Payload { get; set; } = new();
}
