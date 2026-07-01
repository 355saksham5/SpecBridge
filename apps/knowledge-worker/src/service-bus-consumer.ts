import { ServiceBusClient, type ServiceBusReceivedMessage } from "@azure/service-bus";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runBrownfieldJob, type BrownfieldJobOptions } from "./job-pipeline.js";
import { createTracingEmit } from "./telemetry.js";

export type JobMessage = {
  jobId: string;
  organizationId?: string;
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

    const onEvent = createTracingEmit(options.onEvent, {
      jobId: body.jobId,
      organizationId: body.organizationId,
    });

    console.log(`# Processing job ${body.jobId}`);

    try {
      await runBrownfieldJob({
        ...body.options,
        jobId: body.jobId,
        outputDir,
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

  // Keep process alive until externally terminated.
  await new Promise<void>(() => undefined);
}
