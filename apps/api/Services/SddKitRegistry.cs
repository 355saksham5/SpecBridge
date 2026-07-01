namespace SpecBridge.Api.Services;

public sealed record SddKitInfo(
    string Id,
    string Version,
    bool IsDefault,
    string Description,
    string? ManifestHash = null,
    int? FileCount = null);

/// <summary>
/// Pinned SDD kit registry — v1 ships csharp-sdd-starter-kit only.
/// </summary>
public sealed class SddKitRegistry
{
    private readonly IReadOnlyList<SddKitInfo> _kits;

    public SddKitRegistry(IConfiguration configuration)
    {
        var defaultVersion = configuration["SddKits:DefaultVersion"] ?? "1.0.0";
        _kits =
        [
            new SddKitInfo(
                Id: "csharp-sdd-starter-kit",
                Version: defaultVersion,
                IsDefault: true,
                Description: "WatchGuard csharp-sdd-starter-kit — Angular + ASP.NET Core SDD workflow",
                ManifestHash: configuration["SddKits:ManifestHash"],
                FileCount: configuration.GetValue<int?>("SddKits:FileCount")),
        ];
    }

    public IReadOnlyList<SddKitInfo> List() => _kits;

    public SddKitInfo? Get(string kitId) =>
        _kits.FirstOrDefault(k => k.Id.Equals(kitId, StringComparison.OrdinalIgnoreCase));
}
