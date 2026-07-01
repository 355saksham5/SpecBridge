import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdir } from "node:fs/promises";
import { runBrownfieldJob } from "../apps/knowledge-worker/src/job-pipeline.js";

const REQUIRED_TERMINAL_EVENTS = ["phase_started", "bundle_ready", "job_completed"] as const;

/**
 * E2E-style integration: full recorded-mock job pipeline with event capture.
 * Simulates the worker path after credential resolve (mock mode, zero Cursor cost).
 */
describe("e2e recorded job flow", () => {
  it("runs a full job and emits the expected event sequence", async () => {
    const jobId = randomUUID();
    const outputDir = join(tmpdir(), "specbridge-e2e", jobId);
    await mkdir(outputDir, { recursive: true });

    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];

    const result = await runBrownfieldJob({
      jobId,
      organizationId: randomUUID(),
      repoPath: join(process.cwd()),
      repoUrl: "https://github.com/org/specbridge",
      branch: "master",
      headSha: "HEAD",
      outputDir,
      granularityPrompt: "tokenize_class",
      commitDepth: 3,
      issueKeyPattern: "ITDIGIT-\\d+",
      mockAgents: true,
      recordedAgents: true,
      onEvent: (event) => {
        if ("type" in event && "payload" in event) {
          events.push(event as { type: string; payload: Record<string, unknown> });
        }
      },
    });

    expect(result.zipPath).toContain("specbridge-bundle");
    expect(result.shardCount).toBeGreaterThan(0);

    const eventTypes = events.map((e) => e.type);
    for (const required of REQUIRED_TERMINAL_EVENTS) {
      expect(eventTypes).toContain(required);
    }

    expect(eventTypes.indexOf("phase_started")).toBeLessThan(eventTypes.indexOf("bundle_ready"));
    expect(eventTypes.indexOf("bundle_ready")).toBeLessThan(eventTypes.indexOf("job_completed"));

    const completed = events.find((e) => e.type === "job_completed");
    expect(completed?.payload.jobId).toBe(jobId);
    expect(completed?.payload.metrics).toBeTruthy();
  }, 120_000);
});
