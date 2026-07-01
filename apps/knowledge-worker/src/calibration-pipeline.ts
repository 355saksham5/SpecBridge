import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { computeOverlap, extractPredictedPaths, type CalibrationReport } from "@specbridge/calibration-metrics";
import { readManifest, applyApprovedPatches, type KnowledgePatch } from "@specbridge/knowledge-store";
import {
  loadAgentPrompt,
  createAgentSession,
  buildCommitCalibratorTaskPrompt,
  buildQuestionProberTaskPrompt,
  buildKnowledgeCuratorTaskPrompt,
  buildKnowledgeAuditorTaskPrompt,
  HandoffValidator,
  type HandoffArtifactType,
} from "@specbridge/agent-orchestrator";
import type { EmitFn } from "./bootstrap-pipeline.js";
import { emit } from "./bootstrap-pipeline.js";

const validator = new HandoffValidator();

export type Question = { id: string; text: string; category: "missed_path" | "hallucinated_path" | "coverage"; relatedPaths: string[] };
export type Answer = { questionId: string; answer: string; citations: string[] };
export type CurationPatch = { targetPath: string; operation: "replace" | "append" | "delete" | "update_weight"; content?: string; tokenDelta?: number };
export type AuditedPatch = { targetPath: string; approved: boolean; reason: string };
export type AuditScores = { coverage: number; precision: number; citation: number; tokenEfficiency: number };

export type CalibrationLoopOptions = {
  jobId: string;
  workspaceDir: string;
  commitSha: string;
  /** Path to the retro feature_spec.md, relative to workspaceDir. */
  retroSpecRelativePath: string;
  actualChangedPaths: string[];
  cursorApiKey?: string;
  mock: boolean;
  recordedAgents?: boolean;
  onEvent?: EmitFn;
  devilsAdvocateQuestionCount?: number;
  minAnswerScore?: number;
  maxRoundsPerCommit?: number;
};

export type CalibrationLoopResult = {
  calibrationReport: CalibrationReport;
  questionCount: number;
  roundsRun: number;
  finalPass: boolean;
  tokenDelta: number;
  qaScore: number;
  patchesApproved: number;
  patchesRejected: number;
};

