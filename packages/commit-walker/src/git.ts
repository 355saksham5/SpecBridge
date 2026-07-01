import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ChangedPath, CommitDiff, CommitInfo, WalkCommitsOptions } from "./types.js";
import { EMPTY_TREE_SHA } from "./types.js";

const execFileAsync = promisify(execFile);

const FIELD_SEP = "\x1f";
const RECORD_SEP = "\x1e";

async function git(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repoPath,
    maxBuffer: 1024 * 1024 * 64,
  });
  return stdout;
}

/**
 * Walks up to `commitDepth` commits reachable from `ref` (default HEAD).
 * `oldest_first` (default) yields the N most recent commits in
 * chronological order; `newest_first` yields them from HEAD backwards.
 */
export async function walkCommits(options: WalkCommitsOptions): Promise<CommitInfo[]> {
  const ref = options.ref ?? "HEAD";
  const depth = options.commitDepth ?? 50;
  const order = options.walkOrder ?? "oldest_first";

  const format = ["%H", "%P", "%an", "%aI", "%s", "%B"].join(FIELD_SEP) + RECORD_SEP;
  const args = ["log", ref, `--max-count=${depth}`, `--pretty=format:${format}`];
  if (order === "oldest_first") args.splice(1, 0, "--reverse");

  const raw = await git(options.repoPath, args);
  if (!raw.trim()) return [];

  return raw
    .split(RECORD_SEP)
    .map((record) => record.replace(/^\n/, "").trim())
    .filter(Boolean)
    .map((record) => {
      const [sha, parents, authorName, authorDate, subject, ...messageParts] = record.split(FIELD_SEP);
      const message = messageParts.join(FIELD_SEP).trim();
      const parentList = parents.trim().split(/\s+/).filter(Boolean);
      return {
        sha: sha.trim(),
        parentSha: parentList[0] ?? null,
        authorName: authorName.trim(),
        authorDate: authorDate.trim(),
        subject: subject.trim(),
        message,
      };
    });
}

export async function getCurrentBranch(repoPath: string): Promise<string | null> {
  try {
    const out = await git(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const branch = out.trim();
    return branch === "HEAD" ? null : branch;
  } catch {
    return null;
  }
}

function parseNameStatusLine(line: string): ChangedPath | null {
  const parts = line.split("\t").filter(Boolean);
  if (parts.length === 0) return null;
  const [code, ...paths] = parts;

  if (code.startsWith("R") || code.startsWith("C")) {
    const [from, to] = paths;
    return {
      path: to ?? from,
      status: code.startsWith("R") ? "renamed" : "copied",
      renamedFrom: from,
    };
  }

  const path = paths[0];
  if (!path) return null;

  const statusMap: Record<string, ChangedPath["status"]> = {
    A: "added",
    M: "modified",
    D: "deleted",
  };

  return { path, status: statusMap[code] ?? "unknown" };
}

/** Diffs `parentSha..sha` without mutating the working tree (no checkout). */
export async function diffCommit(repoPath: string, sha: string, parentSha: string | null): Promise<CommitDiff> {
  const base = parentSha ?? EMPTY_TREE_SHA;
  const raw = await git(repoPath, ["diff", "--name-status", "--find-renames", base, sha]);

  const changedPaths = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseNameStatusLine)
    .filter((p): p is ChangedPath => p !== null);

  return { sha, parentSha, changedPaths };
}

export async function getHeadSha(repoPath: string, ref = "HEAD"): Promise<string> {
  const out = await git(repoPath, ["rev-parse", ref]);
  return out.trim();
}
