using System.Text.RegularExpressions;

namespace SpecBridge.Api.Validation;

public static partial class RepoUrlValidation
{
    private static readonly Regex GitHubHttpsPattern = GitHubUrlRegex();

    public static bool TryParse(string? repoUrl, out Uri? uri, out string? error)
    {
        uri = null;
        error = null;

        if (string.IsNullOrWhiteSpace(repoUrl))
        {
            error = "repoUrl is required";
            return false;
        }

        if (repoUrl.Length > 2048)
        {
            error = "repoUrl exceeds maximum length of 2048 characters";
            return false;
        }

        if (!Uri.TryCreate(repoUrl.Trim(), UriKind.Absolute, out var parsed))
        {
            error = "repoUrl must be a valid absolute HTTPS URL";
            return false;
        }

        if (!parsed.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
        {
            error = "repoUrl must use HTTPS";
            return false;
        }

        if (!GitHubHttpsPattern.IsMatch(parsed.GetLeftPart(UriPartial.Path)))
        {
            error = "repoUrl must match https://{host}/{owner}/{repo}";
            return false;
        }

        uri = parsed;
        return true;
    }

    [GeneratedRegex(@"^https://[^/]+/[^/]+/[^/]+/?$", RegexOptions.IgnoreCase)]
    private static partial Regex GitHubUrlRegex();
}
