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
    expect(report.commits.find((c: { jiraKey: string | null }) => c.jiraKey === "PROJ-42")).toBeTruthy();
  }, 60_000);
});
