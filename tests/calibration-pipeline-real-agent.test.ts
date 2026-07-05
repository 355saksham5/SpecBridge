import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildManifest,
  computeShardId,
  estimateTokens,
  writeKnowledgeStore,
  readManifest,
  type KnowledgeShard,
} from "@specbridge/knowledge-store";
import type { AgentPromptResult, AgentRole, AgentSessionOptions } from "@specbridge/agent-orchestrator";

const AGENT_RESPONSES: Partial<Record<AgentRole, string>> = {
  "commit-calibrator": "The predicted paths line up with the diff; nothing unusual for this commit.",
  "question-prober": JSON.stringify({
    questions: [
      { id: "q1", text: "Why does the manifest not mention Foo.cs anywhere else?", category: "coverage", relatedPaths: [] },
    ],
  }),
  "knowledge-curator": JSON.stringify({
    answers: [
      { questionId: "q1", answer: "It is covered by the Foo shard.", citations: ["shards/class/Foo.cs#Foo.md"] },
    ],
    patches: [
      {
        targetPath: "shards/class/Foo.cs#Foo.md",
        operation: "append",
        content: "Real-agent curator note.",
        tokenDelta: 20,
      },
    ],
  }),
  "knowledge-auditor": JSON.stringify({
    overallPass: true,
    scores: { coverage: 1, precision: 0.9, citation: 1, tokenEfficiency: 1 },
    patches: [{ targetPath: "shards/class/Foo.cs#Foo.md", approved: true, reason: "Citation valid." }],
  }),
};

vi.mock("@specbridge/agent-orchestrator", async () => {
  const actual = await vi.importActual<typeof import("@specbridge/agent-orchestrator")>("@specbridge/agent-orchestrator");
  return {
    ...actual,
    createAgentSession: vi.fn(async (options: AgentSessionOptions) => {
      const result: AgentPromptResult = {
        status: "finished",
        result: AGENT_RESPONSES[options.role] ?? "",
        runId: `run-${options.role}`,
        cursorAgentId: `fake-${options.role}`,
        tokensIn: 10,
        tokensOut: 10,
        durationMs: 1,
      };
      return {
        agentId: `fake-${options.role}`,
        role: options.role,
        run: vi.fn(async () => result),
        writeHandoff: vi.fn(async () => {}),
        [Symbol.asyncDispose]: vi.fn(async () => {}),
      };
    }),
  };
});

const { runCalibrationLoop } = await import("../apps/knowledge-worker/src/calibration-pipeline.js");

async function seedWorkspace(workspaceDir: string, specText: string): Promise<void> {
  const shards: KnowledgeShard[] = [
    {
      relativePath: "shards/class/Foo.cs#Foo.md",
      frontMatter: {
        id: computeShardId("Foo"),
        granularity: "tokenize_class",
        path: "src/Foo.cs",
        symbol: "Foo",
        commitSha: "deadbeef",
        tokenEstimate: estimateTokens("Foo handles domain logic."),
        tags: ["domain"],
      },
      content: "Foo handles domain logic.",
    },
  ];
  const manifest = buildManifest(shards, { headSha: "deadbeef", granularity: "tokenize_class" });
  await writeKnowledgeStore(workspaceDir, manifest, shards);

  const specPath = join(workspaceDir, ".sdd", "features", "completed", "PROJ-1", "feature_spec.md");
  await mkdir(join(specPath, ".."), { recursive: true });
  await writeFile(specPath, specText, "utf-8");
}

describe("runCalibrationLoop with a real (non-mock) agent", () => {
  let workspaceDir: string;

  beforeEach(async () => {
    workspaceDir = await mkdtemp(join(tmpdir(), "specbridge-calibration-real-"));
  });

  afterEach(async () => {
    await rm(workspaceDir, { recursive: true, force: true });
  });

  it("ingests the agent's JSON responses instead of discarding them", async () => {
    await seedWorkspace(workspaceDir, "This change touches `src/Foo.cs`.");

    const result = await runCalibrationLoop({
      jobId: "job-real-1",
      workspaceDir,
      commitSha: "c0ffee0",
      retroSpecRelativePath: ".sdd/features/completed/PROJ-1/feature_spec.md",
      actualChangedPaths: ["src/Foo.cs"],
      mock: false,
      cursorApiKey: "fake-key",
    });

    expect(result.questionCount).toBe(1);
    expect(result.finalPass).toBe(true);
    expect(result.patchesApproved).toBe(1);
    expect(result.patchesRejected).toBe(0);
    expect(result.tokenDelta).toBe(20);

    const questionsOnDisk = JSON.parse(
      await readFile(join(workspaceDir, ".sdd/reports/calibration/c0ffee0/questions.json"), "utf-8"),
    );
    expect(questionsOnDisk.questions).toHaveLength(1);
    expect(questionsOnDisk.questions[0].id).toBe("q1");

    const calibrationReportOnDisk = JSON.parse(
      await readFile(join(workspaceDir, ".sdd/reports/calibration/c0ffee0/calibration-report.json"), "utf-8"),
    );
    expect(calibrationReportOnDisk.agentCommentary).toContain("line up with the diff");

    const manifestAfter = await readManifest(workspaceDir);
    const fooEntry = manifestAfter.shards.find((s) => s.relativePath === "shards/class/Foo.cs#Foo.md");
    expect(fooEntry?.tokenEstimate).toBeGreaterThan(estimateTokens("Foo handles domain logic."));
  });

  it("falls back to an empty (safe) result when every agent's response is unparseable prose", async () => {
    await seedWorkspace(workspaceDir, "This change touches `src/Foo.cs`.");

    const original = { ...AGENT_RESPONSES };
    for (const role of Object.keys(AGENT_RESPONSES) as AgentRole[]) {
      AGENT_RESPONSES[role] = "Sure! I've thought about this but have nothing structured to share back.";
    }

    try {
      const result = await runCalibrationLoop({
        jobId: "job-real-2",
        workspaceDir,
        commitSha: "abc0000",
        retroSpecRelativePath: ".sdd/features/completed/PROJ-1/feature_spec.md",
        actualChangedPaths: ["src/Foo.cs"],
        mock: false,
        cursorApiKey: "fake-key",
      });

      expect(result.questionCount).toBe(0);
      expect(result.finalPass).toBe(false);
      expect(result.patchesApproved).toBe(0);
    } finally {
      Object.assign(AGENT_RESPONSES, original);
    }
  });
});
