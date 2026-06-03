#!/usr/bin/env node

/**
 * Phase 0 Fake Worker
 * 
 * Simulates the TypeScript agent orchestrator by emitting SSE events
 * that match the OpenAPI contract. Used for contract validation only.
 * 
 * Usage: node index.js [jobId]
 * 
 * Emits events to stdout in SSE format:
 * - phase_started
 * - agent_started
 * - agent_completed
 * - commit_skipped
 * - audit_verdict
 * - bundle_ready
 * - job_completed
 */

const jobId = process.argv[2] || 'fake-job-uuid';
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Emit SSE event to stdout
 */
function emitEvent(eventType, data) {
  const timestamp = new Date().toISOString();
  console.log(`event: ${eventType}`);
  console.log(`data: ${JSON.stringify({ ...data, jobId, ts: timestamp })}`);
  console.log(''); // SSE requires blank line after each event
}

async function runFakeJob() {
  console.log('# Fake Worker started for job:', jobId);
  console.log('# Emitting SSE events to stdout...\n');

  await sleep(500);

  // Phase 1: Knowledge Bootstrap
  emitEvent('phase_started', { phase: 'knowledge_bootstrap' });
  await sleep(200);

  emitEvent('agent_started', {
    agentRole: 'knowledge-architect',
    cursorAgentId: 'fake-agent-uuid-1',
    runId: 'fake-run-1',
  });
  await sleep(1000);

  emitEvent('agent_completed', {
    agentRole: 'knowledge-architect',
    tokensIn: 5200,
    tokensOut: 1840,
    durationMs: 42000,
  });
  await sleep(300);

  // Phase 2: Commit Walk (simulate 3 commits: 2 processed, 1 skipped)
  emitEvent('phase_started', { phase: 'commit_walk' });
  await sleep(200);

  // Commit 1 (skipped - no Jira key)
  emitEvent('commit_skipped', {
    commitSha: 'skip789abc',
    reason: 'no_jira_key',
  });
  await sleep(300);

  // Commit 2 (processed)
  const commit2Sha = 'proc123def';
  for (const agentRole of [
    'feature-historian',
    'commit-calibrator',
    'question-prober',
    'knowledge-curator',
    'knowledge-auditor',
  ]) {
    emitEvent('agent_started', {
      agentRole,
      cursorAgentId: `fake-agent-uuid-${agentRole}`,
      runId: `fake-run-${agentRole}-c2`,
      commitSha: commit2Sha,
    });
    await sleep(800);

    emitEvent('agent_completed', {
      agentRole,
      tokensIn: Math.floor(Math.random() * 3000) + 1000,
      tokensOut: Math.floor(Math.random() * 1000) + 300,
      durationMs: Math.floor(Math.random() * 20000) + 10000,
      commitSha: commit2Sha,
    });
    await sleep(200);
  }

  emitEvent('audit_verdict', {
    commitSha: commit2Sha,
    overallPass: true,
    tokenDelta: -1200,
    scores: {
      coverage: 0.85,
      precision: 0.92,
      citation: 0.88,
      tokenEfficiency: 0.91,
    },
  });
  await sleep(300);

  // Commit 3 (processed)
  const commit3Sha = 'proc456ghi';
  for (const agentRole of [
    'feature-historian',
    'commit-calibrator',
    'question-prober',
    'knowledge-curator',
    'knowledge-auditor',
  ]) {
    emitEvent('agent_started', {
      agentRole,
      cursorAgentId: `fake-agent-uuid-${agentRole}`,
      runId: `fake-run-${agentRole}-c3`,
      commitSha: commit3Sha,
    });
    await sleep(800);

    emitEvent('agent_completed', {
      agentRole,
      tokensIn: Math.floor(Math.random() * 3000) + 1000,
      tokensOut: Math.floor(Math.random() * 1000) + 300,
      durationMs: Math.floor(Math.random() * 20000) + 10000,
      commitSha: commit3Sha,
    });
    await sleep(200);
  }

  emitEvent('audit_verdict', {
    commitSha: commit3Sha,
    overallPass: true,
    tokenDelta: -800,
    scores: {
      coverage: 0.88,
      precision: 0.94,
      citation: 0.90,
      tokenEfficiency: 0.93,
    },
  });
  await sleep(300);

  // Phase 3: Bundle Packaging
  emitEvent('phase_started', { phase: 'bundle_packaging' });
  await sleep(1000);

  emitEvent('bundle_ready', {
    bundleUrl: 'https://specbridgeblob.blob.core.windows.net/bundles/fake-bundle.zip?sp=r&st=...&se=...&sv=2022-11-02&sr=b&sig=fake',
    sizeMb: 12.4,
  });
  await sleep(500);

  // Job Complete
  emitEvent('job_completed', {
    metrics: {
      tokenEstimateStart: 1200000,
      tokenEstimateEnd: 680000,
      tokenReduction: '43%',
      meanQaScore: 0.81,
      commitsProcessed: 2,
      commitsSkipped: 1,
    },
    prUrl: null,
  });

  console.log('\n# Fake Worker completed');
}

runFakeJob().catch((err) => {
  console.error('# Fake Worker error:', err);
  process.exit(1);
});
