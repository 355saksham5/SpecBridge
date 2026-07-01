import { describe, it, expect } from "vitest";
import { sanitizeForAudit, safeEventPayload } from "../src/index.js";

describe("sanitizeForAudit", () => {
  it("redacts prompt and Jira fields", () => {
    const input = {
      jobId: "abc",
      agentRole: "feature-historian",
      taskPrompt: "Write a retro spec with lots of secret repo context",
      jiraDescription: "Customer PII and internal details",
      repoUrl: "https://github.com/acme/app",
    };

    const out = sanitizeForAudit(input) as Record<string, unknown>;
    expect(out.jobId).toBe("abc");
    expect(out.repoUrl).toBe("https://github.com/acme/app");
    expect(out.taskPrompt).toBe("[redacted]");
    expect(out.jiraDescription).toBe("[redacted]");
  });

  it("wraps safeEventPayload with type", () => {
    const payload = safeEventPayload("agent_started", { jobId: "x", cursorAgentId: "agent-1" });
    expect(payload.type).toBe("agent_started");
    expect(payload.jobId).toBe("x");
  });
});
