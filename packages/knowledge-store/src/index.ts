import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type GranularityPrompt =
  | "tokenize_function"
  | "tokenize_class"
  | "tokenize_namespace"
  | "tokenize_features"
  | "tokenize_top_level_rules"
  | "tokenize_file";

export type ShardFrontMatter = {
  id: string;
  granularity: GranularityPrompt;
  path: string;
  symbol?: string;
  commitSha: string;
  tokenEstimate: number;
  tags: string[];
  language?: string;
  advisorRelevance?: number;
};

export type KnowledgeShard = {
  frontMatter: ShardFrontMatter;
  content: string;
  relativePath: string;
};

export type KnowledgeManifestShardEntry = {
  id: string;
  path: string;
  relativePath: string;
  tokenEstimate: number;
  granularity: GranularityPrompt;
  symbol?: string;
  language?: string;
  tags: string[];
};

export type KnowledgeManifest = {
  version: "1.0";
  generatedAt: string;
  headSha: string;
  granularity: GranularityPrompt;
  tokenEstimateTotal: number;
  shardCount: number;
  shards: KnowledgeManifestShardEntry[];
  retrievalHints: {
    defaultGranularity: GranularityPrompt;
    maxShardTokens: number;
    advisorPrompt?: string;
  };
};

export function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Default per-shard token cap (matches OpenAPI default). */
export const DEFAULT_MAX_SHARD_TOKENS = 800;

/** Hard cap on shard count for monorepos — excess shards are dropped oldest-first. */
export const DEFAULT_MAX_SHARD_COUNT = 10_000;

export type EnforceShardCapResult = {
  shards: KnowledgeShard[];
  droppedCount: number;
  truncatedTokenDelta: number;
};

/**
 * Applies monorepo shard caps: limits shard count and truncates individual
 * shards that exceed maxShardTokens.
 */
export function enforceShardCap(
  shards: KnowledgeShard[],
  options: { maxShards?: number; maxShardTokens?: number } = {},
): EnforceShardCapResult {
  const maxShards = options.maxShards ?? DEFAULT_MAX_SHARD_COUNT;
  const maxShardTokens = options.maxShardTokens ?? DEFAULT_MAX_SHARD_TOKENS;

  const kept = shards.slice(0, maxShards);
  const droppedCount = Math.max(0, shards.length - kept.length);
  let truncatedTokenDelta = 0;

  const capped = kept.map((shard) => {
    if (shard.frontMatter.tokenEstimate <= maxShardTokens) return shard;
    const maxChars = maxShardTokens * 4;
    const trimmed = shard.content.slice(0, maxChars);
    const newEstimate = estimateTokens(trimmed);
    truncatedTokenDelta += shard.frontMatter.tokenEstimate - newEstimate;
    return {
      ...shard,
      content: `${trimmed}\n\n_[truncated at ${maxShardTokens} token cap]_`,
      frontMatter: { ...shard.frontMatter, tokenEstimate: newEstimate },
    };
  });

  return { shards: capped, droppedCount, truncatedTokenDelta };
}

/** Rough token estimate: ~4 chars per token (OpenAI-style heuristic). */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function computeShardId(content: string): string {
  return sha256(content).slice(0, 16);
}

export function parseShardMarkdown(raw: string, relativePath: string): KnowledgeShard {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error(`Shard missing YAML front-matter: ${relativePath}`);
  }

  const yamlBlock = match[1];
  const content = match[2];
  const frontMatter = parseSimpleYaml(yamlBlock) as unknown as ShardFrontMatter;

  return { frontMatter, content, relativePath };
}

export function serializeShard(shard: KnowledgeShard): string {
  const fm = shard.frontMatter;
  const lines = [
    "---",
    `id: ${fm.id}`,
    `granularity: ${fm.granularity}`,
    `path: ${fm.path}`,
    fm.symbol ? `symbol: ${fm.symbol}` : null,
    `commitSha: ${fm.commitSha}`,
    `tokenEstimate: ${fm.tokenEstimate}`,
    `tags: [${fm.tags.map((t) => `"${t}"`).join(", ")}]`,
    fm.language ? `language: ${fm.language}` : null,
    fm.advisorRelevance !== undefined ? `advisorRelevance: ${fm.advisorRelevance}` : null,
    "---",
    shard.content.trim(),
    "",
  ].filter(Boolean);

  return lines.join("\n");
}

