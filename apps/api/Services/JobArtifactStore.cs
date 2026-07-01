using System.Text.Json;

namespace SpecBridge.Api.Services;

/// <summary>
/// Captures bundle URL and quality metrics from terminal job events for download/report endpoints.
/// </summary>
public sealed class JobArtifactStore
{
    private readonly object _sync = new();
    private readonly Dictionary<Guid, JobArtifacts> _artifacts = new();

    public void RecordEvent(Guid jobId, string eventType, string dataJson)
    {
        using var doc = JsonDocument.Parse(dataJson);
        var root = doc.RootElement;

        lock (_sync)
        {
            if (!_artifacts.TryGetValue(jobId, out var artifacts))
            {
                artifacts = new JobArtifacts();
                _artifacts[jobId] = artifacts;
            }

            switch (eventType)
            {
                case "bundle_ready":
                    if (root.TryGetProperty("bundleUrl", out var urlProp) && urlProp.ValueKind == JsonValueKind.String)
                    {
                        artifacts.BundleUrl = urlProp.GetString();
                    }

                    if (root.TryGetProperty("bundleBlobName", out var blobProp) && blobProp.ValueKind == JsonValueKind.String)
                    {
                        artifacts.BundleBlobName = blobProp.GetString();
                    }

                    if (root.TryGetProperty("sizeMb", out var sizeProp) && sizeProp.TryGetDouble(out var sizeMb))
                    {
                        artifacts.BundleSizeMb = sizeMb;
                    }
                    break;

                case "job_completed":
                    artifacts.QualityReportJson = dataJson;
                    break;

                case "job_failed":
                    artifacts.FailureJson = dataJson;
                    break;
            }
        }
    }

    public JobArtifacts? Get(Guid jobId)
    {
        lock (_sync)
        {
            return _artifacts.TryGetValue(jobId, out var artifacts) ? artifacts : null;
        }
    }
}

public sealed class JobArtifacts
{
    public string? BundleUrl { get; set; }
    public string? BundleBlobName { get; set; }
    public double? BundleSizeMb { get; set; }
    public string? QualityReportJson { get; set; }
    public string? FailureJson { get; set; }
}
