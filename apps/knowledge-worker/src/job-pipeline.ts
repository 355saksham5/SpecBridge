import { join } from "node:path";
import { packBundle, computeTokenReduction } from "@specbridge/bundle-packer";
import { getHeadSha, type WalkOrder, type JiraExtractSource } from "@specbridge/commit-walker";
import { bootstrapKnowledgeAtHead, emit, type BootstrapJobOptions } from "./bootstrap-pipeline.js";
import { runCommitWalkPhase, type JiraEnrichmentOptions, type ValidationOptions } from "./commit-walk-pipeline.js";

const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/;

export type BrownfieldJobOptions = BootstrapJobOptions & {
  walkOrder?: WalkOrder;
  issueKeyPattern?: string;
  extractFrom?: JiraExtractSource[];
  jira?: JiraEnrichmentOptions;
  validation?: ValidationOptions;
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
  meanQaScore: number | null;
  calibrationOverlapMean: number | null;
};

/**
 * Full job sequence per the SpecBridge core algorithm:
 * knowledge_bootstrap -> commit_walk (incl. calibration loop) -> bundle_packaging.
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
    validation: options.validation,
    onEvent: options.onEvent,
  });

  // Approved curator patches change the shard token budget after bootstrap.
  const tokenEstimateEnd = Math.max(0, bootstrap.tokenEstimateStart + commitWalk.tokenDeltaTotal);

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
      tokenEstimateEnd,
      tokenReduction: computeTokenReduction(bootstrap.tokenEstimateStart, tokenEstimateEnd),
      shardCount: bootstrap.shardCount,
      commitDepth: options.commitDepth ?? 50,
      commitsProcessed: commitWalk.commitsProcessed,
      commitsSkipped: commitWalk.commitsSkipped,
      meanQaScore: commitWalk.meanQaScore,
      calibrationOverlapMean: commitWalk.calibrationOverlapMean,
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
      tokenEstimateEnd,
      tokenReduction: computeTokenReduction(bootstrap.tokenEstimateStart, tokenEstimateEnd),
      meanQaScore: commitWalk.meanQaScore,
      calibrationOverlapMean: commitWalk.calibrationOverlapMean,
      commitsProcessed: commitWalk.commitsProcessed,
      commitsSkipped: commitWalk.commitsSkipped,
    },
  });

  return {
    jobId: options.jobId,
    workspaceDir: bootstrap.workspaceDir,
    zipPath,
    tokenEstimateStart: bootstrap.tokenEstimateStart,
    tokenEstimateEnd,
    shardCount: bootstrap.shardCount,
    commitsProcessed: commitWalk.commitsProcessed,
    commitsSkipped: commitWalk.commitsSkipped,
    meanQaScore: commitWalk.meanQaScore,
    calibrationOverlapMean: commitWalk.calibrationOverlapMean,
  };
}
