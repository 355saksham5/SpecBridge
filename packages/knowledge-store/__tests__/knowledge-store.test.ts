import { describe, it, expect } from "vitest";
import {
  buildManifest,
  computeShardId,
  estimateTokens,
  serializeShard,
  parseShardMarkdown,
  sha256,
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
