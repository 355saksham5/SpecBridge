import { ServiceBusClient, type ServiceBusReceivedMessage } from "@azure/service-bus";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { runBrownfieldJob, type BrownfieldJobOptions } from "./job-pipeline.js";
import { createTracingEmit } from "./telemetry.js";
import { createApiEventRelay, resolveEventRelayOptions } from "./event-relay.js";
import {
  applyResolvedCredentials,
  resolveCredentialResolverOptions,
  resolveWorkerCredentials,
  type WorkerJobCredentials,
} from "./credential-resolver.js";
import { cloneRepoShallow, shouldCloneRemoteRepo } from "./repo-clone.js";

const WORKER_REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export type JobMessage = {
  jobId: string;
  organizationId?: string;
  credentials?: WorkerJobCredentials;
  options: Omit<BrownfieldJobOptions, "jobId" | "onEvent">;
};

export type ServiceBusConsumerOptions = {
  connectionString: string;
  queueName: string;
  /** When true, complete messages even if processing throws (dev only). Default false. */
  abandonOnError?: boolean;
  onEvent?: BrownfieldJobOptions["onEvent"];
};

/**
 * Long-polls the brownfield-jobs Service Bus queue and runs `runBrownfieldJob`
 * for each message. The API enqueues after POST /v1/brownfield-jobs passes
 * rate-limit and preflight checks.
 */
export async function startServiceBusConsumer(options: ServiceBusConsumerOptions): Promise<void> {
  const client = new ServiceBusClient(options.connectionString);
  const receiver = client.createReceiver(options.queueName, { receiveMode: "peekLock" });

  console.log(`# SpecBridge worker listening on queue: ${options.queueName}`);

  const processMessage = async (message: ServiceBusReceivedMessage): Promise<void> => {
    const body = message.body as JobMessage;
    if (!body?.jobId || !body?.options) {
      console.error("Invalid job message — missing jobId or options");
      await receiver.completeMessage(message);
      return;
    }

    const outputDir = body.options.outputDir ?? join(tmpdir(), "specbridge-jobs", body.jobId);
    await mkdir(outputDir, { recursive: true });

    let repoPath = body.options.repoPath ?? process.env.SPECBRIDGE_REPO_PATH ?? WORKER_REPO_ROOT;
    if (shouldCloneRemoteRepo(body.options)) {
      repoPath = join(outputDir, "repo");
      await cloneRepoShallow(
        body.options.repoUrl!,
        repoPath,
        body.options.branch ?? "main",
      );
    }

    const onEvent = createTracingEmit(
      wrapWithEventRelay(options.onEvent, body.jobId),
      {
        jobId: body.jobId,
        organizationId: body.organizationId,
      },
    );

    console.log(`# Processing job ${body.jobId}`);

    const credentialOpts = resolveCredentialResolverOptions(body.organizationId, body.credentials);
    let resolvedCredentials = null;
    if (credentialOpts) {
      try {
        resolvedCredentials = await resolveWorkerCredentials(credentialOpts);
      } catch (err) {
        console.warn(
          `# Credential resolve failed for job ${body.jobId}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    const applied = applyResolvedCredentials(resolvedCredentials);
    const useMock =
      body.options.mockAgents ?? (!applied.cursorApiKey && !process.env.CURSOR_API_KEY);

    try {
      await runBrownfieldJob({
        ...body.options,
        jobId: body.jobId,
        organizationId: body.organizationId,
        repoPath,
        outputDir,
        branch: body.options.branch ?? "main",
        headSha: body.options.headSha ?? "HEAD",
        cursorApiKey: applied.cursorApiKey,
        jira: applied.jira ?? body.options.jira,
        mockAgents: useMock,
        recordedAgents: body.options.recordedAgents ?? useMock,
        delivery: body.options.delivery
          ? {
              ...body.options.delivery,
              github: applied.github ?? body.options.delivery.github,
            }
          : applied.github
            ? { openPr: false, github: applied.github }
            : undefined,
        onEvent,
      });
      await receiver.completeMessage(message);
      console.log(`# Job ${body.jobId} completed`);
    } catch (err) {
      console.error(`# Job ${body.jobId} failed:`, err);
      if (options.abandonOnError) {
        await receiver.abandonMessage(message);
      } else {
        await receiver.deadLetterMessage(message, {
          deadLetterReason: "ProcessingFailed",
          deadLetterErrorDescription: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };

  receiver.subscribe({
    processMessage,
    processError: async (args) => {
      console.error("Service Bus error:", args.error);
    },
  });

  await new Promise<void>(() => undefined);
}

function wrapWithEventRelay(base: BrownfieldJobOptions["onEvent"], jobId: string): BrownfieldJobOptions["onEvent"] {
  const relayOptions = resolveEventRelayOptions(jobId);
  if (!relayOptions) {
    return base;
  }

  return createApiEventRelay(base, relayOptions);
}
