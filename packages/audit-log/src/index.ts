/** Keys whose string values are replaced before logging or SSE fan-out. */
const REDACTED_STRING_KEYS = new Set([
  "taskDescription",
  "taskPrompt",
  "systemPrompt",
  "prompt",
  "jiraDescription",
  "jiraSummary",
  "commitMessage",
  "content",
  "markdown",
  "retroSpecText",
  "answer",
  "description",
  "body",
  "message",
]);

const MAX_SAFE_STRING_LENGTH = 256;

export type SanitizeOptions = {
  /** When true, truncate long strings instead of full redaction. Default false. */
  truncateOnly?: boolean;
};

/**
 * Recursively sanitizes event/log payloads per the audit log policy:
 * jobId, repoUrl, headSha, agentRole, cursorRunId, prUrl are kept;
 * prompt bodies, repo file content, and Jira issue text are never emitted.
 */
export function sanitizeForAudit(value: unknown, options: SanitizeOptions = {}, depth = 0): unknown {
  if (depth > 8) return "[truncated-depth]";
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    if (value.length > MAX_SAFE_STRING_LENGTH) {
      return options.truncateOnly ? `${value.slice(0, MAX_SAFE_STRING_LENGTH)}…` : "[redacted-string]";
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForAudit(item, options, depth + 1));
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (REDACTED_STRING_KEYS.has(key) && typeof val === "string") {
        out[key] = "[redacted]";
        continue;
      }
      out[key] = sanitizeForAudit(val, options, depth + 1);
    }
    return out;
  }

  return value;
}

export function safeEventPayload(type: string, payload: Record<string, unknown>): Record<string, unknown> {
  const sanitized = sanitizeForAudit(payload) as Record<string, unknown>;
  return { type, ...sanitized };
}
