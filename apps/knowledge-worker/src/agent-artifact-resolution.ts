import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type ResolvedTextArtifact = {
  content: string;
  source: "workspace_file" | "repo_file" | "agent_response" | "none";
};

/**
 * Resolves a single-file text/markdown artifact an agent was asked to produce, in priority
 * order: a file already staged in the bundle workspace, a file the agent wrote into its own
 * (repo) working directory per the task prompt, or the agent's direct text response as a last
 * resort. Whichever source wins is copied/written into `workspaceDir` so downstream pipeline
 * steps only ever need to read from one place.
 */
export async function resolveTextArtifact(options: {
  repoPath: string;
  workspaceDir: string;
  relativePath: string;
  agentResponseText?: string;
}): Promise<ResolvedTextArtifact> {
  const workspacePath = join(options.workspaceDir, options.relativePath);

  const fromWorkspace = await readNonEmpty(workspacePath);
  if (fromWorkspace !== null) {
    return { content: fromWorkspace, source: "workspace_file" };
  }

  const repoArtifactPath = join(options.repoPath, options.relativePath);
  const fromRepo = await readNonEmpty(repoArtifactPath);
  if (fromRepo !== null) {
    await persist(workspacePath, fromRepo);
    return { content: fromRepo, source: "repo_file" };
  }

  const fromResponse = options.agentResponseText?.trim();
  if (fromResponse) {
    await persist(workspacePath, fromResponse);
    return { content: fromResponse, source: "agent_response" };
  }

  return { content: "", source: "none" };
}

/**
 * Copies a directory an agent wrote into its own (repo) working directory — e.g. `.sdd/docs`
 * and `.sdd/knowledge` from the Knowledge Architect — into the bundle workspace, without
 * clobbering anything already staged there. Returns false when the source directory doesn't
 * exist (e.g. the agent used its response text instead of writing files).
 */
export async function syncAgentDirectory(options: {
  repoPath: string;
  workspaceDir: string;
  relativeDir: string;
}): Promise<boolean> {
  const source = join(options.repoPath, options.relativeDir);
  if (!(await pathExists(source))) return false;

  const destination = join(options.workspaceDir, options.relativeDir);
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: false });
  return true;
}

async function readNonEmpty(path: string): Promise<string | null> {
  const content = await readFile(path, "utf-8").catch(() => null);
  return content && content.trim().length > 0 ? content : null;
}

async function persist(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf-8");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
