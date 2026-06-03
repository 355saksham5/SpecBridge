namespace SpecBridge.Api.Data.Entities;

/// <summary>
/// Represents a Jira OAuth connection.
/// Tokens stored in Key Vault.
/// </summary>
public class JiraConnection
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public required string BaseUrl { get; set; }
    public required string KeyVaultSecretName { get; set; }
    public DateTime CreatedAt { get; set; }
}
