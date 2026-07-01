import { describe, it, expect } from "vitest";
import { parseGitHubRepoUrl } from "../apps/knowledge-worker/src/pr-delivery.js";
import { createTracingEmit } from "../apps/knowledge-worker/src/telemetry.js";

describe("parseGitHubRepoUrl", () => {
  it("parses standard github.com HTTPS URLs", () => {
    expect(parseGitHubRepoUrl("https://github.com/acme/widgets")).toEqual({ owner: "acme", repo: "widgets" });
    expect(parseGitHubRepoUrl("https://github.com/acme/widgets.git")).toEqual({ owner: "acme", repo: "widgets" });
  });

  it("returns null for non-github.com hosts", () => {
    expect(parseGitHubRepoUrl("https://ghes.example.com/acme/widgets")).toBeNull();
  });
});

describe("createTracingEmit", () => {
  it("injects jobId and cursorRunId into agent events", () => {
    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const emit = createTracingEmit((e) => {
      if ("type" in e && "payload" in e) events.push(e as { type: string; payload: Record<string, unknown> });
    }, { jobId: "job-abc", organizationId: "org-1" });

    emit({
      type: "agent_started",
      payload: { agentRole: "knowledge-architect", runId: "run-xyz", cursorAgentId: "agent-1" },
    });

    expect(events[0].payload.jobId).toBe("job-abc");
    expect(events[0].payload.organizationId).toBe("org-1");
    expect(events[0].payload.cursorRunId).toBe("run-xyz");
  });
});
