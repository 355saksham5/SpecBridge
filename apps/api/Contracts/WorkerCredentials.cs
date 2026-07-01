namespace SpecBridge.Api.Contracts;

public sealed class ResolveWorkerCredentialsRequest
{
    public Guid OrganizationId { get; set; }
    public Guid CursorCredentialId { get; set; }
    public Guid GitHubConnectionId { get; set; }
    public Guid? JiraConnectionId { get; set; }
}

public sealed class WorkerCredentialsResponse
{
    public string? CursorApiKey { get; set; }
    public WorkerGitHubCredentials? GitHub { get; set; }
    public WorkerJiraCredentials? Jira { get; set; }
}

public sealed class WorkerGitHubCredentials
{
    public string AuthHeader { get; set; } = string.Empty;
    public string ApiBaseUrl { get; set; } = string.Empty;
}

public sealed class WorkerJiraCredentials
{
    public string BaseUrl { get; set; } = string.Empty;
    public string AuthHeader { get; set; } = string.Empty;
}

public sealed class WorkerJobCredentials
{
    public Guid CursorCredentialId { get; set; }
    public Guid GitHubConnectionId { get; set; }
    public Guid? JiraConnectionId { get; set; }
}
