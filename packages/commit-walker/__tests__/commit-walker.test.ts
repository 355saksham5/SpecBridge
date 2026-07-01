import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { walkCommits, diffCommit, extractJiraKey, enrichWithJiraKeys } from "../src/index.js";

const execFileAsync = promisify(execFile);

async function git(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: repoPath });
  return stdout;
}

describe("commit-walker", () => {
  let repoPath: string;
  let firstSha: string;
  let secondSha: string;

  beforeAll(async () => {
    repoPath = await mkdtemp(join(tmpdir(), "specbridge-commit-walker-"));
    await git(repoPath, ["init", "-q"]);
    await git(repoPath, ["config", "user.email", "test@specbridge.io"]);
    await git(repoPath, ["config", "user.name", "SpecBridge Test"]);

    await writeFile(join(repoPath, "a.txt"), "hello\n", "utf-8");
    await git(repoPath, ["add", "a.txt"]);
    await git(repoPath, ["commit", "-q", "-m", "PROJ-1: add a.txt"]);
    firstSha = (await git(repoPath, ["rev-parse", "HEAD"])).trim();

    await writeFile(join(repoPath, "b.txt"), "world\n", "utf-8");
    await git(repoPath, ["add", "b.txt"]);
    await git(repoPath, ["commit", "-q", "-m", "chore: unrelated cleanup"]);
    secondSha = (await git(repoPath, ["rev-parse", "HEAD"])).trim();
  }, 30_000);

  afterAll(async () => {
    await rm(repoPath, { recursive: true, force: true });
  });

  it("walks commits oldest-first by default", async () => {
    const commits = await walkCommits({ repoPath });
    expect(commits.map((c) => c.sha)).toEqual([firstSha, secondSha]);
    expect(commits[0].subject).toBe("PROJ-1: add a.txt");
  });

  it("walks commits newest-first when requested", async () => {
    const commits = await walkCommits({ repoPath, walkOrder: "newest_first" });
    expect(commits.map((c) => c.sha)).toEqual([secondSha, firstSha]);
  });

  it("extracts Jira key from commit message using custom pattern", async () => {
    const commits = await walkCommits({ repoPath });
    const enriched = enrichWithJiraKeys(commits, { issueKeyPattern: "PROJ-\\d+" });

    expect(enriched[0].jiraKey).toBe("PROJ-1");
    expect(enriched[0].skippedReason).toBeNull();
    expect(enriched[1].jiraKey).toBeNull();
    expect(enriched[1].skippedReason).toBe("no_jira_key");
  });

  it("returns null when no pattern matches", () => {
    const key = extractJiraKey(
      { sha: "abc", parentSha: null, authorName: "x", authorDate: "", subject: "no key here", message: "no key here" },
      { issueKeyPattern: "PROJ-\\d+" },
    );
    expect(key).toBeNull();
  });

  it("diffs a commit against its parent without checkout", async () => {
    const diff = await diffCommit(repoPath, secondSha, firstSha);
    expect(diff.changedPaths).toEqual([{ path: "b.txt", status: "added" }]);
  });

  it("diffs the root commit against the empty tree", async () => {
    const diff = await diffCommit(repoPath, firstSha, null);
    expect(diff.changedPaths).toEqual([{ path: "a.txt", status: "added" }]);
  });
});
