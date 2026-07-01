export const AGENT_ROLES = [
  "knowledge-architect",
  "feature-historian",
  "commit-calibrator",
  "question-prober",
  "knowledge-curator",
  "knowledge-auditor",
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

export type AgentRunMetrics = {
  agentRole: AgentRole;
  cursorAgentId: string;
  runId: string;
  commitSha?: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
};

export type AgentHandoffEvent = {
  artifactPath: string;
  agentRole: AgentRole;
  sha256: string;
  commitSha?: string;
};

export type OrchestratorEvent =
  | { type: "agent_started"; payload: Pick<AgentRunMetrics, "agentRole" | "cursorAgentId" | "runId" | "commitSha"> }
  | { type: "agent_completed"; payload: AgentRunMetrics }
  | { type: "agent_handoff_written"; payload: AgentHandoffEvent }
  | { type: "phase_started"; payload: { phase: string } }
  | { type: "shard_written"; payload: { shardId: string; granularity: string; tokenEstimate: number } };

export type AgentSessionOptions = {
  apiKey: string;
  role: AgentRole;
  model?: string;
  repoUrl?: string;
  ref?: string;
  cwd?: string;
  systemPrompt: string;
  stackProfileJson?: string;
  advisorPrompt?: string;
  onEvent?: (event: OrchestratorEvent) => void;
  /** When true, skip real Cursor SDK calls (for CI/local without API key). */
  mock?: boolean;
};

export type AgentPromptResult = {
  status: "finished" | "error";
  result?: string;
  runId: string;
  cursorAgentId: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
};

export type HandoffArtifactType =
  | "stack-profile"
  | "calibration-report"
  | "questions"
  | "curation-proposal"
  | "audit-verdict";
