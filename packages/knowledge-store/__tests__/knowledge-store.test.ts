import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildManifest,
  computeShardId,
  estimateTokens,
  serializeShard,
  parseShardMarkdown,
  sha256,
  writeKnowledgeStore,
  readManifest,
  applyApprovedPatches,
  type KnowledgeShard,
} from "../src/index.js";

describe("knowledge-store", () => {
  it("estimates tokens from text length", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(100))).toBe(25);
  });

  it("round-trips shard markdown", () => {
    const shard = {
      relativePath: "shards/class/Foo.cs#Foo.md",
      frontMatter: {
        id: computeShardId("Foo"),
        granularity: "tokenize_class" as const,
        path: "src/Foo.cs",
        symbol: "Foo",
        commitSha: "abc123",
        tokenEstimate: 42,
        tags: ["domain"],
        language: "csharp",
      },
      content: "Class Foo handles domain logic.",
    };

    const serialized = serializeShard(shard);
    const parsed = parseShardMarkdown(serialized, shard.relativePath);

    expect(parsed.frontMatter.symbol).toBe("Foo");
    expect(parsed.content.trim()).toBe(shard.content);
  });

  it("builds manifest with token totals", () => {
    const shards = [
      {
        relativePath: "shards/file/a.md",
        frontMatter: {
          id: sha256("a"),
          granularity: "tokenize_file" as const,
          path: "a.ts",
          commitSha: "deadbeef",
          tokenEstimate: 100,
          tags: [],
        },
        content: "a",
      },
    ];

    const manifest = buildManifest(shards, {
      headSha: "deadbeef",
      granularity: "tokenize_file",
    });

    expect(manifest.tokenEstimateTotal).toBe(100);
    expect(manifest.shardCount).toBe(1);
  });
});

describe("applyApprovedPatches", () => {
  let baseDir: string;

  beforeAll(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "specbridge-knowledge-store-"));

    const shards: KnowledgeShard[] = [
      {
        relativePath: "shards/class/Foo.cs#Foo.md",
        frontMatter: {
          id: computeShardId("Foo"),
          granularity: "tokenize_class",
          path: "src/Foo.cs",
          symbol: "Foo",
          commitSha: "abc123",
          tokenEstimate: estimateTokens("Class Foo handles domain logic."),
          tags: ["domain"],
        },
        content: "Class Foo handles domain logic.",
      },
    ];

    const manifest = buildManifest(shards, { headSha: "abc123", granularity: "tokenize_class" });
    await writeKnowledgeStore(baseDir, manifest, shards);
  });

  afterAll(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it("appends content to an existing shard and updates its token estimate", async () => {
    const before = await readManifest(baseDir);
    const beforeEntry = before.shards.find((s) => s.relativePath === "shards/class/Foo.cs#Foo.md")!;

    const result = await applyApprovedPatches(baseDir, [
      {
        targetPath: "shards/class/Foo.cs#Foo.md",
        operation: "append",
        content: "Also validates input length per OWASP guidance.",
        tokenDelta: 12,
      },
    ]);

    expect(result.appliedCount).toBe(1);
    expect(result.skipped).toEqual([]);

    const afterEntry = result.manifest.shards.find((s) => s.relativePath === "shards/class/Foo.cs#Foo.md")!;
    expect(afterEntry.tokenEstimate).toBeGreaterThan(beforeEntry.tokenEstimate);
    expect(result.manifest.tokenEstimateTotal).toBe(before.tokenEstimateTotal + 12);
  });

  it("creates a new shard when replace targets an unknown path", async () => {
    const before = await readManifest(baseDir);

    const result = await applyApprovedPatches(baseDir, [
      {
        targetPath: "shards/class/New.cs#New.md",
        operation: "replace",
        content: "Newly curated shard content.",
        tokenDelta: 8,
      },
    ]);

    expect(result.appliedCount).toBe(1);
    expect(result.manifest.shardCount).toBe(before.shardCount + 1);
    expect(result.manifest.shards.some((s) => s.relativePath === "shards/class/New.cs#New.md")).toBe(true);
  });

  it("skips delete for a shard that does not exist", async () => {
    const result = await applyApprovedPatches(baseDir, [
      { targetPath: "shards/class/DoesNotExist.md", operation: "delete" },
    ]);

    expect(result.appliedCount).toBe(0);
    expect(result.skipped).toEqual([{ targetPath: "shards/class/DoesNotExist.md", reason: "shard not found in manifest" }]);
  });
});
