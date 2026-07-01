import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentRole } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..", "..");

const PROMPT_FILES: Record<AgentRole, string> = {
  "knowledge-architect": "prompts/agents/knowledge-architect.md",
  "feature-historian": "prompts/agents/feature-historian.md",
  "commit-calibrator": "prompts/agents/commit-calibrator.md",
  "question-prober": "prompts/agents/question-prober.md",
  "knowledge-curator": "prompts/agents/knowledge-curator.md",
  "knowledge-auditor": "prompts/agents/knowledge-auditor.md",
};

const COUNCIL_PROMPTS = {
  code: "prompts/council-v2-code.md",
  deploy: "prompts/council-v2-deploy.md",
};

export async function loadAgentPrompt(role: AgentRole): Promise<string> {
  const rel = PROMPT_FILES[role];
  const path = join(REPO_ROOT, rel);
  try {
    return await readFile(path, "utf-8");
  } catch {
    return `# ${role}\n\nSystem prompt not found at ${rel}. Placeholder for Phase 2.`;
  }
}

export async function loadCouncilPrompts(): Promise<{ code: string; deploy: string }> {
  const [code, deploy] = await Promise.all([
    readFile(join(REPO_ROOT, COUNCIL_PROMPTS.code), "utf-8").catch(() => ""),
    readFile(join(REPO_ROOT, COUNCIL_PROMPTS.deploy), "utf-8").catch(() => ""),
  ]);
  return { code, deploy };
}

export function buildKnowledgeArchitectSystemPrompt(
  basePrompt: string,
  councilCode: string,
  councilDeploy: string,
  options: {
    stackProfileJson: string;
    granularityPrompt: string;
    advisorPrompt?: string;
    confluenceContext?: string;
  },
): string {
  const sections = [
    basePrompt,
    "",
    "## Stack Profile (injected)",
    "```json",
    options.stackProfileJson,
    "```",
    "",
    "## Council-v2 Code Doc Instructions",
    councilCode,
    "",
    "## Council-v2 Deploy Doc Instructions",
    councilDeploy,
    "",
    "## Tokenization Strategy",
    `Granularity: \`${options.granularityPrompt}\``,
    "",
    options.advisorPrompt ? `## Advisor Prompt\n${options.advisorPrompt}\n` : "",
    options.confluenceContext ? `## Confluence Context\n${options.confluenceContext}\n` : "",
  ].filter(Boolean);

  return sections.join("\n");
}

export function buildAgentUserPrompt(role: AgentRole, taskDescription: string): string {
  return `[SpecBridge Agent: ${role}]\n\n${taskDescription}`;
}

export type FeatureHistorianTaskInput = {
  jiraKey: string;
  jiraSummary: string;
  jiraDescription: string;
  jiraIssueType: string;
  commitSha: string;
  commitSubject: string;
  commitMessage: string;
  changedPaths: string[];
  outputPath: string;
};

export function buildFeatureHistorianTaskPrompt(input: FeatureHistorianTaskInput): string {
  return [
    `Write a retrospective feature_spec.md for Jira issue ${input.jiraKey} at commit ${input.commitSha}.`,
    "",
    "## Jira issue",
    `- Key: ${input.jiraKey}`,
    `- Type: ${input.jiraIssueType}`,
    `- Summary: ${input.jiraSummary}`,
    "- Description:",
    input.jiraDescription || "(no description provided)",
    "",
    "## Commit",
    `- SHA: ${input.commitSha}`,
    `- Subject: ${input.commitSubject}`,
    "- Full message:",
    input.commitMessage,
    "",
    "## Changed paths (ground truth — do not invent paths outside this list)",
    input.changedPaths.length ? input.changedPaths.map((p) => `- ${p}`).join("\n") : "(no changed paths recorded)",
    "",
    `Write the result to: ${input.outputPath}`,
  ].join("\n");
}
