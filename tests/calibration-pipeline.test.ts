import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildManifest,
  computeShardId,
  estimateTokens,
  writeKnowledgeStore,
  readManifest,
  type KnowledgeShard,
} from "@specbridge/knowledge-store";
import { runCalibrationLoop } from "../apps/knowledge-worker/src/calibration-pipeline.js";

async function seedWorkspace(workspaceDir: string, specText: string): Promise<void> {
  const shards: KnowledgeShard[] = [
    {
      relativePath: "shards/class/Foo.cs#Foo.md",
      frontMatter: {
        id: computeShardId("Foo"),
        granularity: "tokenize_class",
        path: "src/Foo.cs",
        symbol: "Foo",
        commitSha: "deadbeef",
        tokenEstimate: estimateTokens("Foo handles domain logic."),
        tags: ["domain"],
      },
      content: "Foo handles domain logic.",
    },
  ];
  const manifest = buildManifest(shards, { headSha: "deadbeef", granularity: "tokenize_class" });
  await writeKnowledgeStore(workspaceDir, manifest, shards);

  const specPath = join(workspaceDir, ".sdd", "features", "completed", "PROJ-1", "feature_spec.md");
  await mkdir(join(specPath, ".."), { recursive: true });
  await writeFile(specPath, specText, "utf-8");
}

describe("runCalibrationLoop", () => {
  let workspaceDir: string;

  beforeEach(async () => {
    workspaceDir = await mkdtemp(join(tmpdir(), "specbridge-calibration-"));
  });

  afterEach(async () => {
    await rm(workspaceDir, { recursive: true, force: true });
  });

  it("passes on round 1, applies the approved patch, and reports a positive token delta", async () => {
    const specText = "This change touches `src/Foo.cs` to fix the domain rule.";
    await seedWorkspace(workspaceDir, specText);

    const result = await runCalibrationLoop({
      jobId: "job-1",
      workspaceDir,
      commitSha: "c0ffee0",
      retroSpecRelativePath: ".sdd/features/completed/PROJ-1/feature_spec.md",
      actualChangedPaths: ["src/Foo.cs"],
      mock: true,
    });

    expect(result.calibrationReport.overlapPercent).toBe(1);
    expect(result.roundsRun).toBe(1);
    expect(result.finalPass).toBe(true);
    expect(result.tokenDelta).toBeGreaterThan(0);
    expect(result.patchesApproved).toBe(1);
    expect(result.patchesRejected).toBe(0);

    const manifestAfter = await readManifest(workspaceDir);
    expect(manifestAfter.tokenEstimateTotal).toBeGreaterThan(0);

    const calibrationReportOnDisk = JSON.parse(
      await readFile(
        join(workspaceDir, ".sdd", "reports", "calibration", "c0ffee0", "calibration-report.json"),
        "utf-8",
      ),
    );
    expect(calibrationReportOnDisk.overlapPercent).toBe(1);
  });

  it("reports a missed path when the spec doesn't mention the changed file", async () => {
    const specText = "This change fixes a bug in the domain layer (no file paths mentioned).";
    await seedWorkspace(workspaceDir, specText);

    const result = await runCalibrationLoop({
      jobId: "job-2",
      workspaceDir,
      commitSha: "abc0000",
      retroSpecRelativePath: ".sdd/features/completed/PROJ-1/feature_spec.md",
      actualChangedPaths: ["src/Untouched.cs"],
      mock: true,
    });

    expect(result.calibrationReport.overlapPercent).toBe(0);
    expect(result.calibrationReport.missedPaths).toEqual(["src/Untouched.cs"]);
  });

  it("exhausts maxRoundsPerCommit and reports failure when minAnswerScore is unreachable", async () => {
    const specText = "This change touches `src/Foo.cs`.";
    await seedWorkspace(workspaceDir, specText);

    const result = await runCalibrationLoop({
      jobId: "job-3",
      workspaceDir,
      commitSha: "fffff00",
      retroSpecRelativePath: ".sdd/features/completed/PROJ-1/feature_spec.md",
      actualChangedPaths: ["src/Foo.cs"],
      mock: true,
      minAnswerScore: 0.999,
      maxRoundsPerCommit: 2,
    });

    expect(result.roundsRun).toBe(2);
    expect(result.finalPass).toBe(false);
    expect(result.patchesApproved).toBe(0);
    expect(result.patchesRejected).toBeGreaterThan(0);
    expect(result.tokenDelta).toBe(0);

    // Nothing should have been written to the knowledge store since no patch was approved.
    const manifestAfter = await readManifest(workspaceDir);
    const fooEntry = manifestAfter.shards.find((s) => s.relativePath === "shards/class/Foo.cs#Foo.md");
    expect(fooEntry?.tokenEstimate).toBe(estimateTokens("Foo handles domain logic."));
  });

  it("clamps devilsAdvocateQuestionCount into the 5-30 range", async () => {
    const specText = "This change touches `src/Foo.cs`.";
    await seedWorkspace(workspaceDir, specText);

    const result = await runCalibrationLoop({
      jobId: "job-4",
      workspaceDir,
      commitSha: "1111100",
      retroSpecRelativePath: ".sdd/features/completed/PROJ-1/feature_spec.md",
      actualChangedPaths: ["src/Foo.cs"],
      mock: true,
      devilsAdvocateQuestionCount: 1000,
    });

    expect(result.questionCount).toBe(30);
  });
});
