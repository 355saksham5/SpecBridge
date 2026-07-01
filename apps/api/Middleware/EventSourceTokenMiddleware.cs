namespace SpecBridge.Api.Middleware;

/// <summary>
/// Browser EventSource cannot send Authorization headers — copy ?token= into Bearer for SSE routes.
/// </summary>
public sealed class EventSourceTokenMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context)
    {
        if (context.Request.Path.Value?.EndsWith("/events", StringComparison.OrdinalIgnoreCase) == true
            && !context.Request.Headers.ContainsKey("Authorization")
            && context.Request.Query.TryGetValue("token", out var tokenValues))
        {
            var token = tokenValues.ToString();
            if (!string.IsNullOrWhiteSpace(token))
            {
                context.Request.Headers.Authorization = $"Bearer {token}";
            }
        }

        await next(context);
    }
}
