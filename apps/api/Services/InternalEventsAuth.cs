using System.Security.Cryptography;

namespace SpecBridge.Api.Services;

/// <summary>
/// Validates the worker-to-API internal events API key (never logged).
/// </summary>
public sealed class InternalEventsAuth(IConfiguration configuration)
{
    private readonly string? _expectedKey = configuration["Internal:EventsApiKey"];

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_expectedKey);

    public bool TryValidate(string? providedKey)
    {
        if (!IsConfigured || string.IsNullOrWhiteSpace(providedKey))
        {
            return false;
        }

        var expectedBytes = System.Text.Encoding.UTF8.GetBytes(_expectedKey!);
        var providedBytes = System.Text.Encoding.UTF8.GetBytes(providedKey);
        if (expectedBytes.Length != providedBytes.Length)
        {
            return false;
        }

        return CryptographicOperations.FixedTimeEquals(expectedBytes, providedBytes);
    }
}
