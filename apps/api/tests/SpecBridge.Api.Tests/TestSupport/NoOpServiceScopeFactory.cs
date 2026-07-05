using Microsoft.Extensions.DependencyInjection;

namespace SpecBridge.Api.Tests.TestSupport;

/// <summary>
/// <see cref="JobEventHub"/> only needs a scope factory for SSE replay (<c>SubscribeAsync</c>).
/// Tests in this suite never subscribe, so this stands in without needing a full DI container.
/// </summary>
internal sealed class NoOpServiceScopeFactory : IServiceScopeFactory
{
    public IServiceScope CreateScope() =>
        throw new NotSupportedException("This test double does not support SSE replay scopes.");
}
