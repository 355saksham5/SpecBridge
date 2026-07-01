import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { GitHubClient, type GitHubFile, type PullRequestResult } from "@specbridge/github-client";

const GITHUB_HTTPS_PATTERN = /^https:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?\/?$/i;
const MAX_PR_FILE_BYTES = 512_000;
const MAX_PR_FILES = 500;

export type GitHubDeliveryOptions = {
  /** Pre-resolved Authorization header (installation token). Never a raw secret. */
  authHeader: string;
  baseUrl?: string;
};

export type OpenPrOptions = {
  repoUrl: string;
  baseBranch: string;
  jobId: string;
  workspaceDir: string;
  prTitle?: string;
  prBranch?: string;
  prBody?: string;
  github: GitHubDeliveryOptions;
};

/** Parses `https://github.com/{owner}/{repo}` — GHES hosts use explicit apiBaseUrl on the client instead. */
export function parseGitHubRepoUrl(repoUrl: string): { owner: string; repo: string } | null {
  const match = repoUrl.trim().match(GITHUB_HTTPS_PATTERN);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

async function collectWorkspaceFiles(workspaceDir: string): Promise<GitHubFile[]> {
  const files: GitHubFile[] = [];
  await walkDir(workspaceDir, workspaceDir, files);
  return files.slice(0, MAX_PR_FILES);
}

async function walkDir(root: string, dir: string, acc: GitHubFile[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (acc.length >= MAX_PR_FILES) return;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      await walkDir(root, full, acc);
    } else {
      const info = await stat(full);
      if (info.size > MAX_PR_FILE_BYTES) continue;
      const rel = relative(root, full).replace(/\\/g, "/");
      acc.push({ path: rel, content: await readFile(full) });
    }
  }
}

/**
 * Opens a merge-safe onboarding PR: only listed workspace files are added or
 * updated on a new branch — existing repo files outside the bundle are never deleted.
 */
export async function openOnboardingPullRequest(options: OpenPrOptions): Promise<PullRequestResult> {
  const parsed = parseGitHubRepoUrl(options.repoUrl);
  if (!parsed) {
    throw new Error(`Unsupported repoUrl for PR delivery (github.com HTTPS only in v1): ${options.repoUrl}`);
  }

  const files = await collectWorkspaceFiles(options.workspaceDir);
  if (files.length === 0) {
    throw new Error("No workspace files collected for PR delivery");
  }

  const client = new GitHubClient({
    authHeader: options.github.authHeader,
    baseUrl: options.github.baseUrl,
  });

  const branch = options.prBranch ?? `sdd/onboarding/${options.jobId}`;
  const title = options.prTitle ?? "chore(sdd): brownfield SDD onboarding via SpecBridge";
  const body =
    options.prBody ??
    [
      "Automated SDD onboarding bundle from SpecBridge.",
      "",
      `- Job: \`${options.jobId}\``,
      `- Files: ${files.length} (additive only — no existing files deleted)`,
      "",
      "Extract and review `.sdd/docs/` and `.sdd/knowledge/` before merging.",
    ].join("\n");

  return client.openPullRequestWithFiles({
    owner: parsed.owner,
    repo: parsed.repo,
    baseBranch: options.baseBranch,
    newBranch: branch,
    files,
    commitMessage: title,
    prTitle: title,
    prBody: body,
  });
}
