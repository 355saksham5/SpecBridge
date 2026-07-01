import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { detectStack, writeStackProfile } from "@specbridge/stack-detect";
import {
  buildManifest,
  computeShardId,
  estimateTokens,
  readManifest,
  writeKnowledgeStore,
  enforceShardCap,
  type GranularityPrompt,
  type KnowledgeShard,
} from "@specbridge/knowledge-store";
import {
  loadAgentPrompt,
  loadCouncilPrompts,
  buildKnowledgeArchitectSystemPrompt,
  runKnowledgeArchitect,
  type OrchestratorEvent,
} from "@specbridge/agent-orchestrator";
import { packBundle, vendorSddKit, computeTokenReduction } from "@specbridge/bundle-packer";
import { ConfluenceClient, buildConfluenceContext } from "@specbridge/confluence-client";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export type SseLikeEvent = {
  type: string;
  payload: Record<string, unknown>;
};

export type EmitFn = (event: OrchestratorEvent | SseLikeEvent) => void;

export function emit(onEvent: EmitFn | undefined, type: string, payload: Record<string, unknown>): void {
  onEvent?.({ type, payload });
}

export type SddKitRef = { id: string; version: string; sourceDir: string };

export function defaultSddKit(): SddKitRef {
  return { id: "csharp-sdd-starter-kit", version: "1.0.0", sourceDir: REPO_ROOT };
}

export type ConfluenceEnrichmentOptions = {
  /** Confluence Cloud base URL (e.g. `https://acme.atlassian.net/wiki`). */
  baseUrl: string;
  /** Pre-resolved Authorization header — never a raw secret name. */
  authHeader: string;
  /** Numeric Confluence page ids to fetch as Knowledge Architect advisor context. Max 25. */
  pageIds: string[];
};

export type BootstrapJobOptions = {
  jobId: string;
  repoPath: string;
  repoUrl: string;
  branch: string;
  headSha: string;
  outputDir: string;
  granularityPrompt: GranularityPrompt;
  advisorPrompt?: string;
  maxShardTokens?: number;
  commitDepth?: number;
  cursorApiKey?: string;
  mockAgents?: boolean;
  /** When mockAgents is true, use deterministic recorded fixtures (CI zero-cost). Default true. */
  recordedAgents?: boolean;
  sddKit?: SddKitRef;
  confluence?: ConfluenceEnrichmentOptions;
  onEvent?: EmitFn;
};

export type BootstrapResult = {
  jobId: string;
  stackProfilePath: string;
  workspaceDir: string;
  zipPath: string;
  tokenEstimateStart: number;
  shardCount: number;
};

export type BootstrapKnowledgeResult = {
  workspaceDir: string;
  stackProfilePath: string;
  tokenEstimateStart: number;
  shardCount: number;
  mock: boolean;
  sddKit: SddKitRef;
};

/**
 * Phase 2 core: stack_detect → knowledge_bootstrap. Writes truth docs and
 * knowledge shards into `{outputDir}/workspace/.sdd/`. Does NOT pack a
 * bundle — callers compose this with the commit walk (Phase 3) before
 * packaging so the final bundle reflects post-walk metrics.
 */
