namespace SpecBridge.Api.Contracts;

public sealed class PutCursorCredentialRequest
{
    public string ApiKey { get; set; } = string.Empty;
    public string? Name { get; set; }
}

public sealed class InstallGitHubRequest
{
    public long InstallationId { get; set; }
    public string WebUrl { get; set; } = string.Empty;
    public string? ApiBaseUrl { get; set; }
    public string HostType { get; set; } = "github.com";
}

public sealed class ConnectAtlassianRequest
{
    public string Code { get; set; } = string.Empty;
    public string RedirectUri { get; set; } = string.Empty;
    public string? BaseUrl { get; set; }
}

public sealed class ListJobsQuery
{
    public string? Status { get; set; }
    public string? RepoUrl { get; set; }
    public string? Cursor { get; set; }
    public int Limit { get; set; } = 20;
}
