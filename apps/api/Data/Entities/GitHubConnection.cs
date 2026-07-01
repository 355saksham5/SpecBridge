namespace SpecBridge.Api.Data.Entities;

/// <summary>
/// Represents a GitHub App installation.
/// </summary>
public class GitHubConnection
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public required string HostType { get; set; } // "github.com" or "ghes"
    public required string WebUrl { get; set; }
    public required string ApiBaseUrl { get; set; }
    public long InstallationId { get; set; }
    public string? KeyVaultSecretName { get; set; }
    public DateTime CreatedAt { get; set; }
}
