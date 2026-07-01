namespace SpecBridge.Api.Contracts;

/// <summary>
/// Request body for POST /v1/brownfield-jobs — aligned with docs/api.openapi.yaml.
/// </summary>
public sealed class CreateBrownfieldJobRequest
{
    public string RepoUrl { get; set; } = string.Empty;
    public Guid GitHubConnectionId { get; set; }
    public Guid CursorCredentialId { get; set; }
    public string? DefaultBranch { get; set; }
    public string SddKitId { get; set; } = "csharp-sdd-starter-kit";
    public string? SddKitVersion { get; set; }
    public HistoryOptions? History { get; set; }
    public JiraOptions? Jira { get; set; }
    public KnowledgeOptions? Knowledge { get; set; }
    public ValidationOptions? Validation { get; set; }
    public DeliveryOptions? Delivery { get; set; }
    public AgentOptions? Agents { get; set; }
}

public sealed class HistoryOptions
{
    public int CommitDepth { get; set; } = 50;
    public string WalkOrder { get; set; } = "oldest_first";
}

public sealed class JiraOptions
{
    public Guid? ConnectionId { get; set; }
    public string IssueKeyPattern { get; set; } = "ITDIGIT-\\d+";
    public List<string> ExtractFrom { get; set; } = ["commit_message"];
}

public sealed class KnowledgeOptions
{
    public string GranularityPrompt { get; set; } = string.Empty;
    public string? AdvisorPrompt { get; set; }
    public List<string>? IncludeConfluencePageIds { get; set; }
    public List<string> ExcludePathPatterns { get; set; } =
    [
        "**/bin/**",
        "**/obj/**",
        "**/.git/**",
        "**/node_modules/**",
    ];
    public int MaxShardTokens { get; set; } = 800;
}

public sealed class ValidationOptions
{
    public int DevilsAdvocateQuestionCount { get; set; } = 10;
    public float MinAnswerScore { get; set; } = 0.75f;
    public int MaxRoundsPerCommit { get; set; } = 1;
}

public sealed class DeliveryOptions
{
    public bool Bundle { get; set; } = true;
    public bool OpenPr { get; set; }
    public string? PrTitle { get; set; }
    public string? PrBranch { get; set; }
}

public sealed class AgentOptions
{
    public Dictionary<string, AgentOverride>? Overrides { get; set; }
}

public sealed class AgentOverride
{
    public string? Model { get; set; }
}
