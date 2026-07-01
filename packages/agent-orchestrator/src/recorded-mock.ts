import type { AgentRole } from "./types.js";

export type RecordedAgentResponse = {
  role: AgentRole;
  /** Stable key derived from task description (first line or hash prefix). */
  taskKey: string;
  result: string;
  tokensIn: number;
  tokensOut: number;
};

const FIXTURES: RecordedAgentResponse[] = [
  {
    role: "knowledge-architect",
    taskKey: "bootstrap",
    result: "[recorded] Knowledge Architect completed bootstrap",
    tokensIn: 1200,
    tokensOut: 800,
  },
  {
    role: "feature-historian",
    taskKey: "retro-spec",
    result: "[recorded] Feature Historian wrote retro feature_spec.md",
    tokensIn: 900,
    tokensOut: 600,
  },
  {
    role: "commit-calibrator",
    taskKey: "calibration",
    result: "[recorded] Commit Calibrator reviewed overlap",
    tokensIn: 400,
    tokensOut: 200,
  },
  {
    role: "question-prober",
    taskKey: "questions",
    result: "[recorded] Question Prober generated questions",
    tokensIn: 500,
    tokensOut: 300,
  },
  {
    role: "knowledge-curator",
    taskKey: "curation",
    result: "[recorded] Knowledge Curator proposed patches",
    tokensIn: 700,
    tokensOut: 450,
  },
  {
    role: "knowledge-auditor",
    taskKey: "audit",
    result: "[recorded] Knowledge Auditor approved patches",
    tokensIn: 600,
    tokensOut: 350,
  },
];

function taskKeyFromPrompt(taskPrompt: string): string {
  const firstLine = taskPrompt.split("\n")[0]?.toLowerCase() ?? "";
  if (firstLine.includes("bootstrap")) return "bootstrap";
  if (firstLine.includes("retro") || firstLine.includes("feature_spec")) return "retro-spec";
  if (firstLine.includes("calibration")) return "calibration";
  if (firstLine.includes("question")) return "questions";
  if (firstLine.includes("curator") || firstLine.includes("answer")) return "curation";
  if (firstLine.includes("audit")) return "audit";
  return "default";
}

/** Returns a deterministic recorded response for CI — zero Cursor API cost. */
export function lookupRecordedResponse(role: AgentRole, taskPrompt: string): RecordedAgentResponse {
  const key = taskKeyFromPrompt(taskPrompt);
  const match =
    FIXTURES.find((f) => f.role === role && f.taskKey === key) ??
    FIXTURES.find((f) => f.role === role) ?? {
      role,
      taskKey: key,
      result: `[recorded] ${role} completed (${key})`,
      tokensIn: 500,
      tokensOut: 250,
    };
  return match;
}

export function listRecordedFixtures(): RecordedAgentResponse[] {
  return [...FIXTURES];
}
