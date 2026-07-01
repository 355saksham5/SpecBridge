namespace SpecBridge.Api.Services;

/// <summary>
/// Admin-registered GHES host allowlist. github.com is always permitted.
/// Configure via GitHub:AllowedGhesHosts (array of hostnames, no scheme).
/// </summary>
public sealed class GhesHostRegistry
{
    private readonly HashSet<string> _allowedHosts;

    public GhesHostRegistry(IConfiguration configuration)
    {
        _allowedHosts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var section = configuration.GetSection("GitHub:AllowedGhesHosts");
        foreach (var host in section.Get<string[]>() ?? Array.Empty<string>())
        {
            if (!string.IsNullOrWhiteSpace(host))
            {
                _allowedHosts.Add(host.Trim());
            }
        }
    }

    public bool IsAllowedHost(string host)
    {
        if (string.IsNullOrWhiteSpace(host)) return false;
        if (host.Equals("github.com", StringComparison.OrdinalIgnoreCase)) return true;
        return _allowedHosts.Contains(host);
    }

    public IReadOnlyCollection<string> RegisteredGhesHosts => _allowedHosts;
}