export async function runCalibrationLoop(options: CalibrationLoopOptions): Promise<CalibrationLoopResult> {
  const questionCount = clamp(options.devilsAdvocateQuestionCount ?? 10, 5, 30);
  const minAnswerScore = clamp(options.minAnswerScore ?? 0.75, 0, 1);
  const maxRounds = clamp(options.maxRoundsPerCommit ?? 1, 1, 3);

  const recordedMock = options.recordedAgents ?? options.mock;

  const manifest = await readManifest(options.workspaceDir).catch(() => null);
  const knownShardPaths = manifest?.shards.map((s) => s.relativePath) ?? [];

  const specText = await readFile(join(options.workspaceDir, options.retroSpecRelativePath), "utf-8").catch(() => "");
  const predictedPaths = extractPredictedPaths(specText, knownShardPaths);
  const metrics = computeOverlap(predictedPaths, options.actualChangedPaths);
  const calibrationReport: CalibrationReport = { commitSha: options.commitSha, ...metrics };

  const reportsBase = `.sdd/reports/calibration/${options.commitSha}`;

  const calibratorPrompt = await loadAgentPrompt("commit-calibrator");
  await using calibratorSession = await createAgentSession({
    apiKey: options.cursorApiKey ?? "mock",
    role: "commit-calibrator",
    cwd: options.workspaceDir,
    systemPrompt: calibratorPrompt,
    mock: options.mock,
    recordedMock,
    onEvent: options.onEvent,
  });
  await calibratorSession.run(
    buildCommitCalibratorTaskPrompt({
      commitSha: options.commitSha,
      retroSpecText: specText,
      predictedPaths: metrics.predictedPaths,
      actualPaths: metrics.actualPaths,
      overlapPercent: metrics.overlapPercent,
      missedPaths: metrics.missedPaths,
      hallucinatedPaths: metrics.hallucinatedPaths,
    }),
  );
  await writeAndHandoff(
    options,
    calibratorSession,
    "calibration-report",
    `${reportsBase}/calibration-report.json`,
    calibrationReport,
  );

  const proberPrompt = await loadAgentPrompt("question-prober");
  await using proberSession = await createAgentSession({
    apiKey: options.cursorApiKey ?? "mock",
    role: "question-prober",
    cwd: options.workspaceDir,
    systemPrompt: proberPrompt,
    mock: options.mock,
    recordedMock,
    onEvent: options.onEvent,
  });
  await proberSession.run(
    buildQuestionProberTaskPrompt({
      commitSha: options.commitSha,
      overlapPercent: metrics.overlapPercent,
      missedPaths: metrics.missedPaths,
      hallucinatedPaths: metrics.hallucinatedPaths,
      questionCount,
    }),
  );
  const questions: Question[] = options.mock ? synthesizeMockQuestions(metrics, questionCount) : [];
  await writeAndHandoff(options, proberSession, "questions", `${reportsBase}/questions.json`, {
    commitSha: options.commitSha,
    questions,
  });

  let round = 0;
  let finalPass = false;
  let finalScores: AuditScores = { coverage: 0, precision: 0, citation: 0, tokenEfficiency: 0 };
  let finalAuditedPatches: AuditedPatch[] = [];
  let priorFeedback: string | undefined;
  let lastCurationPatches: CurationPatch[] = [];

  while (round < maxRounds && !finalPass) {
    round++;

    const curatorPrompt = await loadAgentPrompt("knowledge-curator");
    await using curatorSession = await createAgentSession({
      apiKey: options.cursorApiKey ?? "mock",
      role: "knowledge-curator",
      cwd: options.workspaceDir,
      systemPrompt: curatorPrompt,
      mock: options.mock,
      recordedMock,
      onEvent: options.onEvent,
    });
    await curatorSession.run(
      buildKnowledgeCuratorTaskPrompt({
        commitSha: options.commitSha,
        questions: questions.map((q) => ({ id: q.id, text: q.text })),
        knownShardPaths,
        priorAuditFeedback: priorFeedback,
      }),
    );

    const { answers, patches } = options.mock
      ? synthesizeMockCurationProposal(questions, knownShardPaths)
      : { answers: [] as Answer[], patches: [] as CurationPatch[] };
    lastCurationPatches = patches;

    await writeAndHandoff(
      options,
      curatorSession,
      "curation-proposal",
      `${reportsBase}/curation-proposal-round-${round}.json`,
      { commitSha: options.commitSha, answers, patches },
    );

    const auditorPrompt = await loadAgentPrompt("knowledge-auditor");
    await using auditorSession = await createAgentSession({
      apiKey: options.cursorApiKey ?? "mock",
      role: "knowledge-auditor",
      cwd: options.workspaceDir,
      systemPrompt: auditorPrompt,
      mock: options.mock,
      recordedMock,
      onEvent: options.onEvent,
    });
    await auditorSession.run(
      buildKnowledgeAuditorTaskPrompt({
        commitSha: options.commitSha,
        answerCount: answers.length,
        patchCount: patches.length,
        knownShardPaths,
        minAnswerScore,
      }),
    );

    const verdict = options.mock
      ? synthesizeMockAuditVerdict(answers, patches, knownShardPaths, minAnswerScore)
      : { overallPass: false, scores: finalScores, patches: [] as AuditedPatch[] };

    await writeAndHandoff(options, auditorSession, "audit-verdict", `${reportsBase}/audit-verdict-round-${round}.json`, {
      commitSha: options.commitSha,
      overallPass: verdict.overallPass,
      tokenDelta: approvedTokenDelta(patches, verdict.patches),
      scores: verdict.scores,
      patches: verdict.patches,
    });

    emit(options.onEvent, "audit_verdict", {
      jobId: options.jobId,
      commitSha: options.commitSha,
      round,
      overallPass: verdict.overallPass,
      scores: verdict.scores,
    });

    finalPass = verdict.overallPass;
    finalScores = verdict.scores;
    finalAuditedPatches = verdict.patches;

    if (!finalPass && round < maxRounds) {
      const rejected = verdict.patches.filter((p) => !p.approved);
      priorFeedback = rejected.map((p) => `- ${p.targetPath}: ${p.reason}`).join("\n");
    }
  }

  const approvedTargets = new Set(finalAuditedPatches.filter((p) => p.approved).map((p) => p.targetPath));
  const patchesToApply: KnowledgePatch[] = lastCurationPatches.filter((p) => approvedTargets.has(p.targetPath));

  let patchesApproved = 0;
  let patchesRejected = finalAuditedPatches.filter((p) => !p.approved).length;
  let tokenDelta = 0;

  if (patchesToApply.length > 0) {
    const applyResult = await applyApprovedPatches(options.workspaceDir, patchesToApply);
    patchesApproved = applyResult.appliedCount;
    patchesRejected += applyResult.skipped.length;
    tokenDelta = patchesToApply.reduce((sum, p) => sum + (p.tokenDelta ?? 0), 0);
  }

  return {
    calibrationReport,
    questionCount: questions.length,
    roundsRun: round,
    finalPass,
    tokenDelta,
    qaScore: mean(Object.values(finalScores)),
    patchesApproved,
    patchesRejected,
  };
}

