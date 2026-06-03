namespace SpecBridge.Api.Data.Entities;

/// <summary>
/// Represents a tenant organization.
/// </summary>
public class Organization
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public string? EntraIdTenantId { get; set; }
    public DateTime CreatedAt { get; set; }
}
