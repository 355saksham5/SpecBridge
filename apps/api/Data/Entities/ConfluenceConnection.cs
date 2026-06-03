namespace SpecBridge.Api.Data.Entities;

/// <summary>
/// Represents a Confluence OAuth connection.
/// Tokens stored in Key Vault.
/// </summary>
public class ConfluenceConnection
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public required string BaseUrl { get; set; }
    public required string KeyVaultSecretName { get; set; }
    public DateTime CreatedAt { get; set; }
}
