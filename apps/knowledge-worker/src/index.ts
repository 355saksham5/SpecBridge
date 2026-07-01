#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runBrownfieldJob } from "./job-pipeline.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = { local: false, mock: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--local") args.local = true;
    else if (arg === "--mock") args.mock = true;
    else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args["service-bus"] === true) {
    const connectionString = process.env.SPECBRIDGE_SERVICE_BUS_CONNECTION;
    const queueName = (process.env.SPECBRIDGE_SERVICE_BUS_QUEUE as string) ?? "brownfield-jobs";
    if (!connectionString) {
      console.error("SPECBRIDGE_SERVICE_BUS_CONNECTION is required for --service-bus mode");
      process.exit(1);
    }
    const { startServiceBusConsumer } = await import("./service-bus-consumer.js");
    await startServiceBusConsumer({
      connectionString,
      queueName,
      onEvent: (event) => {
        if ("type" in event && "payload" in event) {
          console.log(`event: ${event.type}`);
          console.log(`data: ${JSON.stringify(event.payload)}`);
        }
      },
    });
    return;
  }

  const jobId = (args.jobId as string) ?? randomUUID();
  const repoPath = (args.repo as string) ?? REPO_ROOT;
  const outputDir = (args.output as string) ?? join(REPO_ROOT, "tmp", "jobs", jobId);
  const mock = args.mock === true || args.local === true || !process.env.CURSOR_API_KEY;

  console.log(`# SpecBridge Knowledge Worker`);
  console.log(`# jobId: ${jobId}`);
  console.log(`# repo:  ${repoPath}`);
  console.log(`# mock:  ${mock}`);

  const result = await runBrownfieldJob({
    jobId,
    repoPath,
    repoUrl: (args.repoUrl as string) ?? "https://github.com/org/specbridge",
    branch: (args.branch as string) ?? "master",
    headSha: (args.headSha as string) ?? "HEAD",
    outputDir,
    granularityPrompt: (args.granularity as "tokenize_class") ?? "tokenize_class",
    advisorPrompt: args.advisor as string | undefined,
    commitDepth: args.commitDepth ? Number(args.commitDepth) : 50,
    issueKeyPattern: args.issueKeyPattern as string | undefined,
    cursorApiKey: process.env.CURSOR_API_KEY,
    mockAgents: mock,
    validation: {
      devilsAdvocateQuestionCount: args.questionCount ? Number(args.questionCount) : undefined,
      minAnswerScore: args.minAnswerScore ? Number(args.minAnswerScore) : undefined,
      maxRoundsPerCommit: args.maxRounds ? Number(args.maxRounds) : undefined,
    },
    onEvent: (event) => {
      if ("type" in event && "payload" in event) {
        console.log(`event: ${event.type}`);
        console.log(`data: ${JSON.stringify(event.payload)}`);
        console.log("");
      }
    },
  });

  console.log(`# Job complete`);
  console.log(`# ZIP: ${result.zipPath}`);
  console.log(`# Shards: ${result.shardCount}`);
  console.log(`# Tokens (start -> end): ${result.tokenEstimateStart} -> ${result.tokenEstimateEnd}`);
  console.log(`# Commits processed: ${result.commitsProcessed}, skipped: ${result.commitsSkipped}`);
  console.log(`# Mean QA score: ${result.meanQaScore ?? "n/a"}, calibration overlap mean: ${result.calibrationOverlapMean ?? "n/a"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
