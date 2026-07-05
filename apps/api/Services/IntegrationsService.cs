using Azure.Security.KeyVault.Secrets;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Text.Json;
using SpecBridge.Api.Contracts;
using SpecBridge.Api.Data;
using SpecBridge.Api.Data.Entities;

namespace SpecBridge.Api.Services;

public sealed class IntegrationsService
{
    private readonly SpecBridgeDbContext _db;
    private readonly TenantContext _tenantContext;
    private readonly SecretClient? _secretClient;
    private readonly IValidator<PutCursorCredentialRequest> _cursorValidator;
    private readonly IValidator<InstallGitHubRequest> _githubValidator;
    private readonly IValidator<ConnectAtlassianRequest> _atlassianValidator;

    private readonly AtlassianOAuthService _atlassianOAuth;

    public IntegrationsService(
        SpecBridgeDbContext db,
        TenantContext tenantContext,
        IValidator<PutCursorCredentialRequest> cursorValidator,
        IValidator<InstallGitHubRequest> githubValidator,
        IValidator<ConnectAtlassianRequest> atlassianValidator,
        AtlassianOAuthService atlassianOAuth,
        IServiceProvider serviceProvider)
    {
        _db = db;
        _tenantContext = tenantContext;
        _cursorValidator = cursorValidator;
        _githubValidator = githubValidator;
        _atlassianValidator = atlassianValidator;
        _atlassianOAuth = atlassianOAuth;
        _secretClient = serviceProvider.GetService<SecretClient>();
    }

    public async Task<(CursorCredential? Credential, IReadOnlyDictionary<string, string[]>? Errors, int StatusCode, string? Detail)> PutCursorCredentialAsync(
        PutCursorCredentialRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!_tenantContext.TryGetOrganizationId(out var organizationId))
        {
            return (null, null, StatusCodes.Status403Forbidden, "Missing org_id claim.");
        }

        var validation = await _cursorValidator.ValidateAsync(request, cancellationToken);
        if (!validation.IsValid)
        {
            return (null, ToReadOnlyDictionary(validation), StatusCodes.Status400BadRequest, null);
        }

        if (_secretClient is null)
        {
            return (null, null, StatusCodes.Status503ServiceUnavailable,
                "Key Vault is not configured — Cursor API keys cannot be stored.");
        }

        var credentialId = Guid.NewGuid();
        var secretName = $"cursor-{organizationId:N}-{credentialId:N}";
        await _secretClient.SetSecretAsync(secretName, request.ApiKey, cancellationToken);

        var last4 = request.ApiKey.Length >= 4
            ? request.ApiKey[^4..]
            : "****";

        var credential = new CursorCredential
        {
            Id = credentialId,
            OrganizationId = organizationId,
            Name = string.IsNullOrWhiteSpace(request.Name) ? null : request.Name.Trim(),
            KeyVaultSecretName = secretName,
            Last4 = last4,
            CreatedAt = DateTime.UtcNow,
        };

        _db.CursorCredentials.Add(credential);
        await _db.SaveChangesAsync(cancellationToken);

