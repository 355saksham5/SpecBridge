import { join } from "node:path";
import { packBundle, computeTokenReduction } from "@specbridge/bundle-packer";
import { getHeadSha, type WalkOrder, type JiraExtractSource } from "@specbridge/commit-walker";
import { bootstrapKnowledgeAtHead, emit, type BootstrapJobOptions } from "./bootstrap-pipeline.js";
import { runCommitWalkPhase, type JiraEnrichmentOptions } from "./commit-walk-pipeline.js";

const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/;

export type BrownfieldJobOptions = BootstrapJobOptions & {
  walkOrder?: WalkOrder;
  issueKeyPattern?: string;
  extractFrom?: JiraExtractSource[];
  jira?: JiraEnrichmentOptions;
};

export type BrownfieldJobResult = {
  jobId: string;
  workspaceDir: string;
  zipPath: string;
  tokenEstimateStart: number;
  tokenEstimateEnd: number;
  shardCount: number;
  commitsProcessed: number;
  commitsSkipped: number;
};

/**
 * Full job sequence per the SpecBridge core algorithm:
 * knowledge_bootstrap → commit_walk → bundle_packaging.
 *
 * Phase 4 (calibration loop) has not run yet, so `tokenEstimateEnd` equals
 * `tokenEstimateStart` and `meanQaScore` is null until Knowledge Curator /
 * Auditor are wired in.
 */
export async function runBrownfieldJob(options: BrownfieldJobOptions): Promise<BrownfieldJobResult> {
  const resolvedHeadSha = FULL_SHA_PATTERN.test(options.headSha)
    ? options.headSha
    : await getHeadSha(options.repoPath, options.headSha || "HEAD");

  const resolvedOptions: BrownfieldJobOptions = { ...options, headSha: resolvedHeadSha };
  const bootstrap = await bootstrapKnowledgeAtHead(resolvedOptions);

  const commitWalk = await runCommitWalkPhase({
    jobId: options.jobId,
    repoPath: options.repoPath,
    workspaceDir: bootstrap.workspaceDir,
    headRef: resolvedHeadSha,
    commitDepth: options.commitDepth,
    walkOrder: options.walkOrder,
    issueKeyPattern: options.issueKeyPattern,
    extractFrom: options.extractFrom,
    jira: options.jira,
    cursorApiKey: options.cursorApiKey,
    mockAgents: bootstrap.mock,
    onEvent: options.onEvent,
  });

  emit(options.onEvent, "phase_started", { phase: "bundle_packaging", jobId: options.jobId });

  const zipPath = join(options.outputDir, `specbridge-bundle-${options.jobId}.zip`);
  const { sizeBytes } = await packBundle({
    jobId: options.jobId,
    workspaceDir: bootstrap.workspaceDir,
    outputZipPath: zipPath,
    repoUrl: options.repoUrl,
    headSha: resolvedHeadSha,
    branch: options.branch,
    sddKit: bootstrap.sddKit,
    knowledge: {
      granularityPrompt: options.granularityPrompt,
      advisorPrompt: options.advisorPrompt ?? null,
      tokenEstimateStart: bootstrap.tokenEstimateStart,
      tokenEstimateEnd: bootstrap.tokenEstimateStart,
      tokenReduction: computeTokenReduction(bootstrap.tokenEstimateStart, bootstrap.tokenEstimateStart),
      shardCount: bootstrap.shardCount,
      commitDepth: options.commitDepth ?? 50,
      commitsProcessed: commitWalk.commitsProcessed,
      commitsSkipped: commitWalk.commitsSkipped,
    },
  });

  emit(options.onEvent, "bundle_ready", {
    bundleUrl: zipPath,
    sizeMb: Math.round((sizeBytes / (1024 * 1024)) * 10) / 10,
    jobId: options.jobId,
  });

  emit(options.onEvent, "job_completed", {
    jobId: options.jobId,
    metrics: {
      tokenEstimateStart: bootstrap.tokenEstimateStart,
      tokenEstimateEnd: bootstrap.tokenEstimateStart,
      tokenReduction: computeTokenReduction(bootstrap.tokenEstimateStart, bootstrap.tokenEstimateStart),
      meanQaScore: null,
      commitsProcessed: commitWalk.commitsProcessed,
      commitsSkipped: commitWalk.commitsSkipped,
    },
  });

  return {
    jobId: options.jobId,
    workspaceDir: bootstrap.workspaceDir,
    zipPath,
    tokenEstimateStart: bootstrap.tokenEstimateStart,
    tokenEstimateEnd: bootstrap.tokenEstimateStart,
    shardCount: bootstrap.shardCount,
    commitsProcessed: commitWalk.commitsProcessed,
    commitsSkipped: commitWalk.commitsSkipped,
  };
}