function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const line of yaml.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    let value: unknown = trimmed.slice(colonIdx + 1).trim();

    if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
      value = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^"|"$/g, ""))
        .filter(Boolean);
    } else if (typeof value === "string" && /^\d+$/.test(value)) {
      value = parseInt(value, 10);
    } else if (typeof value === "string" && /^\d+\.\d+$/.test(value)) {
      value = parseFloat(value);
    }

    result[key] = value;
  }
  return result;
}

export function buildManifest(
  shards: KnowledgeShard[],
  options: {
    headSha: string;
    granularity: GranularityPrompt;
    maxShardTokens?: number;
    advisorPrompt?: string;
  },
): KnowledgeManifest {
  const tokenEstimateTotal = shards.reduce((sum, s) => sum + s.frontMatter.tokenEstimate, 0);

  return {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    headSha: options.headSha,
    granularity: options.granularity,
    tokenEstimateTotal,
    shardCount: shards.length,
    shards: shards.map((s) => ({
      id: s.frontMatter.id,
      path: s.frontMatter.path,
      relativePath: s.relativePath,
      tokenEstimate: s.frontMatter.tokenEstimate,
      granularity: s.frontMatter.granularity,
      symbol: s.frontMatter.symbol,
      language: s.frontMatter.language,
      tags: s.frontMatter.tags,
    })),
    retrievalHints: {
      defaultGranularity: options.granularity,
      maxShardTokens: options.maxShardTokens ?? 800,
      advisorPrompt: options.advisorPrompt,
    },
  };
}

function knowledgeDirOf(baseDir: string): string {
  return join(baseDir, ".sdd", "knowledge");
}

