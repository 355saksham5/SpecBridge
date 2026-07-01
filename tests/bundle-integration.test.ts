import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { runKnowledgeBootstrap } from "../apps/knowledge-worker/src/bootstrap-pipeline.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("bundle integration", () => {
  let outputDir: string;

  beforeAll(async () => {
    outputDir = await mkdtemp(join(tmpdir(), "specbridge-test-"));
  }, 60_000);

  afterAll(async () => {
    if (outputDir) await rm(outputDir, { recursive: true, force: true });
  });

  it("runs Phase 2 bootstrap pipeline and produces bundle ZIP", async () => {
    const jobId = randomUUID();

    const result = await runKnowledgeBootstrap({
      jobId,
      repoPath: REPO_ROOT,
      repoUrl: "https://github.com/org/specbridge",
      branch: "master",
      headSha: "a".repeat(40),
      outputDir,
      granularityPrompt: "tokenize_class",
      mockAgents: true,
      sddKit: { id: "csharp-sdd-starter-kit", version: "1.0.0", sourceDir: REPO_ROOT },
    });

    expect(result.shardCount).toBeGreaterThan(0);
    expect(result.tokenEstimateStart).toBeGreaterThan(0);

    const zipStat = await stat(result.zipPath);
    expect(zipStat.size).toBeGreaterThan(1000);
  }, 60_000);
});
