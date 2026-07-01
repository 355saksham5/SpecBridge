import { sanitizeForAudit } from "@specbridge/audit-log";
import type { EmitFn } from "./bootstrap-pipeline.js";

export type TraceContext = {
  jobId: string;
  organizationId?: string;
};

/**
 * Wraps the worker emit fn so every SSE-like event carries `jobId` (and
 * optional `organizationId`) for App Insights correlation. Payloads are
 * sanitized per audit log policy before fan-out.
 */
export function createTracingEmit(base: EmitFn | undefined, ctx: TraceContext): EmitFn {
  return (event) => {
    if (!("type" in event) || !("payload" in event)) {
      base?.(event);
      return;
    }

    const payload: Record<string, unknown> = {
      ...(sanitizeForAudit(event.payload) as Record<string, unknown>),
      jobId: ctx.jobId,
    };
    if (ctx.organizationId) payload.organizationId = ctx.organizationId;

    if (event.type === "agent_started" || event.type === "agent_completed") {
      const runId = (event.payload as { runId?: string }).runId;
      if (runId) payload.cursorRunId = runId;
    }

    base?.({ type: event.type, payload });
  };
}
