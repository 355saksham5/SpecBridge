import { describe, it, expect } from "vitest";
import { lookupRecordedResponse } from "@specbridge/agent-orchestrator";
import { parseSymbols } from "@specbridge/code-parser";
import { sanitizeForAudit } from "@specbridge/audit-log";
import { enforceShardCap, estimateTokens, type KnowledgeShard } from "@specbridge/knowledge-store";
import { MAX_REPO_FILES, MONOREPO_MODULE_EXCLUDES } from "@specbridge/stack-detect";

describe("Phase 6 hardening utilities", () => {
  it("recorded agent fixtures cover all six roles", () => {
    const roles = [
      "knowledge-architect",
      "feature-historian",
      "commit-calibrator",
      "question-prober",
      "knowledge-curator",
      "knowledge-auditor",
    ] as const;
    for (const role of roles) {
      expect(lookupRecordedResponse(role, `${role} task`).result).toContain("recorded");
    }
  });

  it("code-parser extracts TS symbols for shard hints", () => {
    const result = parseSymbols({
      filePath: "svc.ts",
      content: "export class Svc {}\nexport function go() {}",
    });
    expect(result.symbols.length).toBeGreaterThanOrEqual(2);
  });

  it("audit sanitizer redacts sensitive keys", () => {
    const out = sanitizeForAudit({ jobId: "j1", taskPrompt: "secret" }) as Record<string, unknown>;
    expect(out.taskPrompt).toBe("[redacted]");
    expect(out.jobId).toBe("j1");
  });

  it("enforceShardCap drops excess shards", () => {
    const shards: KnowledgeShard[] = Array.from({ length: 4 }, (_, i) => ({
      relativePath: `${i}.md`,
      frontMatter: {
        id: `${i}`,
        granularity: "tokenize_file",
        path: `${i}.ts`,
        commitSha: "a",
        tokenEstimate: estimateTokens("x"),
        tags: [],
      },
      content: "x",
    }));
    expect(enforceShardCap(shards, { maxShards: 2 }).droppedCount).toBe(2);
  });

  it("exports monorepo scan limits", () => {
    expect(MAX_REPO_FILES).toBe(50_000);
    expect(MONOREPO_MODULE_EXCLUDES.length).toBeGreaterThan(0);
  });
});
