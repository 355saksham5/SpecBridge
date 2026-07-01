using System.Text.Json;
using Azure.Messaging.ServiceBus;

namespace SpecBridge.Api.Services;

/// <summary>
/// Enqueues brownfield job messages onto Azure Service Bus for the
/// knowledge-worker consumer. When no connection string is configured,
/// jobs are accepted but not enqueued (Phase 1/5 local dev fallback).
/// </summary>
public sealed class BrownfieldJobQueue : IAsyncDisposable
{
    private readonly ServiceBusClient? _client;
    private readonly ServiceBusSender? _sender;
    private readonly string _queueName;

    public BrownfieldJobQueue(IConfiguration configuration)
    {
        _queueName = configuration["Azure:ServiceBus:QueueName"] ?? "brownfield-jobs";
        var connectionString = configuration["Azure:ServiceBus:ConnectionString"];
        if (string.IsNullOrWhiteSpace(connectionString)) return;

        _client = new ServiceBusClient(connectionString);
        _sender = _client.CreateSender(_queueName);
    }

    public bool IsConfigured => _sender is not null;

    public async Task EnqueueAsync(object message, CancellationToken cancellationToken = default)
    {
        if (_sender is null) return;

        var json = JsonSerializer.Serialize(message);
        await _sender.SendMessageAsync(new ServiceBusMessage(json), cancellationToken);
    }

    public async Task PublishCancelAsync(Guid jobId, CancellationToken cancellationToken = default)
    {
        if (_sender is null) return;

        var json = JsonSerializer.Serialize(new { type = "cancel", jobId });
        await _sender.SendMessageAsync(new ServiceBusMessage(json), cancellationToken);
    }

    public async ValueTask DisposeAsync()
    {
        if (_sender is not null) await _sender.DisposeAsync();
        if (_client is not null) await _client.DisposeAsync();
    }
}
