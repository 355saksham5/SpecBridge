import type { EmitFn } from "./bootstrap-pipeline.js";

export type EventRelayOptions = {
  apiBaseUrl: string;
  eventsApiKey: string;
  jobId: string;
};

/**
 * POSTs sanitized worker events to the API internal fan-in endpoint for SSE subscribers.
 * Failures are logged and swallowed — job processing must not depend on relay delivery.
 */
export function createApiEventRelay(base: EmitFn | undefined, options: EventRelayOptions): EmitFn {
  const url = `${options.apiBaseUrl.replace(/\/$/, "")}/v1/internal/brownfield-jobs/${options.jobId}/events`;

  return (event) => {
    base?.(event);

    if (!("type" in event) || !("payload" in event)) {
      return;
    }

    void fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SpecBridge-Events-Key": options.eventsApiKey,
      },
      body: JSON.stringify({
        eventType: event.type,
        payload: event.payload,
      }),
    }).catch((err) => {
      console.warn(`# Event relay failed for ${event.type}:`, err instanceof Error ? err.message : err);
    });
  };
}

export function resolveEventRelayOptions(jobId: string): EventRelayOptions | null {
  const apiBaseUrl = process.env.SPECBRIDGE_API_BASE_URL;
  const eventsApiKey = process.env.SPECBRIDGE_EVENTS_API_KEY;
  if (!apiBaseUrl || !eventsApiKey) {
    return null;
  }

  return { apiBaseUrl, eventsApiKey, jobId };
}
