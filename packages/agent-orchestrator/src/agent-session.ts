import { createHash } from "node:crypto";
import type { AgentPromptResult, AgentSessionOptions, OrchestratorEvent } from "./types.js";
import type { Run, SDKAgent } from "@cursor/sdk";
import { lookupRecordedResponse } from "./recorded-mock.js";

export class AgentSession implements AsyncDisposable {
  private disposed = false;
  private cursorAgentId: string;
  private agent: SDKAgent | null = null;
  private systemPrompt: string;

  constructor(
    private options: AgentSessionOptions,
    cursorAgentId: string,
    agent: SDKAgent | null,
    systemPrompt: string,
  ) {
    this.cursorAgentId = cursorAgentId;
    this.agent = agent;
    this.systemPrompt = systemPrompt;
  }

  get agentId(): string {
    return this.cursorAgentId;
  }

  get role() {
    return this.options.role;
  }

  private emit(event: OrchestratorEvent): void {
    this.options.onEvent?.(event);
  }

  async run(taskPrompt: string): Promise<AgentPromptResult> {
    if (this.disposed) throw new Error("AgentSession already disposed");
    const startedAt = Date.now();
    const runId = `run-${this.options.role}-${startedAt}`;

    this.emit({
      type: "agent_started",
      payload: {
        agentRole: this.options.role,
        cursorAgentId: this.cursorAgentId,
        runId,
      },
    });

    if (this.options.mock || !this.agent) {
      await sleep(this.options.recordedMock ? 10 : 100);
      const recorded = this.options.recordedMock ? lookupRecordedResponse(this.options.role, taskPrompt) : null;
      const result = recorded?.result ?? `[mock] ${this.options.role} completed task`;
      const metrics: AgentPromptResult = {
        status: "finished",
        result,
        runId,
        cursorAgentId: this.cursorAgentId,
        tokensIn: recorded?.tokensIn ?? 1000,
        tokensOut: recorded?.tokensOut ?? 500,
        durationMs: Date.now() - startedAt,
      };

      this.emit({
        type: "agent_completed",
        payload: { ...metrics, agentRole: this.options.role },
      });

      return metrics;
    }

    const fullPrompt = `${this.systemPrompt}\n\n---\n\n${taskPrompt}`;
    const run: Run = await this.agent.send(fullPrompt);
    for await (const _event of run.stream()) {
      // Stream consumed for observability
    }
    const outcome = await run.wait();
    const durationMs = Date.now() - startedAt;

    const metrics: AgentPromptResult = {
      status: outcome.status === "finished" ? "finished" : "error",
      result: outcome.result,
      runId: run.id,
      cursorAgentId: this.cursorAgentId,
      tokensIn: 0,
      tokensOut: estimateFromResult(outcome.result),
      durationMs,
    };

    this.emit({
      type: "agent_completed",
      payload: { ...metrics, agentRole: this.options.role },
    });

    return metrics;
  }

  async writeHandoff(artifactPath: string, content: string | Buffer, commitSha?: string): Promise<void> {
    const sha256 = createHash("sha256").update(content).digest("hex");
    this.emit({
      type: "agent_handoff_written",
      payload: {
        artifactPath,
        agentRole: this.options.role,
        sha256,
        commitSha,
      },
    });
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.agent?.close();
    this.agent = null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function estimateFromResult(result?: string): number {
  if (!result) return 0;
  return Math.ceil(result.length / 4);
}

export async function createAgentSession(options: AgentSessionOptions): Promise<AgentSession> {
  const cursorAgentId = options.mock
    ? `mock-${options.role}-${Date.now()}`
    : `pending-${options.role}`;

  if (options.mock) {
    return new AgentSession(options, cursorAgentId, null, options.systemPrompt);
  }

  const { Agent } = await import("@cursor/sdk");

  const agentOptions: import("@cursor/sdk").AgentOptions = {
    apiKey: options.apiKey,
    model: { id: options.model ?? "composer-2.5" },
    name: `specbridge-${options.role}`,
  };

  if (options.repoUrl) {
    agentOptions.cloud = {
      repos: [{ url: options.repoUrl, startingRef: options.ref ?? "HEAD" }],
    };
  } else {
    agentOptions.local = { cwd: options.cwd ?? process.cwd(), settingSources: [] };
  }

  const agent = await Agent.create(agentOptions);

  return new AgentSession(options, agent.agentId, agent, options.systemPrompt);
}

/** Generic single-shot runner: create session, run one task, dispose. */
export async function runAgentTask(
  options: AgentSessionOptions & { taskDescription: string },
): Promise<AgentPromptResult> {
  await using session = await createAgentSession(options);
  return session.run(options.taskDescription);
}

export async function runKnowledgeArchitect(
  options: AgentSessionOptions & {
    granularityPrompt: string;
    taskDescription: string;
  },
): Promise<AgentPromptResult> {
  return runAgentTask(options);
}
