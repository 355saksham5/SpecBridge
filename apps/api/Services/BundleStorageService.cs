using Azure;
using Azure.Storage.Blobs;
using Azure.Storage.Sas;

namespace SpecBridge.Api.Services;

/// <summary>
/// Upload metadata and read-only SAS URL generation for job bundle ZIPs (30-minute TTL).
/// </summary>
public sealed class BundleStorageService
{
    private static readonly TimeSpan SasTtl = TimeSpan.FromMinutes(30);

    private readonly BlobContainerClient? _container;
    private readonly string _containerName;

    public BundleStorageService(IConfiguration configuration)
    {
        _containerName = configuration["Azure:ContainerName"] ?? "bundles";
        var connectionString = configuration["Azure:BlobConnectionString"];
        if (!string.IsNullOrWhiteSpace(connectionString))
        {
            var service = new BlobServiceClient(connectionString);
            _container = service.GetBlobContainerClient(_containerName);
        }
    }

    public bool IsConfigured => _container is not null;

    public static string BuildBlobName(Guid organizationId, Guid jobId) =>
        $"{organizationId:N}/{jobId:N}/specbridge-bundle.zip";

    public async Task<string?> CreateReadSasUrlAsync(string blobName, CancellationToken cancellationToken = default)
    {
        if (_container is null || string.IsNullOrWhiteSpace(blobName))
        {
            return null;
        }

        if (blobName.Length > 512)
        {
            return null;
        }

        await _container.CreateIfNotExistsAsync(cancellationToken: cancellationToken);
        var blob = _container.GetBlobClient(blobName);

        if (!await blob.ExistsAsync(cancellationToken))
        {
            return null;
        }

        if (!blob.CanGenerateSasUri)
        {
            return null;
        }

        var sas = new BlobSasBuilder
        {
            BlobContainerName = _containerName,
            BlobName = blobName,
            Resource = "b",
            StartsOn = DateTimeOffset.UtcNow.AddMinutes(-1),
            ExpiresOn = DateTimeOffset.UtcNow.Add(SasTtl),
        };
        sas.SetPermissions(BlobSasPermissions.Read);

        return blob.GenerateSasUri(sas).ToString();
    }
}