async function writeAndHandoff(
  options: CalibrationLoopOptions,
  session: { writeHandoff: (path: string, content: string, commitSha?: string) => Promise<void> },
  artifactType: HandoffArtifactType,
  relativePath: string,
  data: unknown,
): Promise<void> {
  const result = validator.validate(artifactType, data);
  if (!result.valid) {
    emit(options.onEvent, "handoff_validation_failed", {
      jobId: options.jobId,
      commitSha: options.commitSha,
      artifactType,
      errors: result.errors ?? [],
    });
  }

  const absolutePath = join(options.workspaceDir, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  const content = JSON.stringify(data, null, 2);
  await writeFile(absolutePath, content, "utf-8");
  await session.writeHandoff(relativePath, content, options.commitSha);
}

function approvedTokenDelta(proposed: CurationPatch[], audited: AuditedPatch[]): number {
  const approvedTargets = new Set(audited.filter((p) => p.approved).map((p) => p.targetPath));
  return proposed.filter((p) => approvedTargets.has(p.targetPath)).reduce((sum, p) => sum + (p.tokenDelta ?? 0), 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 1000) / 1000;
}

function synthesizeMockQuestions(
  metrics: Pick<CalibrationReport, "missedPaths" | "hallucinatedPaths">,
  questionCount: number,
): Question[] {
  const questions: Question[] = [];
  let n = 1;

  for (const path of metrics.missedPaths) {
    if (questions.length >= questionCount) break;
    questions.push({
      id: `q${n++}`,
      text: `What does \`${path}\` do, and why didn't the retro spec anticipate touching it?`,
      category: "missed_path",
      relatedPaths: [path],
    });
  }

  for (const path of metrics.hallucinatedPaths) {
    if (questions.length >= questionCount) break;
    questions.push({
      id: `q${n++}`,
      text: `Why was \`${path}\` predicted as changed when the actual diff never touched it?`,
      category: "hallucinated_path",
      relatedPaths: [path],
    });
  }

  const fillers = [
    "What section of the knowledge store would a new contributor read first to understand this area of the codebase?",
    "Which shard, if any, documents error handling for this change's surrounding module?",
    "Is there a truth-doc section describing how this component is tested?",
    "What would break if this commit's change were reverted, based on the current knowledge store alone?",
    "Which shard best explains this component's boundaries and dependencies?",
  ];
  while (questions.length < questionCount) {
    questions.push({
      id: `q${n}`,
      text: fillers[(n - 1) % fillers.length],
      category: "coverage",
      relatedPaths: [],
    });
    n++;
  }

  return questions.slice(0, questionCount);
}

function synthesizeMockCurationProposal(
  questions: Question[],
  knownShardPaths: string[],
): { answers: Answer[]; patches: CurationPatch[] } {
  const citation = knownShardPaths[0];

  const answers: Answer[] = questions.map((q) => ({
    questionId: q.id,
    answer: citation
      ? `Per \`${citation}\`, this is covered by the existing knowledge shard; no additional gap found in mock mode.`
      : "The knowledge store has no shards to cite for this question in mock mode.",
    citations: citation ? [citation] : [],
  }));

  const patches: CurationPatch[] = citation
    ? [
        {
          targetPath: citation,
          operation: "append",
          content: `Mock curator note: reviewed ${questions.length} calibration question(s) for this commit.`,
          tokenDelta: 15,
        },
      ]
    : [];

  return { answers, patches };
}

function synthesizeMockAuditVerdict(
  answers: Answer[],
  patches: CurationPatch[],
  knownShardPaths: string[],
  minAnswerScore: number,
): { overallPass: boolean; scores: AuditScores; patches: AuditedPatch[] } {
  const knownSet = new Set(knownShardPaths);
  const citationsValid = answers.every((a) => a.citations.every((c) => knownSet.has(c)));
  const hasCitations = answers.length > 0 && answers.every((a) => a.citations.length > 0);

  const scores: AuditScores = {
    coverage: answers.length > 0 ? 1 : 0,
    precision: hasCitations ? 0.9 : 0.6,
    citation: citationsValid ? 1 : 0.5,
    tokenEfficiency: patches.every((p) => Math.abs(p.tokenDelta ?? 0) <= 50) ? 1 : 0.5,
  };
  const overallPass = mean(Object.values(scores)) >= minAnswerScore;

  const auditedPatches: AuditedPatch[] = patches.map((p) => {
    const validTarget = knownSet.has(p.targetPath) || p.operation === "replace";
    const approved = overallPass && validTarget;
    return {
      targetPath: p.targetPath,
      approved,
      reason: approved
        ? "Citation valid and within token budget."
        : "Rejected: target shard missing from manifest or overall score below threshold.",
    };
  });

  return { overallPass, scores, patches: auditedPatches };
}