export async function bootstrapKnowledgeAtHead(options: BootstrapJobOptions): Promise<BootstrapKnowledgeResult> {
  const workspaceDir = join(options.outputDir, "workspace");
  const artifactsDir = join(options.outputDir, "artifacts");
  await mkdir(workspaceDir, { recursive: true });
  await mkdir(artifactsDir, { recursive: true });

  const mock = options.mockAgents ?? !options.cursorApiKey;
  const sddKit = options.sddKit ?? defaultSddKit();

  // --- stack_detect ---
  emit(options.onEvent, "phase_started", { phase: "stack_detect", jobId: options.jobId });

  const stackProfile = await detectStack(options.repoPath, {
    headSha: options.headSha,
    excludePathPatterns: ["**/.sdd/**"],
  });
  const stackProfilePath = await writeStackProfile(options.repoPath, stackProfile, options.outputDir);

  // --- knowledge_bootstrap ---
  emit(options.onEvent, "phase_started", { phase: "knowledge_bootstrap", jobId: options.jobId });

  const [basePrompt, council] = await Promise.all([
    loadAgentPrompt("knowledge-architect"),
    loadCouncilPrompts(),
  ]);

  let confluenceContext: string | undefined;
  if (options.confluence && options.confluence.pageIds.length > 0) {
    const client = new ConfluenceClient({
      baseUrl: options.confluence.baseUrl,
      authHeader: options.confluence.authHeader,
    });
    const ctx = await buildConfluenceContext(client, options.confluence.pageIds);
    if (ctx.markdown) {
      confluenceContext = ctx.markdown;
      await writeFile(join(artifactsDir, "confluence-context.md"), ctx.markdown, "utf-8");
      emit(options.onEvent, "confluence_context_fetched", {
        jobId: options.jobId,
        pageCount: ctx.pages.length,
        missingPageIds: ctx.missingPageIds,
      });
    }
  }

  const systemPrompt = buildKnowledgeArchitectSystemPrompt(basePrompt, council.code, council.deploy, {
    stackProfileJson: JSON.stringify(stackProfile, null, 2),
    granularityPrompt: options.granularityPrompt,
    advisorPrompt: options.advisorPrompt,
    confluenceContext,
  });

  const taskDescription = [
    "Bootstrap SpecBridge knowledge at HEAD.",
    `Repo path: ${options.repoPath}`,
    `HEAD SHA: ${options.headSha}`,
    `Granularity: ${options.granularityPrompt}`,
    "",
    "Write truth docs to .sdd/docs/ and tokenized shards to .sdd/knowledge/.",
    mock ? "(Mock mode — worker will synthesize placeholder artifacts.)" : "",
  ].join("\n");

  await runKnowledgeArchitect({
    apiKey: options.cursorApiKey ?? "mock",
    role: "knowledge-architect",
    cwd: options.repoPath,
    systemPrompt,
    mock,
    recordedMock: options.recordedAgents ?? mock,
    onEvent: options.onEvent,
    granularityPrompt: options.granularityPrompt,
    taskDescription,
  });

  if (mock) {
    await synthesizeBootstrapArtifacts(workspaceDir, options);
  }

  await vendorSddKit(sddKit.sourceDir, workspaceDir);

  const manifest = await readManifest(workspaceDir).catch(() => null);
  const tokenEstimateStart = manifest?.tokenEstimateTotal ?? 0;
  const shardCount = manifest?.shardCount ?? 0;

  return { workspaceDir, stackProfilePath, tokenEstimateStart, shardCount, mock, sddKit };
}

/**
 * Standalone Phase 2 CLI/test entry: bootstrap + immediate bundle pack with
 * zeroed commit-walk metrics. Prefer `runBrownfieldJob` for the full
 * bootstrap → commit-walk → bundle sequence.
 */
export async function runKnowledgeBootstrap(options: BootstrapJobOptions): Promise<BootstrapResult> {
  const bootstrap = await bootstrapKnowledgeAtHead(options);

  emit(options.onEvent, "phase_started", { phase: "bundle_packaging", jobId: options.jobId });

  const zipPath = join(options.outputDir, `specbridge-bundle-${options.jobId}.zip`);
  const { sizeBytes } = await packBundle({
    jobId: options.jobId,
    workspaceDir: bootstrap.workspaceDir,
    outputZipPath: zipPath,
    repoUrl: options.repoUrl,
    headSha: options.headSha,
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
      commitsProcessed: 0,
      commitsSkipped: 0,
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
      commitsProcessed: 0,
      commitsSkipped: 0,
    },
  });

  return {
    jobId: options.jobId,
    stackProfilePath: bootstrap.stackProfilePath,
    workspaceDir: bootstrap.workspaceDir,
    zipPath,
    tokenEstimateStart: bootstrap.tokenEstimateStart,
    shardCount: bootstrap.shardCount,
  };
}

async function synthesizeBootstrapArtifacts(workspaceDir: string, options: BootstrapJobOptions): Promise<void> {
  const docsDir = join(workspaceDir, ".sdd", "docs");
  await mkdir(docsDir, { recursive: true });

  const truthDocStub = (title: string) =>
    `# ${title}\n> Refreshed: ${new Date().toISOString()} at SHA ${options.headSha}\n\n## TBD\n\nGenerated by SpecBridge Phase 2 mock bootstrap.\n`;

  await writeFile(join(docsDir, "project_knowledge.md"), truthDocStub("Project Knowledge"), "utf-8");
  await writeFile(join(docsDir, "project_deployment_knowledge.md"), truthDocStub("Deployment Knowledge"), "utf-8");

  const sampleShards: KnowledgeShard[] = [
    {
      relativePath: "shards/class/Program.cs#Program.md",
      frontMatter: {
        id: computeShardId("Program"),
        granularity: options.granularityPrompt,
        path: "apps/api/Program.cs",
        symbol: "Program",
        commitSha: options.headSha,
        tokenEstimate: 0,
        tags: ["entrypoint", "api"],
        language: "csharp",
      },
      content: "Minimal API entry point for SpecBridge.",
    },
  ];

  for (const shard of sampleShards) {
    shard.frontMatter.tokenEstimate = estimateTokens(shard.content);
  }

  const { shards: cappedShards } = enforceShardCap(sampleShards, {
    maxShardTokens: options.maxShardTokens,
  });

  const knowledgeManifest = buildManifest(cappedShards, {
    headSha: options.headSha,
    granularity: options.granularityPrompt,
    maxShardTokens: options.maxShardTokens,
    advisorPrompt: options.advisorPrompt,
  });

  await writeKnowledgeStore(workspaceDir, knowledgeManifest, cappedShards);
}
