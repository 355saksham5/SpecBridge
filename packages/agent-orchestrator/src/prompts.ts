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

export type CommitCalibratorTaskInput = {
  commitSha: string;
  retroSpecText: string;
  predictedPaths: string[];
  actualPaths: string[];
  overlapPercent: number;
  missedPaths: string[];
  hallucinatedPaths: string[];
};

export function buildCommitCalibratorTaskPrompt(input: CommitCalibratorTaskInput): string {
  return [
    `Review the calibration for commit ${input.commitSha}.`,
    "",
    "The predicted change set was extracted deterministically from the retro feature_spec.md;",
    "the actual change set comes from `git diff parent..C_i`. Overlap math is already computed —",
    "your job is to add qualitative commentary, not to recompute the numbers.",
    "",
    `Overlap: ${(input.overlapPercent * 100).toFixed(1)}%`,
    `Predicted paths: ${input.predictedPaths.join(", ") || "(none)"}`,
    `Actual paths: ${input.actualPaths.join(", ") || "(none)"}`,
    `Missed (actual but not predicted): ${input.missedPaths.join(", ") || "(none)"}`,
    `Hallucinated (predicted but not actual): ${input.hallucinatedPaths.join(", ") || "(none)"}`,
    "",
    "Retro spec excerpt:",
    input.retroSpecText.slice(0, 4000),
    "",
    "Do NOT generate questions — that is the Question Prober's job.",
  ].join("\n");
}

export type QuestionProberTaskInput = {
  commitSha: string;
  overlapPercent: number;
  missedPaths: string[];
  hallucinatedPaths: string[];
  questionCount: number;
};

export function buildQuestionProberTaskPrompt(input: QuestionProberTaskInput): string {
  return [
    `Generate exactly ${input.questionCount} probing questions about the knowledge gaps for commit ${input.commitSha}.`,
    "",
    `Calibration overlap: ${(input.overlapPercent * 100).toFixed(1)}%`,
    `Paths the prediction missed: ${input.missedPaths.join(", ") || "(none)"}`,
    `Paths incorrectly predicted (hallucinated): ${input.hallucinatedPaths.join(", ") || "(none)"}`,
    "",
    "Questions only — no answers. Ground each question in a specific missed or hallucinated path",
    "where possible; fill remaining questions with adversarial probes about the current knowledge",
    "store's coverage, using the probing style in your system prompt.",
    "",
    ...jsonResponseInstructions(
      `{"questions": [{"id": "q1", "text": "...", "category": "missed_path" | "hallucinated_path" | "coverage", "relatedPaths": ["..."]}]}`,
      `Produce exactly ${input.questionCount} entries in "questions", each with a unique "id".`,
    ),
  ].join("\n");
}

export type KnowledgeCuratorTaskInput = {
  commitSha: string;
  questions: Array<{ id: string; text: string }>;
  knownShardPaths: string[];
  priorAuditFeedback?: string;
};

export function buildKnowledgeCuratorTaskPrompt(input: KnowledgeCuratorTaskInput): string {
  return [
    `Answer the following questions for commit ${input.commitSha} using the knowledge store ONLY.`,
    "`no_repo_reexplore` is a hard constraint — do not read the target repo's source files.",
    "",
    "Questions:",
    ...input.questions.map((q) => `- [${q.id}] ${q.text}`),
    "",
    "Known shard paths available for citation:",
    input.knownShardPaths.join(", ") || "(knowledge store is empty)",
    "",
    input.priorAuditFeedback
      ? `Previous audit round rejected some patches. Feedback:\n${input.priorAuditFeedback}\n`
      : "",
    "For each question, cite the shard path(s) your answer is grounded in. Propose shard patches",
    "(replace/append/delete/update_weight) only where they measurably improve retrieval fidelity —",
    "do not patch speculatively.",
    "",
    ...jsonResponseInstructions(
      `{"answers": [{"questionId": "q1", "answer": "...", "citations": ["path/to/shard.md"]}], "patches": [{"targetPath": "path/to/shard.md", "operation": "replace" | "append" | "delete" | "update_weight", "content": "...", "tokenDelta": 0}]}`,
      `Include exactly one "answers" entry per question id listed above. Omit "patches" entries you are not proposing.`,
    ),
  ]
    .filter(Boolean)
    .join("\n");
}

export type KnowledgeAuditorTaskInput = {
  commitSha: string;
  answerCount: number;
  patchCount: number;
  knownShardPaths: string[];
  minAnswerScore: number;
};

export function buildKnowledgeAuditorTaskPrompt(input: KnowledgeAuditorTaskInput): string {
  return [
    `Audit the Knowledge Curator's proposal for commit ${input.commitSha}.`,
    "",
    `Answers to validate: ${input.answerCount}`,
    `Patches to validate: ${input.patchCount}`,
    `Minimum passing answer score: ${input.minAnswerScore}`,
    "",
    "Known shard paths (any citation outside this list is invalid):",
    input.knownShardPaths.join(", ") || "(knowledge store is empty)",
    "",
    "Check citation validity, estimate each patch's token budget impact, and score coverage,",
    "precision, citation validity, and token efficiency independently. Approve or reject each",
    "patch individually — do not block the whole batch on one bad patch.",
    "",
    ...jsonResponseInstructions(
      `{"overallPass": true | false, "scores": {"coverage": 0.0, "precision": 0.0, "citation": 0.0, "tokenEfficiency": 0.0}, "patches": [{"targetPath": "path/to/shard.md", "approved": true | false, "reason": "..."}]}`,
      `Set "overallPass" to true only if the mean of the four scores is at least ${input.minAnswerScore}. Include exactly one "patches" entry per patch under review.`,
    ),
  ].join("\n");
}

/** Shared trailer that pushes agents toward a single, parseable JSON response. */
function jsonResponseInstructions(shape: string, extra: string): string[] {
  return [
    "## Response format (required)",
    "Respond with ONLY a single JSON object — no markdown code fence, no commentary before or",
    "after it. If you also write the artifact to a file, still repeat the same JSON as your",
    "final response text so the pipeline can ingest it directly. Shape:",
    shape,
    extra,
  ];
}

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
    "Whether or not your tools can write that file, your final response text must also be the",
    "complete Markdown content of the spec — no extra commentary before or after it — so the",
    "pipeline can persist it even if the file write did not happen.",
  ].join("\n");
}
