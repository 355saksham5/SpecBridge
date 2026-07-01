import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  walkCommits,
  diffCommit,
  getCurrentBranch,
  enrichWithJiraKeys,
  type WalkOrder,
  type JiraExtractSource,
  type CommitWithJira,
} from "@specbridge/commit-walker";
import { JiraClient, type JiraIssue } from "@specbridge/jira-client";
import {
  loadAgentPrompt,
  createAgentSession,
  buildFeatureHistorianTaskPrompt,
} from "@specbridge/agent-orchestrator";
import type { EmitFn } from "./bootstrap-pipeline.js";
import { emit } from "./bootstrap-pipeline.js";

export type JiraEnrichmentOptions = {
  /** Pre-resolved Authorization header value (`Bearer …` / `Basic …`). Never a raw secret name. */
  baseUrl: string;
  authHeader: string;
};

export type CommitWalkOptions = {
  jobId: string;
  repoPath: string;
  workspaceDir: string;
  headRef?: string;
  commitDepth?: number;
  walkOrder?: WalkOrder;
  issueKeyPattern?: string;
  extractFrom?: JiraExtractSource[];
  jira?: JiraEnrichmentOptions;
  cursorApiKey?: string;
  mockAgents?: boolean;
  onEvent?: EmitFn;
};

export type ProcessedCommitRecord = {
  commitSha: string;
  jiraKey: string | null;
  skippedReason: "no_jira_key" | null;
  changedPaths: string[];
  retroSpecPath: string | null;
};

export type CommitWalkResult = {
  commitsProcessed: number;
  commitsSkipped: number;
  commits: ProcessedCommitRecord[];
  reportPath: string;
};

function mockJiraIssue(key: string): JiraIssue {
  return {
    key,
    summary: `Mock issue ${key} (no Jira connection configured)`,
    descriptionText: "No Jira connection configured for this job — description unavailable in mock mode.",
    issueType: "Task",
    status: "Unknown",
    priority: null,
    labels: [],
    assignee: null,
    reporter: null,
    created: "",
    updated: "",
  };
}

/**
 * Phase 3 core: walks commits oldest→newest, extracts Jira keys, and runs the
 * Feature Historian per Jira-linked commit. Commits without a matched key
 * emit `commit_skipped` and are not counted as processed.
 */
export async function runCommitWalkPhase(options: CommitWalkOptions): Promise<CommitWalkResult> {
  emit(options.onEvent, "phase_started", { phase: "commit_walk", jobId: options.jobId });

  const mock = options.mockAgents ?? !options.cursorApiKey;

  const commits = await walkCommits({
    repoPath: options.repoPath,
    ref: options.headRef ?? "HEAD",
    commitDepth: options.commitDepth ?? 50,
    walkOrder: options.walkOrder ?? "oldest_first",
  });

  const branchName = (await getCurrentBranch(options.repoPath).catch(() => null)) ?? undefined;

  const enriched = enrichWithJiraKeys(commits, {
    issueKeyPattern: options.issueKeyPattern,
    extractFrom: options.extractFrom,
    branchName,
  });

  const jiraClient = options.jira ? new JiraClient(options.jira) : null;
  const featureHistorianPrompt = await loadAgentPrompt("feature-historian");

  const records: ProcessedCommitRecord[] = [];
  let commitsProcessed = 0;
  let commitsSkipped = 0;

  for (const commit of enriched) {
    if (!commit.jiraKey) {
      emit(options.onEvent, "commit_skipped", { commitSha: commit.sha, reason: "no_jira_key", jobId: options.jobId });
      commitsSkipped++;
      records.push({
        commitSha: commit.sha,
        jiraKey: null,
        skippedReason: "no_jira_key",
        changedPaths: [],
        retroSpecPath: null,
      });
      continue;
    }

    const record = await processJiraLinkedCommit(commit, {
      ...options,
      mock,
      jiraClient,
      featureHistorianPrompt,
    });
    records.push(record);
    commitsProcessed++;
  }

  const reportPath = await writeCommitWalkReport(options.workspaceDir, options.jobId, records);

  return { commitsProcessed, commitsSkipped, commits: records, reportPath };
}

async function processJiraLinkedCommit(
  commit: CommitWithJira,
  ctx: CommitWalkOptions & { mock: boolean; jiraClient: JiraClient | null; featureHistorianPrompt: string },
): Promise<ProcessedCommitRecord> {
  const jiraKey = commit.jiraKey!;
  const diff = await diffCommit(ctx.repoPath, commit.sha, commit.parentSha);
  const changedPaths = diff.changedPaths.map((p) => p.path);

  const issue = ctx.jiraClient ? await ctx.jiraClient.getIssue(jiraKey).catch(() => mockJiraIssue(jiraKey)) : mockJiraIssue(jiraKey);

  const outputPath = `.sdd/features/completed/${jiraKey}/feature_spec.md`;
  const taskPrompt = buildFeatureHistorianTaskPrompt({
    jiraKey,
    jiraSummary: issue.summary,
    jiraDescription: issue.descriptionText,
    jiraIssueType: issue.issueType,
    commitSha: commit.sha,
    commitSubject: commit.subject,
    commitMessage: commit.message,
    changedPaths,
    outputPath,
  });

  await using session = await createAgentSession({
    apiKey: ctx.cursorApiKey ?? "mock",
    role: "feature-historian",
    cwd: ctx.repoPath,
    systemPrompt: ctx.featureHistorianPrompt,
    mock: ctx.mock,
    onEvent: ctx.onEvent,
  });

  const result = await session.run(taskPrompt);

  const absoluteOutputPath = join(ctx.workspaceDir, outputPath);
  if (ctx.mock) {
    await synthesizeRetroFeatureSpec(absoluteOutputPath, jiraKey, commit, issue, changedPaths);
  }

  await session.writeHandoff(outputPath, result.result ?? "", commit.sha);

  return {
    commitSha: commit.sha,
    jiraKey,
    skippedReason: null,
    changedPaths,
    retroSpecPath: outputPath,
  };
}

async function synthesizeRetroFeatureSpec(
  absolutePath: string,
  jiraKey: string,
  commit: CommitWithJira,
  issue: JiraIssue,
  changedPaths: string[],
): Promise<void> {
  await mkdir(join(absolutePath, ".."), { recursive: true });

  const content = [
    `# Retro Feature Spec — ${jiraKey}`,
    `> Generated by Feature Historian (mock) from commit ${commit.sha}`,
    "",
    "## Problem",
    issue.summary || "(no summary available)",
    "",
    "## Goals",
    "- TBD (mock mode — no real agent exploration performed)",
    "",
    "## Non-goals",
    "- TBD",
    "",
    "## Constraints",
    "- TBD",
    "",
    "## Changed paths (ground truth)",
    changedPaths.length ? changedPaths.map((p) => `- ${p}`).join("\n") : "(none recorded)",
    "",
    "## Commit message",
    "```",
    commit.message,
    "```",
    "",
  ].join("\n");

  await writeFile(absolutePath, content, "utf-8");
}

async function writeCommitWalkReport(
  workspaceDir: string,
  jobId: string,
  records: ProcessedCommitRecord[],
): Promise<string> {
  const reportsDir = join(workspaceDir, ".sdd", "reports");
  await mkdir(reportsDir, { recursive: true });

  const reportPath = join(reportsDir, `onboarding-${jobId}.json`);
  const report = {
    jobId,
    generatedAt: new Date().toISOString(),
    commits: records,
  };

  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf-8");
  return reportPath;
}
