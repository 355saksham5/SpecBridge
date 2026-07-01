using Microsoft.Extensions.DependencyInjection;
using Azure.Security.KeyVault.Secrets;
using Microsoft.EntityFrameworkCore;
using SpecBridge.Api.Contracts;
using SpecBridge.Api.Data;

namespace SpecBridge.Api.Services;

/// <summary>
/// Resolves tenant connection IDs to short-lived credential material from Key Vault.
/// Used exclusively by the internal worker endpoint — never exposed to clients.
/// </summary>
public sealed class WorkerCredentialService
{
    private readonly SpecBridgeDbContext _db;
    private readonly SecretClient? _secretClient;

    public WorkerCredentialService(SpecBridgeDbContext db, IServiceProvider serviceProvider)
    {
        _db = db;
        _secretClient = serviceProvider.GetService<SecretClient>();
    }

    public async Task<(WorkerCredentialsResponse? Credentials, int StatusCode, string? Detail)> ResolveAsync(
        ResolveWorkerCredentialsRequest request,
        CancellationToken cancellationToken = default)
    {
        if (_secretClient is null)
        {
            return (null, StatusCodes.Status503ServiceUnavailable, "Key Vault is not configured.");
        }

        if (request.OrganizationId == Guid.Empty
            || request.CursorCredentialId == Guid.Empty
            || request.GitHubConnectionId == Guid.Empty)
        {
            return (null, StatusCodes.Status400BadRequest, "organizationId, cursorCredentialId, and githubConnectionId are required.");
        }

        var cursor = await _db.CursorCredentials
            .IgnoreQueryFilters()
            .AsNoTracking()
            .FirstOrDefaultAsync(
                c => c.Id == request.CursorCredentialId && c.OrganizationId == request.OrganizationId,
                cancellationToken);

        if (cursor is null)
        {
            return (null, StatusCodes.Status404NotFound, "Cursor credential not found for organization.");
        }

        var github = await _db.GitHubConnections
            .IgnoreQueryFilters()
            .AsNoTracking()
            .FirstOrDefaultAsync(
                g => g.Id == request.GitHubConnectionId && g.OrganizationId == request.OrganizationId,
                cancellationToken);

        if (github is null)
        {
            return (null, StatusCodes.Status404NotFound, "GitHub connection not found for organization.");
        }

        var response = new WorkerCredentialsResponse();

        var cursorSecret = await _secretClient.GetSecretAsync(cursor.KeyVaultSecretName, cancellationToken: cancellationToken);
        response.CursorApiKey = cursorSecret.Value.Value;

        if (!string.IsNullOrWhiteSpace(github.KeyVaultSecretName))
        {
            var ghSecret = await _secretClient.GetSecretAsync(github.KeyVaultSecretName, cancellationToken: cancellationToken);
            response.GitHub = new WorkerGitHubCredentials
            {
                AuthHeader = FormatGitHubAuthHeader(ghSecret.Value.Value),
                ApiBaseUrl = github.ApiBaseUrl,
            };
        }

        if (request.JiraConnectionId is Guid jiraId)
        {
            var jira = await _db.JiraConnections
                .IgnoreQueryFilters()
                .AsNoTracking()
                .FirstOrDefaultAsync(
                    j => j.Id == jiraId && j.OrganizationId == request.OrganizationId,
                    cancellationToken);

            if (jira is null)
            {
                return (null, StatusCodes.Status404NotFound, "Jira connection not found for organization.");
            }

            var jiraSecret = await _secretClient.GetSecretAsync(jira.KeyVaultSecretName, cancellationToken: cancellationToken);
            response.Jira = new WorkerJiraCredentials
            {
                BaseUrl = jira.BaseUrl,
                AuthHeader = FormatBearerHeader(jiraSecret.Value.Value),
            };
        }

        return (response, StatusCodes.Status200OK, null);
    }

    private static string FormatBearerHeader(string secretValue) =>
        secretValue.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
            ? secretValue
            : $"Bearer {secretValue}";

    private static string FormatGitHubAuthHeader(string secretValue)
    {
        if (secretValue.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
            || secretValue.StartsWith("token ", StringComparison.OrdinalIgnoreCase))
        {
            return secretValue;
        }

        return $"Bearer {secretValue}";
    }
}