function shardFilePath(baseDir: string, relativePath: string): string {
  return join(knowledgeDirOf(baseDir), relativePath.replace(/^\.sdd\/knowledge\//, ""));
}

export async function writeKnowledgeStore(
  baseDir: string,
  manifest: KnowledgeManifest,
  shards: KnowledgeShard[],
): Promise<void> {
  const knowledgeDir = knowledgeDirOf(baseDir);
  await mkdir(knowledgeDir, { recursive: true });

  await writeFile(join(knowledgeDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");

  for (const shard of shards) {
    const filePath = shardFilePath(baseDir, shard.relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, serializeShard(shard), "utf-8");
  }
}

export async function readManifest(baseDir: string): Promise<KnowledgeManifest> {
  const raw = await readFile(join(knowledgeDirOf(baseDir), "manifest.json"), "utf-8");
  return JSON.parse(raw) as KnowledgeManifest;
}

export type KnowledgePatchOperation = "replace" | "append" | "delete" | "update_weight";

export type KnowledgePatch = {
  /** Manifest shard `relativePath` (or `path`) this patch targets. */
  targetPath: string;
  operation: KnowledgePatchOperation;
  content?: string;
  /** Signed token count change this patch is expected to cause. Negative = reduction. */
  tokenDelta?: number;
};

export type ApplyPatchesResult = {
  manifest: KnowledgeManifest;
  appliedCount: number;
  skipped: Array<{ targetPath: string; reason: string }>;
};

/**
 * Applies Knowledge Auditor-approved patches to the on-disk knowledge store
 * and rewrites `manifest.json`. Only call with patches that have already
 * passed audit — this function does not itself validate citations or scores.
 */
export async function applyApprovedPatches(baseDir: string, patches: KnowledgePatch[]): Promise<ApplyPatchesResult> {
  const knowledgeDir = knowledgeDirOf(baseDir);
  const manifest = await readManifest(baseDir);
  const skipped: ApplyPatchesResult["skipped"] = [];
  let appliedCount = 0;

  for (const patch of patches) {
    const filePath = shardFilePath(baseDir, patch.targetPath);
    const entryIndex = manifest.shards.findIndex(
      (s) => s.relativePath === patch.targetPath || s.path === patch.targetPath,
    );

    try {
      const applied = await applyOnePatch(manifest, patch, filePath, entryIndex);
      if (!applied.ok) {
        skipped.push({ targetPath: patch.targetPath, reason: applied.reason });
        continue;
      }
      manifest.tokenEstimateTotal = Math.max(0, manifest.tokenEstimateTotal + (patch.tokenDelta ?? 0));
      appliedCount++;
    } catch (err) {
      skipped.push({ targetPath: patch.targetPath, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  manifest.generatedAt = new Date().toISOString();
  await mkdir(knowledgeDir, { recursive: true });
  await writeFile(join(knowledgeDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");

  return { manifest, appliedCount, skipped };
}

async function applyOnePatch(
  manifest: KnowledgeManifest,
  patch: KnowledgePatch,
  filePath: string,
  entryIndex: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  switch (patch.operation) {
    case "delete": {
      if (entryIndex === -1) return { ok: false, reason: "shard not found in manifest" };
      await unlink(filePath).catch(() => undefined);
      manifest.shards.splice(entryIndex, 1);
      manifest.shardCount = manifest.shards.length;
      return { ok: true };
    }

    case "append":
    case "replace": {
      const shard = await loadOrCreateShard(manifest, patch, filePath, entryIndex);
      shard.content =
        patch.operation === "append"
          ? `${shard.content.trim()}\n\n${patch.content ?? ""}`.trim()
          : patch.content ?? "";
      shard.frontMatter.tokenEstimate = estimateTokens(shard.content);

      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, serializeShard(shard), "utf-8");

      upsertManifestEntry(manifest, shard, entryIndex);
      return { ok: true };
    }

    case "update_weight": {
      if (entryIndex === -1) return { ok: false, reason: "shard not found in manifest" };
      const weight = patch.content !== undefined ? Number(patch.content) : NaN;
      if (Number.isNaN(weight)) return { ok: false, reason: "invalid weight value" };

      const raw = await readFile(filePath, "utf-8").catch(() => null);
      if (raw) {
        const shard = parseShardMarkdown(raw, patch.targetPath);
        shard.frontMatter.advisorRelevance = weight;
        await writeFile(filePath, serializeShard(shard), "utf-8");
      }
      return { ok: true };
    }

    default:
      return { ok: false, reason: `unknown operation: ${patch.operation}` };
  }
}

async function loadOrCreateShard(
  manifest: KnowledgeManifest,
  patch: KnowledgePatch,
  filePath: string,
  entryIndex: number,
): Promise<KnowledgeShard> {
  if (entryIndex >= 0) {
    const raw = await readFile(filePath, "utf-8").catch(() => null);
    if (raw) return parseShardMarkdown(raw, patch.targetPath);
  }

  return {
    relativePath: patch.targetPath,
    frontMatter: {
      id: computeShardId(patch.targetPath),
      granularity: manifest.granularity,
      path: patch.targetPath,
      commitSha: manifest.headSha,
      tokenEstimate: 0,
      tags: ["curator-patch"],
    },
    content: "",
  };
}

function upsertManifestEntry(manifest: KnowledgeManifest, shard: KnowledgeShard, entryIndex: number): void {
  const entry: KnowledgeManifestShardEntry = {
    id: shard.frontMatter.id,
    path: shard.frontMatter.path,
    relativePath: shard.relativePath,
    tokenEstimate: shard.frontMatter.tokenEstimate,
    granularity: shard.frontMatter.granularity,
    symbol: shard.frontMatter.symbol,
    language: shard.frontMatter.language,
    tags: shard.frontMatter.tags,
  };

  if (entryIndex >= 0) {
    manifest.shards[entryIndex] = entry;
  } else {
    manifest.shards.push(entry);
    manifest.shardCount = manifest.shards.length;
  }
}
