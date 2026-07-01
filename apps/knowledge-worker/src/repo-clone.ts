import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const MAX_REPO_URL_LENGTH = 2048;
const MAX_BRANCH_LENGTH = 255;
const CLONE_TIMEOUT_MS = 600_000;

/**
 * Shallow-clones a remote repository for production worker runs.
 * Only HTTPS URLs on allowlisted hosts should reach this function (validated upstream).
 */
export async function cloneRepoShallow(
  repoUrl: string,
  targetDir: string,
  branch: string,
): Promise<void> {
  const normalizedUrl = repoUrl.trim();
  const normalizedBranch = (branch.trim() || "main").slice(0, MAX_BRANCH_LENGTH);

  if (!normalizedUrl || normalizedUrl.length > MAX_REPO_URL_LENGTH) {
    throw new Error("repoUrl is missing or exceeds maximum length.");
  }

  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    throw new Error("repoUrl must be a valid absolute URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("repoUrl must use https.");
  }

  if (!parsed.hostname) {
    throw new Error("repoUrl must include a hostname.");
  }

  await execFileAsync(
    "git",
    ["clone", "--depth", "1", "--branch", normalizedBranch, normalizedUrl, targetDir],
    {
      timeout: CLONE_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
      },
    },
  );
}

export function shouldCloneRemoteRepo(options: {
  repoUrl?: string;
  repoPath?: string;
}): boolean {
  if (process.env.SPECBRIDGE_SKIP_CLONE === "true") {
    return false;
  }

  if (options.repoPath) {
    return false;
  }

  return Boolean(options.repoUrl?.trim());
}