        return (credential, null, StatusCodes.Status200OK, null);
    }

    public async Task<int> DeleteCursorCredentialAsync(Guid id, CancellationToken cancellationToken = default)
    {
        if (!_tenantContext.TryGetOrganizationId(out var organizationId))
        {
            return StatusCodes.Status403Forbidden;
        }

        var credential = await _db.CursorCredentials
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(c => c.Id == id && c.OrganizationId == organizationId, cancellationToken);

        if (credential is null)
        {
            return StatusCodes.Status404NotFound;
        }

        if (_secretClient is not null)
        {
            await _secretClient.StartDeleteSecretAsync(credential.KeyVaultSecretName, cancellationToken);
        }

        _db.CursorCredentials.Remove(credential);
        await _db.SaveChangesAsync(cancellationToken);
        return StatusCodes.Status204NoContent;
    }

    public async Task<(GitHubConnection? Connection, IReadOnlyDictionary<string, string[]>? Errors, int StatusCode)> InstallGitHubAsync(
        InstallGitHubRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!_tenantContext.TryGetOrganizationId(out var organizationId))
        {
            return (null, null, StatusCodes.Status403Forbidden);
        }

        var validation = await _githubValidator.ValidateAsync(request, cancellationToken);
        if (!validation.IsValid)
        {
            return (null, ToReadOnlyDictionary(validation), StatusCodes.Status400BadRequest);
        }

        var webUrl = request.WebUrl.Trim().TrimEnd('/');
        var apiBaseUrl = string.IsNullOrWhiteSpace(request.ApiBaseUrl)
            ? (request.HostType == "ghes" ? $"{webUrl}/api/v3" : "https://api.github.com")
            : request.ApiBaseUrl.Trim();

        var connectionId = Guid.NewGuid();
        string? keyVaultSecretName = null;
        if (!string.IsNullOrWhiteSpace(request.InstallationToken) && _secretClient is not null)
        {
            keyVaultSecretName = $"github-token-{organizationId:N}-{connectionId:N}";
            await _secretClient.SetSecretAsync(keyVaultSecretName, request.InstallationToken, cancellationToken);
        }

        var connection = new GitHubConnection
        {
            Id = connectionId,
            OrganizationId = organizationId,
            HostType = request.HostType,
            WebUrl = webUrl,
            ApiBaseUrl = apiBaseUrl,
            InstallationId = request.InstallationId,
            KeyVaultSecretName = keyVaultSecretName,
            CreatedAt = DateTime.UtcNow,
        };

        _db.GitHubConnections.Add(connection);
        await _db.SaveChangesAsync(cancellationToken);
        return (connection, null, StatusCodes.Status201Created);
    }

    public async Task<(IReadOnlyList<GitHubConnection> Connections, int StatusCode)> ListGitHubConnectionsAsync(
        CancellationToken cancellationToken = default)
    {
        if (!_tenantContext.TryGetOrganizationId(out var organizationId))
        {
            return (Array.Empty<GitHubConnection>(), StatusCodes.Status403Forbidden);
        }

        var connections = await _db.GitHubConnections
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(g => g.OrganizationId == organizationId)
            .OrderByDescending(g => g.CreatedAt)
            .Take(100)
            .ToListAsync(cancellationToken);

        return (connections, StatusCodes.Status200OK);
    }

    public async Task<(JiraConnection? Connection, IReadOnlyDictionary<string, string[]>? Errors, int StatusCode, string? Detail)> ConnectJiraAsync(
        ConnectAtlassianRequest request,
        CancellationToken cancellationToken = default)
    {
        return await ConnectAtlassianAsync<JiraConnection>(
            request,
            (organizationId, connectionId, baseUrl, secretName) => new JiraConnection
            {
                Id = connectionId,
                OrganizationId = organizationId,
                BaseUrl = baseUrl,
                KeyVaultSecretName = secretName,
                CreatedAt = DateTime.UtcNow,
            },
            cancellationToken);
    }

    public async Task<(ConfluenceConnection? Connection, IReadOnlyDictionary<string, string[]>? Errors, int StatusCode, string? Detail)> ConnectConfluenceAsync(
        ConnectAtlassianRequest request,
        CancellationToken cancellationToken = default)
    {
        return await ConnectAtlassianAsync<ConfluenceConnection>(
            request,
            (organizationId, connectionId, baseUrl, secretName) => new ConfluenceConnection
            {
                Id = connectionId,
                OrganizationId = organizationId,
                BaseUrl = baseUrl,
                KeyVaultSecretName = secretName,
                CreatedAt = DateTime.UtcNow,
            },
            cancellationToken);
    }

    private async Task<(TConnection? Connection, IReadOnlyDictionary<string, string[]>? Errors, int StatusCode, string? Detail)> ConnectAtlassianAsync<TConnection>(
        ConnectAtlassianRequest request,
        Func<Guid, Guid, string, string, TConnection> factory,
        CancellationToken cancellationToken) where TConnection : class
    {
        if (!_tenantContext.TryGetOrganizationId(out var organizationId))
        {
            return (null, null, StatusCodes.Status403Forbidden, "Missing org_id claim.");
        }

        var validation = await _atlassianValidator.ValidateAsync(request, cancellationToken);
        if (!validation.IsValid)
        {
            return (null, ToReadOnlyDictionary(validation), StatusCodes.Status400BadRequest, null);
        }

        if (_secretClient is null)
        {
            return (null, null, StatusCodes.Status503ServiceUnavailable,
                "Key Vault is not configured — OAuth tokens cannot be stored.");
        }

        if (!_atlassianOAuth.IsConfigured)
        {
            return (null, null, StatusCodes.Status503ServiceUnavailable,
                "Atlassian OAuth is not configured — set ClientId, ClientSecret (env only), and Key Vault.");
        }

        var (tokenBundle, oauthError) = await _atlassianOAuth.ExchangeAuthorizationCodeAsync(
            request.Code.Trim(),
            request.RedirectUri.Trim(),
            cancellationToken);

        if (tokenBundle is null)
        {
            return (null, new Dictionary<string, string[]>
            {
                ["code"] = [oauthError ?? "Atlassian OAuth code exchange failed."],
            }, StatusCodes.Status400BadRequest, null);
        }

        var connectionId = Guid.NewGuid();
        var secretName = $"atlassian-{typeof(TConnection).Name.ToLowerInvariant()}-{organizationId:N}-{connectionId:N}";
        await _secretClient.SetSecretAsync(
            secretName,
            JsonSerializer.Serialize(tokenBundle),
            cancellationToken);

        var baseUrl = string.IsNullOrWhiteSpace(request.BaseUrl)
            ? "https://atlassian.net"
            : request.BaseUrl.Trim().TrimEnd('/');

        var entity = factory(organizationId, connectionId, baseUrl, secretName);

        if (entity is JiraConnection jira)
        {
            _db.JiraConnections.Add(jira);
        }
        else if (entity is ConfluenceConnection confluence)
        {
            _db.ConfluenceConnections.Add(confluence);
        }

        await _db.SaveChangesAsync(cancellationToken);
        return (entity, null, StatusCodes.Status201Created, null);
    }

    // FluentValidation's ValidationResult.ToDictionary() returns IDictionary<,>, which the
    // compiler won't implicitly convert to the IReadOnlyDictionary<,> our contracts expose —
    // copy it into a concrete Dictionary, which implements both.
    private static IReadOnlyDictionary<string, string[]> ToReadOnlyDictionary(FluentValidation.Results.ValidationResult validation) =>
        new Dictionary<string, string[]>(validation.ToDictionary());
}
