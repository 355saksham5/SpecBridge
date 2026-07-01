namespace SpecBridge.Api.Contracts;

public static class BrownfieldJobLimits
{
    public const int MaxRepoUrlLength = 2048;
    public const int MaxBranchLength = 255;
    public const int MaxSddKitIdLength = 128;
    public const int MaxSddKitVersionLength = 64;
    public const int MinCommitDepth = 1;
    public const int MaxCommitDepth = 500;
    public const int MaxIssueKeyPatternLength = 256;
    public const int MaxExtractFromItems = 2;
    public const int MaxAdvisorPromptLength = 4000;
    public const int MaxConfluencePageIds = 25;
    public const int MaxConfluencePageIdLength = 32;
    public const int MaxExcludePatterns = 100;
    public const int MaxExcludePatternLength = 512;
    public const int MinMaxShardTokens = 100;
    public const int MaxMaxShardTokens = 5000;
    public const int MinDevilsAdvocateQuestionCount = 5;
    public const int MaxDevilsAdvocateQuestionCount = 30;
    public const float MinAnswerScore = 0f;
    public const float MaxAnswerScore = 1f;
    public const int MinMaxRoundsPerCommit = 1;
    public const int MaxMaxRoundsPerCommit = 3;
    public const int MaxPrTitleLength = 256;
    public const int MaxPrBranchLength = 256;
    public const int MaxAgentOverrides = 20;
    public const int MaxAgentModelLength = 128;

    public static readonly HashSet<string> WalkOrders = new(StringComparer.Ordinal)
    {
        "oldest_first",
        "newest_first",
    };

    public static readonly HashSet<string> ExtractFromSources = new(StringComparer.Ordinal)
    {
        "commit_message",
        "branch_name",
    };

    public static readonly HashSet<string> GranularityPrompts = new(StringComparer.Ordinal)
    {
        "tokenize_function",
        "tokenize_class",
        "tokenize_namespace",
        "tokenize_features",
        "tokenize_top_level_rules",
        "tokenize_file",
    };
}
