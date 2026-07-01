namespace SpecBridge.Api.Services;

/// <summary>
/// Lightweight network preflight for GHES: verifies the host resolves and
/// responds on HTTPS. Does not validate Cursor egress — document that separately.
/// </summary>
public sealed class RepoPreflightService
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(5);

    public async Task<(bool Ok, string? Detail)> CheckHostReachableAsync(string host, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(host))
        {
            return (false, "Host is empty");
        }

        try
        {
            using var client = new HttpClient { Timeout = Timeout };
            using var response = await client.GetAsync($"https://{host}/", HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            return (true, $"HTTP {(int)response.StatusCode}");
        }
        catch (Exception ex)
        {
            return (false, ex.Message.Length > 200 ? ex.Message[..200] : ex.Message);
        }
    }
}
