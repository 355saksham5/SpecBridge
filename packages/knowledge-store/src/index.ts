import { createHash } from "node:crypto";

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

export type KnowledgeManifest = {
  version: "1.0";
  generatedAt: string;
  headSha: string;
  granularity: GranularityPrompt;
  tokenEstimateTotal: number;
  shardCount: number;
  shards: Array<{
    id: string;
    path: string;
    relativePath: string;
    tokenEstimate: number;
    granularity: GranularityPrompt;
    symbol?: string;
    language?: string;
    tags: string[];
  }>;
  retrievalHints: {
    defaultGranularity: GranularityPrompt;
    maxShardTokens: number;
    advisorPrompt?: string;
  };
};

export function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
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

export async function writeKnowledgeStore(
  baseDir: string,
  manifest: KnowledgeManifest,
  shards: KnowledgeShard[],
): Promise<void> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");

  const knowledgeDir = join(baseDir, ".sdd", "knowledge");
  await mkdir(knowledgeDir, { recursive: true });

  await writeFile(join(knowledgeDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");

  for (const shard of shards) {
    const shardPath = join(knowledgeDir, shard.relativePath.replace(/^\.sdd\/knowledge\//, ""));
    await mkdir(join(shardPath, ".."), { recursive: true });
    await writeFile(shardPath, serializeShard(shard), "utf-8");
  }
}

export async function readManifest(baseDir: string): Promise<KnowledgeManifest> {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const raw = await readFile(join(baseDir, ".sdd", "knowledge", "manifest.json"), "utf-8");
  return JSON.parse(raw) as KnowledgeManifest;
}
