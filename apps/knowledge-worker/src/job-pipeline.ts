import { join } from "node:path";
import { packBundle, computeTokenReduction } from "@specbridge/bundle-packer";
import { getHeadSha, type WalkOrder, type JiraExtractSource } from "@specbridge/commit-walker";
import { bootstrapKnowledgeAtHead, emit, type BootstrapJobOptions } from "./bootstrap-pipeline.js";
import { runCommitWalkPhase, type JiraEnrichmentOptions, type ValidationOptions } from "./commit-walk-pipeline.js";
import { openOnboardingPullRequest, type GitHubDeliveryOptions } from "./pr-delivery.js";

const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/;

export type DeliveryOptions = {
  openPr?: boolean;
  prTitle?: string;
  prBranch?: string;
  prBody?: string;
  github?: GitHubDeliveryOptions;
};

export type BrownfieldJobOptions = BootstrapJobOptions & {
  walkOrder?: WalkOrder;
  issueKeyPattern?: string;
  extractFrom?: JiraExtractSource[];
  jira?: JiraEnrichmentOptions;
  validation?: ValidationOptions;
  delivery?: DeliveryOptions;
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
  prUrl: string | null;
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

  let prUrl: string | null = null;
  if (options.delivery?.openPr && options.delivery.github) {
    emit(options.onEvent, "phase_started", { phase: "pr_delivery", jobId: options.jobId });
    const pr = await openOnboardingPullRequest({
      repoUrl: options.repoUrl,
      baseBranch: options.branch,
      jobId: options.jobId,
      workspaceDir: bootstrap.workspaceDir,
      prTitle: options.delivery.prTitle,
      prBranch: options.delivery.prBranch,
      prBody: options.delivery.prBody,
      github: options.delivery.github,
    });
    prUrl = pr.url;
    emit(options.onEvent, "pr_opened", { jobId: options.jobId, prUrl, prNumber: pr.number, branch: pr.branch });
  }

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
    prUrl,
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
    prUrl,
  };
}
