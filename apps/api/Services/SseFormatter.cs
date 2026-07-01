namespace SpecBridge.Api.Services;

public static class SseFormatter
{
    public static string Format(string eventType, string dataJson)
    {
        return $"event: {eventType}\ndata: {dataJson}\n\n";
    }

    public static string Comment(string text) => $": {text}\n\n";
}
