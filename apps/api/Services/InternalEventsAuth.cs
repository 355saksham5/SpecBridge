using System.Security.Cryptography;

namespace SpecBridge.Api.Services;

/// <summary>
/// Validates the worker-to-API internal events API key (never logged).
/// </summary>
public sealed class InternalEventsAuth(IConfiguration configuration)
{
    private readonly string? _expectedKey = configuration["Internal:EventsApiKey"];

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_expectedKey) && _expectedKey!.Length >= 32;

    public bool TryValidate(string? providedKey)
    {
        if (!IsConfigured || string.IsNullOrWhiteSpace(providedKey) || providedKey.Length < 32)
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
