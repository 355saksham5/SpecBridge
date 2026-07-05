import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveTextArtifact, syncAgentDirectory } from "../apps/knowledge-worker/src/agent-artifact-resolution.js";

describe("resolveTextArtifact", () => {
  let repoPath: string;
  let workspaceDir: string;

  beforeEach(async () => {
    repoPath = await mkdtemp(join(tmpdir(), "specbridge-artifact-repo-"));
    workspaceDir = await mkdtemp(join(tmpdir(), "specbridge-artifact-workspace-"));
  });

  afterEach(async () => {
    await rm(repoPath, { recursive: true, force: true });
    await rm(workspaceDir, { recursive: true, force: true });
  });

  it("prefers a file already staged in the workspace", async () => {
    const relativePath = "spec.md";
    await writeFile(join(workspaceDir, relativePath), "workspace content", "utf-8");
    await writeFile(join(repoPath, relativePath), "repo content", "utf-8");

    const result = await resolveTextArtifact({ repoPath, workspaceDir, relativePath, agentResponseText: "response content" });

    expect(result).toEqual({ content: "workspace content", source: "workspace_file" });
  });

  it("copies a file the agent wrote into its repo cwd when nothing is staged in the workspace", async () => {
    const relativePath = "nested/spec.md";
    await mkdir(join(repoPath, "nested"), { recursive: true });
    await writeFile(join(repoPath, relativePath), "repo content", "utf-8");

    const result = await resolveTextArtifact({ repoPath, workspaceDir, relativePath, agentResponseText: "response content" });

    expect(result).toEqual({ content: "repo content", source: "repo_file" });
    expect(await readFile(join(workspaceDir, relativePath), "utf-8")).toBe("repo content");
  });

  it("falls back to the agent's response text when no file exists anywhere", async () => {
    const relativePath = "spec.md";

    const result = await resolveTextArtifact({ repoPath, workspaceDir, relativePath, agentResponseText: "response content" });

    expect(result).toEqual({ content: "response content", source: "agent_response" });
    expect(await readFile(join(workspaceDir, relativePath), "utf-8")).toBe("response content");
  });

  it("returns 'none' when there is no file and no response text", async () => {
    const result = await resolveTextArtifact({ repoPath, workspaceDir, relativePath: "spec.md" });
    expect(result).toEqual({ content: "", source: "none" });
  });

  it("treats a whitespace-only file as empty and keeps looking", async () => {
    const relativePath = "spec.md";
    await writeFile(join(workspaceDir, relativePath), "   \n  ", "utf-8");
    await writeFile(join(repoPath, relativePath), "real repo content", "utf-8");

    const result = await resolveTextArtifact({ repoPath, workspaceDir, relativePath });

    expect(result).toEqual({ content: "real repo content", source: "repo_file" });
  });
});

describe("syncAgentDirectory", () => {
  let repoPath: string;
  let workspaceDir: string;

  beforeEach(async () => {
    repoPath = await mkdtemp(join(tmpdir(), "specbridge-syncdir-repo-"));
    workspaceDir = await mkdtemp(join(tmpdir(), "specbridge-syncdir-workspace-"));
  });

  afterEach(async () => {
    await rm(repoPath, { recursive: true, force: true });
    await rm(workspaceDir, { recursive: true, force: true });
  });

  it("copies a directory tree from the repo into the workspace", async () => {
    await mkdir(join(repoPath, ".sdd", "docs"), { recursive: true });
    await writeFile(join(repoPath, ".sdd", "docs", "project_knowledge.md"), "# Truth doc", "utf-8");

    const copied = await syncAgentDirectory({ repoPath, workspaceDir, relativeDir: join(".sdd", "docs") });

    expect(copied).toBe(true);
    expect(await readFile(join(workspaceDir, ".sdd", "docs", "project_knowledge.md"), "utf-8")).toBe("# Truth doc");
  });

  it("returns false when the source directory does not exist", async () => {
    const copied = await syncAgentDirectory({ repoPath, workspaceDir, relativeDir: join(".sdd", "docs") });
    expect(copied).toBe(false);
  });

  it("does not clobber a file already staged in the workspace", async () => {
    await mkdir(join(repoPath, ".sdd", "docs"), { recursive: true });
    await writeFile(join(repoPath, ".sdd", "docs", "project_knowledge.md"), "repo version", "utf-8");

    await mkdir(join(workspaceDir, ".sdd", "docs"), { recursive: true });
    await writeFile(join(workspaceDir, ".sdd", "docs", "project_knowledge.md"), "workspace version", "utf-8");

    await syncAgentDirectory({ repoPath, workspaceDir, relativeDir: join(".sdd", "docs") });

    expect(await readFile(join(workspaceDir, ".sdd", "docs", "project_knowledge.md"), "utf-8")).toBe("workspace version");
  });
});
