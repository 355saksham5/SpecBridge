using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Azure.Security.KeyVault.Secrets;
using Microsoft.Extensions.DependencyInjection;

namespace SpecBridge.Api.Services;

public sealed class AtlassianTokenBundle
{
    [JsonPropertyName("access_token")]
    public string AccessToken { get; set; } = string.Empty;

    [JsonPropertyName("refresh_token")]
    public string RefreshToken { get; set; } = string.Empty;

    [JsonPropertyName("expires_at_utc")]
    public DateTime ExpiresAtUtc { get; set; }
}

/// <summary>
/// Exchanges Atlassian OAuth authorization codes and refreshes access tokens.
/// Client secret is loaded from SPECBRIDGE_Atlassian__ClientSecret only.
/// </summary>
public sealed class AtlassianOAuthService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
    };

    private readonly IConfiguration _configuration;
    private readonly SecretClient? _secretClient;
    private readonly HttpClient _httpClient;

    public AtlassianOAuthService(IConfiguration configuration, IServiceProvider serviceProvider, HttpClient httpClient)
    {
        _configuration = configuration;
        _secretClient = serviceProvider.GetService<SecretClient>();
        _httpClient = httpClient;
    }

    public bool IsConfigured =>
        _secretClient is not null
        && !string.IsNullOrWhiteSpace(_configuration["Atlassian:ClientId"])
        && !string.IsNullOrWhiteSpace(_configuration["Atlassian:ClientSecret"]);

    public async Task<(AtlassianTokenBundle? Bundle, string? Error)> ExchangeAuthorizationCodeAsync(
        string code,
        string redirectUri,
        CancellationToken cancellationToken = default)
    {
        if (!IsConfigured)
        {
            return (null, "Atlassian OAuth is not configured (ClientId, ClientSecret, Key Vault).");
        }

        return await RequestTokensAsync(new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["client_id"] = _configuration["Atlassian:ClientId"]!,
            ["client_secret"] = _configuration["Atlassian:ClientSecret"]!,
            ["code"] = code,
            ["redirect_uri"] = redirectUri,
        }, cancellationToken);
    }

    public async Task<string?> GetValidAccessTokenAsync(string keyVaultSecretName, CancellationToken cancellationToken = default)
    {
        if (_secretClient is null || string.IsNullOrWhiteSpace(keyVaultSecretName))
        {
            return null;
        }

        var secret = await _secretClient.GetSecretAsync(keyVaultSecretName, cancellationToken: cancellationToken);
        var bundle = JsonSerializer.Deserialize<AtlassianTokenBundle>(secret.Value.Value, JsonOptions);
        if (bundle is null || string.IsNullOrWhiteSpace(bundle.AccessToken))
        {
            return null;
        }

        if (bundle.ExpiresAtUtc <= DateTime.UtcNow.AddMinutes(2))
        {
            var refreshed = await RefreshTokensAsync(bundle.RefreshToken, cancellationToken);
            if (refreshed.Bundle is null)
            {
                return null;
            }

            bundle = refreshed.Bundle;
            await _secretClient.SetSecretAsync(
                keyVaultSecretName,
                JsonSerializer.Serialize(bundle, JsonOptions),
                cancellationToken);
        }

        return bundle.AccessToken;
    }

    private async Task<(AtlassianTokenBundle? Bundle, string? Error)> RefreshTokensAsync(
        string refreshToken,
        CancellationToken cancellationToken)
    {
        if (!IsConfigured || string.IsNullOrWhiteSpace(refreshToken))
        {
            return (null, "Refresh token missing or OAuth not configured.");
        }

        return await RequestTokensAsync(new Dictionary<string, string>
        {
            ["grant_type"] = "refresh_token",
            ["client_id"] = _configuration["Atlassian:ClientId"]!,
            ["client_secret"] = _configuration["Atlassian:ClientSecret"]!,
            ["refresh_token"] = refreshToken,
        }, cancellationToken);
    }

    private async Task<(AtlassianTokenBundle? Bundle, string? Error)> RequestTokensAsync(
        Dictionary<string, string> form,
        CancellationToken cancellationToken)
    {
        var tokenUrl = _configuration["Atlassian:TokenUrl"] ?? "https://auth.atlassian.com/oauth/token";
        using var content = new FormUrlEncodedContent(form);
        using var request = new HttpRequestMessage(HttpMethod.Post, tokenUrl) { Content = content };
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        using var response = await _httpClient.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            return (null, "Atlassian token request failed.");
        }

        using var doc = JsonDocument.Parse(body);
        var root = doc.RootElement;
        if (!root.TryGetProperty("access_token", out var accessTokenProp))
        {
            return (null, "Atlassian token response missing access_token.");
        }

        var expiresIn = root.TryGetProperty("expires_in", out var expiresProp) && expiresProp.TryGetInt32(out var seconds)
            ? seconds
            : 3600;

        var bundle = new AtlassianTokenBundle
        {
            AccessToken = accessTokenProp.GetString() ?? string.Empty,
            RefreshToken = root.TryGetProperty("refresh_token", out var refreshProp)
                && !string.IsNullOrWhiteSpace(refreshProp.GetString())
                ? refreshProp.GetString()!
                : form.TryGetValue("refresh_token", out var existingRefresh)
                    ? existingRefresh
                    : string.Empty,
            ExpiresAtUtc = DateTime.UtcNow.AddSeconds(Math.Clamp(expiresIn, 60, 86_400)),
        };

        if (string.IsNullOrWhiteSpace(bundle.AccessToken))
        {
            return (null, "Atlassian access_token was empty.");
        }

        return (bundle, null);
    }
}
