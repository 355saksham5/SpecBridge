import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { runBrownfieldJob } from "../apps/knowledge-worker/src/job-pipeline.js";

const execFileAsync = promisify(execFile);
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

async function git(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: repoPath });
  return stdout;
}

describe("commit walk integration", () => {
  let sourceRepo: string;
  let outputDir: string;

  beforeAll(async () => {
    sourceRepo = await mkdtemp(join(tmpdir(), "specbridge-source-"));
    outputDir = await mkdtemp(join(tmpdir(), "specbridge-job-"));

    await git(sourceRepo, ["init", "-q"]);
    await git(sourceRepo, ["config", "user.email", "test@specbridge.io"]);
    await git(sourceRepo, ["config", "user.name", "SpecBridge Test"]);

    await writeFile(join(sourceRepo, "feature.ts"), "export const x = 1;\n", "utf-8");
    await git(sourceRepo, ["add", "feature.ts"]);
    await git(sourceRepo, ["commit", "-q", "-m", "PROJ-42: implement feature x"]);

    await writeFile(join(sourceRepo, "README.md"), "# demo\n", "utf-8");
    await git(sourceRepo, ["add", "README.md"]);
    await git(sourceRepo, ["commit", "-q", "-m", "chore: add readme"]);
  }, 30_000);

  afterAll(async () => {
    await rm(sourceRepo, { recursive: true, force: true });
    await rm(outputDir, { recursive: true, force: true });
  });

  it("processes Jira-linked commits and skips the rest", async () => {
    const jobId = randomUUID();

    const result = await runBrownfieldJob({
      jobId,
      repoPath: sourceRepo,
      repoUrl: "https://github.com/org/demo",
      branch: "master",
      headSha: "HEAD",
      outputDir,
      granularityPrompt: "tokenize_class",
      mockAgents: true,
      issueKeyPattern: "PROJ-\\d+",
      sddKit: { id: "csharp-sdd-starter-kit", version: "1.0.0", sourceDir: REPO_ROOT },
    });

    expect(result.commitsProcessed).toBe(1);
    expect(result.commitsSkipped).toBe(1);

    const retroSpecPath = join(
      outputDir,
      "workspace",
      ".sdd",
      "features",
      "completed",
      "PROJ-42",
      "feature_spec.md",
    );
    const retroSpec = await readFile(retroSpecPath, "utf-8");
    expect(retroSpec).toContain("PROJ-42");

    const manifestRaw = await readFile(
      join(outputDir, "workspace", ".sdd", "reports", `onboarding-${jobId}.json`),
      "utf-8",
    );
    const report = JSON.parse(manifestRaw);
    expect(report.commits).toHaveLength(2);
    const proj42 = report.commits.find((c: { jiraKey: string | null }) => c.jiraKey === "PROJ-42");
    expect(proj42).toBeTruthy();

    // Calibration loop ran for the Jira-linked commit and produced a quality signal.
    expect(proj42.calibration).toBeTruthy();
    expect(proj42.calibration.roundsRun).toBe(1);
    expect(proj42.calibration.finalPass).toBe(true);
    expect(proj42.calibration.qaScore).toBeGreaterThan(0);
    expect(report.meanQaScore).toBeGreaterThan(0);
    expect(report.calibrationOverlapMean).toBeGreaterThanOrEqual(0);

    // job-level token budget reflects the approved curator patch.
    expect(result.meanQaScore).toBeCloseTo(report.meanQaScore, 5);
    expect(result.tokenEstimateEnd).toBeGreaterThan(result.tokenEstimateStart);

    // All four calibration-loop artifacts were written and are schema-valid JSON.
    const calibrationDir = join(
      outputDir,
      "workspace",
      ".sdd",
      "reports",
      "calibration",
      proj42.commitSha,
    );
    const calibrationReport = JSON.parse(
      await readFile(join(calibrationDir, "calibration-report.json"), "utf-8"),
    );
    expect(calibrationReport.commitSha).toBe(proj42.commitSha);
    expect(calibrationReport.actualPaths).toContain("feature.ts");

    const questions = JSON.parse(await readFile(join(calibrationDir, "questions.json"), "utf-8"));
    expect(questions.questions.length).toBeGreaterThanOrEqual(5);

    const curationProposal = JSON.parse(
      await readFile(join(calibrationDir, "curation-proposal-round-1.json"), "utf-8"),
    );
    expect(curationProposal.answers.length).toBe(questions.questions.length);

    const auditVerdict = JSON.parse(
      await readFile(join(calibrationDir, "audit-verdict-round-1.json"), "utf-8"),
    );
    expect(auditVerdict.overallPass).toBe(true);
    expect(auditVerdict.patches.every((p: { approved: boolean }) => p.approved)).toBe(true);

    // The Knowledge Curator's approved patch actually landed in the knowledge store.
    const knowledgeManifest = JSON.parse(
      await readFile(join(outputDir, "workspace", ".sdd", "knowledge", "manifest.json"), "utf-8"),
    );
    expect(knowledgeManifest.tokenEstimateTotal).toBeGreaterThan(0);
  }, 60_000);
});
