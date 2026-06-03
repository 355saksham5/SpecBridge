namespace SpecBridge.Api.Data.Entities;

/// <summary>
/// Stores a reference to a Cursor API key in Key Vault.
/// NEVER stores the raw key value in the database.
/// </summary>
public class CursorCredential
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public string? Name { get; set; }
    public required string KeyVaultSecretName { get; set; }
    public string? Last4 { get; set; }
    public DateTime CreatedAt { get; set; }
}
