import { describe, it, expect } from "vitest";
import { enforceShardCap, estimateTokens, type KnowledgeShard } from "../src/index.js";

describe("enforceShardCap", () => {
  it("drops shards beyond maxShards", () => {
    const shards: KnowledgeShard[] = Array.from({ length: 5 }, (_, i) => ({
      relativePath: `s${i}.md`,
      frontMatter: {
        id: `id-${i}`,
        granularity: "tokenize_file",
        path: `f${i}.ts`,
        commitSha: "abc",
        tokenEstimate: 10,
        tags: [],
      },
      content: "x".repeat(40),
    }));

    const result = enforceShardCap(shards, { maxShards: 3, maxShardTokens: 800 });
    expect(result.shards).toHaveLength(3);
    expect(result.droppedCount).toBe(2);
  });

  it("truncates oversized shard content", () => {
    const big = "word ".repeat(500);
    const shards: KnowledgeShard[] = [
      {
        relativePath: "big.md",
        frontMatter: {
          id: "big",
          granularity: "tokenize_file",
          path: "big.ts",
          commitSha: "abc",
          tokenEstimate: estimateTokens(big),
          tags: [],
        },
        content: big,
      },
    ];

    const result = enforceShardCap(shards, { maxShardTokens: 50 });
    expect(result.truncatedTokenDelta).toBeGreaterThan(0);
    expect(result.shards[0].frontMatter.tokenEstimate).toBeLessThanOrEqual(50);
  });
});
