# Feature Spec: SpecBridge Brownfield Onboarding Platform

> **Status**: Pending Approval  
> **Feature ID**: specbridge-platform  
> **Created**: 2026-06-03  
> **Last Updated**: 2026-06-03

---

## Problem

Brownfield teams cannot adopt Specs-Driven Design because no tool can reverse-engineer a living codebase into trustworthy, agent-ready knowledge. Current approaches fail in three ways:

1. **One-shot exploration**: Tools like `/council` re-explore on every invocation, wasting tokens and providing inconsistent context.
2. **No quality feedback loop**: Generated knowledge has no mechanism to improve based on actual usage or historical accuracy.
3. **Manual scaffold burden**: Developers must manually apply SDD kit files, truth docs, and configure agents before they can start `/start-feature`.

**Impact**: Teams with valuable brownfield codebases cannot leverage AI-assisted SDD workflows, leaving them stuck with ad-hoc development practices.

---

## Goals

1. **Bootstrap SDD knowledge for any repo** — Generate council-v2 truth docs + tokenized knowledge shards at HEAD for any language/framework.

2. **Iterative quality improvement** — Walk commit history; for each Jira-linked commit, run 5 designated agents (Feature Historian, Commit Calibrator, Question Prober, Knowledge Curator, Knowledge Auditor) that improve knowledge quality commit-by-commit.

3. **Measurable improvement** — Track per-commit token consumption, calibration accuracy, and QA scores. Final report shows token reduction curve and mean quality score.

4. **Plugin-ready delivery** — Package result as a versioned ZIP bundle (`specbridge-bundle-{id}.zip`) containing:
   - `.cursor/` — full SDD kit
   - `.sdd/docs/` — truth docs (project_knowledge.md + project_deployment_knowledge.md)
   - `.sdd/knowledge/` — tokenized shards + manifest
   - `.sdd/features/completed/` — retro feature specs per Jira-linked commit
   - `.sdd/reports/` — quality report with per-commit token curve
   - `specbridge.manifest.json` — plugin contract

5. **Optional PR delivery** — If `delivery.openPr=true`, open a PR on the brownfield repo with the bundle applied to branch `sdd/onboarding/{jobId}`.

6. **Multi-tenant API** — Azure-hosted .NET 10 Minimal API with Entra ID auth, supporting multiple orgs with isolated GitHub/Jira/Confluence connections and Cursor API keys in Key Vault.

---

## Non-Goals (v1)

- **Custom SDD templates** — Only `csharp-sdd-starter-kit` is supported. No pluggable template engine or `POST /v1/templates` endpoint.
- **Retro backlog generation** — Feature Historian writes `feature_spec.md` only, not `requirements.md`, `stories.md`, or `plan.md` for historical commits.
- **Local Cursor execution** — Cursor Cloud Agents only (`cloud: { repos: [...] }`). No VM-based local Cursor.
- **Hard calibration gates** — Low `calibrationOverlapMean` triggers a warning in the report, not a job failure.
- **GHES network fixes** — GHES support requires Cursor egress IP allowlisting by the customer — documented prerequisite, not solved by the API.
- **Agent cost prediction** — No upfront Cursor cost estimate. Per-org rate limits (50 agent runs/hr) control spend.

---

## Constraints

### Technical

- **Stack**: .NET 10 Minimal API + TypeScript (`@cursor/sdk`) + Azure (Container Apps, Service Bus, PostgreSQL, Blob, Key Vault, App Insights).
- **Secrets**: All Cursor API keys, GitHub App keys, OAuth tokens stored as Key Vault secret **references** only. Never in DB values, never logged.
- **Tenant isolation**: Every DB row keyed by `organizationId`. Worker validates on every dequeue.
- **Agent separation**: Each of the 6 agent roles gets its own `Agent.create()` call with a dedicated system prompt file. Never share a session across roles.
- **Deterministic worker**: Orchestrator code (git, Jira REST, overlap math, zip packing) is deterministic TypeScript. Only LLM reasoning is delegated to agents.

### Operational

- **Repo URL allowlist**: `github.com` + admin-registered GHES hosts only. Rejected at validation before enqueueing.
- **Bundle SAS TTL**: 30-min read-only. Plugin must re-fetch `GET /bundle` for a fresh URL.
- **Rate limits**: 10 concurrent jobs per org; 50 Cursor agent runs/hr per org.
- **Audit log**: `jobId`, `repoUrl`, `headSha`, `agentRole`, `cursorRunId`, `prUrl` — never prompt bodies, never Jira content.

### Process

- **SDD dogfooding**: SpecBridge itself is built using the greenfield SDD workflow: `feature_spec.md` → backlog → `plan.md` → `/start-story` / `/finish-story`. No implementation code until this spec is approved.

---

## User Acceptance Criteria

### 1. Job Creation & Status Tracking

**Given** a user has registered a GitHub connection, Jira connection, and Cursor API key  
**When** they POST `/v1/brownfield-jobs` with valid inputs (repoUrl, commitDepth, granularityPrompt, etc.)  
**Then** the API returns `202 Accepted` with a `jobId` immediately  
**And** SSE stream at `/v1/brownfield-jobs/{id}/events` emits `phase_started`, `agent_started`, `agent_completed`, `commit_skipped`, `audit_verdict`, `bundle_ready`, `job_completed` events  
**And** `GET /v1/brownfield-jobs/{id}` returns current status, phase, agentRole, metrics

### 2. Knowledge Bootstrap

**Given** a brownfield job starts for a repo at HEAD SHA `abc123`  
**When** the `knowledge_bootstrap` phase runs  
**Then** the Knowledge Architect agent produces:
- `.sdd/docs/project_knowledge.md` with all 12 sections (or TBD markers)
- `.sdd/docs/project_deployment_knowledge.md`
- `.sdd/knowledge/manifest.json` with `tokenEstimateTotal` baseline
- `.sdd/knowledge/shards/{granularity}/` with shards matching the `granularityPrompt` (e.g., `tokenize_class`)

### 3. Commit Walk with Jira Enrichment

**Given** a repo with 50 commits, 34 of which have branch/commit names matching `ITDIGIT-\d+`  
**When** the `commit_walk` phase processes the history `oldest_first`  
**Then**:
- 16 commits without Jira keys emit `commit_skipped` SSE events
- 34 commits with Jira keys trigger the full 5-agent loop per commit:
  1. Feature Historian → `retro-feature-spec.md`
  2. Commit Calibrator → `calibration-report.json`
  3. Question Prober → `questions.json`
  4. Knowledge Curator → `curation-proposal.json`
  5. Knowledge Auditor → `audit-verdict.json`
- `job_commits` table has 50 rows (34 processed, 16 skipped)
- `job_phase_runs` table has 170 agent run rows (34 commits × 5 agents)

### 4. Iterative Quality Improvement

**Given** commit C_i has an approved Knowledge Auditor verdict with `tokenDelta: -1200` and `overallPass: true`  
**When** the worker applies approved patches to the knowledge store  
**And** processes the next commit C_{i+1}  
**Then** the `tokenEstimateTotal` in the rolling manifest decreases by ~1200 tokens  
**And** the per-commit token curve in `/v1/brownfield-jobs/{id}/report` shows the reduction

### 5. Bundle Delivery

**Given** a completed job with `delivery.bundle=true`  
**When** the plugin calls `GET /v1/brownfield-jobs/{id}/bundle`  
**Then** the API returns `302` redirect to a 30-min SAS URL  
**And** the ZIP at the SAS URL contains:
- `.cursor/` (rules, commands, agents, skills)
- `AGENTS.md`, `USAGE_GUIDE.md`
- `.sdd/docs/` (truth docs)
- `.sdd/knowledge/` (shards + manifest)
- `.sdd/features/completed/` (one file per Jira-linked commit)
- `.sdd/reports/onboarding-{jobId}.json` (per-commit token curve, QA scores)
- `specbridge.manifest.json` (plugin contract with file checksums)
**And** the ZIP extraction merges into workspace root without deleting existing user files

### 6. Optional PR

**Given** a completed job with `delivery.openPr=true`  
**When** the worker finishes bundle packaging  
**Then** a PR is opened on the brownfield repo with:
- Branch: `sdd/onboarding/{jobId}`
- Title: `"chore(sdd): brownfield SDD onboarding via SpecBridge"` (or custom `prTitle`)
- Body: includes discovery summary, metrics, checklist, links to artifacts
- Commits: merge-safe (no existing file deletion)

### 7. Quality Report & Metrics

**Given** a completed job that processed 34 Jira-linked commits  
**When** the plugin calls `GET /v1/brownfield-jobs/{id}/report`  
**Then** the JSON response includes:
- `tokenCurve: [{ commitSha, tokenEstimate, qaScore }]` (34 entries, oldest → newest)
- `tokenEstimateStart: 1200000`
- `tokenEstimateEnd: 680000`
- `tokenReduction: "43%"`
- `meanQaScore: 0.81`
- `calibrationOverlapMean: 0.68`
- `commitsProcessed: 34`
- `commitsSkipped: 16`
- `patchesApproved: 102`
- `patchesRejected: 8`

### 8. Security & Tenant Isolation

**Given** two orgs (Org A, Org B) using the same SpecBridge instance  
**When** Org A lists jobs via `GET /v1/brownfield-jobs`  
**Then** only Org A's jobs are returned (filtered by `organizationId` from Entra JWT)  
**And** Org A cannot call `GET /v1/brownfield-jobs/{orgBJobId}` (returns `403`)  
**And** no Cursor API keys, GitHub App keys, or OAuth tokens appear in API responses or logs

---

## Conceptual APIs

### POST /v1/brownfield-jobs

**Request**:
```json
{
  "repoUrl": "https://github.com/org/legacy-app",
  "githubConnectionId": "uuid",
  "cursorCredentialId": "uuid",
  "history": { "commitDepth": 50, "walkOrder": "oldest_first" },
  "jira": { "connectionId": "uuid", "issueKeyPattern": "ITDIGIT-\\d+", "extractFrom": ["commit_message", "branch_name"] },
  "knowledge": { "granularityPrompt": "tokenize_class", "advisorPrompt": "Focus on auth and data boundaries only", "maxShardTokens": 800 },
  "validation": { "devilsAdvocateQuestionCount": 10, "minAnswerScore": 0.75, "maxRoundsPerCommit": 1 },
  "delivery": { "bundle": true, "openPr": false }
}
```

**Response** (202):
```json
{
  "jobId": "uuid",
  "status": "queued",
  "estimatedCommitsToProcess": 34,
  "createdAt": "2026-06-03T22:00:00Z",
  "_links": {
    "self": "/v1/brownfield-jobs/{jobId}",
    "events": "/v1/brownfield-jobs/{jobId}/events",
    "bundle": "/v1/brownfield-jobs/{jobId}/bundle",
    "report": "/v1/brownfield-jobs/{jobId}/report",
    "cancel": "/v1/brownfield-jobs/{jobId}/cancel"
  }
}
```

### GET /v1/brownfield-jobs/{id}

**Response** (200):
```json
{
  "jobId": "uuid",
  "status": "commit_walk",
  "currentPhase": "question_prober",
  "currentCommitSha": "def456",
  "headSha": "abc123",
  "commitsProcessed": 12,
  "commitsSkipped": 5,
  "commitsRemaining": 17,
  "metrics": { "tokenEstimateStart": 1200000, "tokenEstimateCurrent": 890000, "meanQaScore": 0.79 },
  "prUrl": null,
  "createdAt": "2026-06-03T22:00:00Z",
  "updatedAt": "2026-06-03T22:15:00Z"
}
```

### GET /v1/brownfield-jobs/{id}/events (SSE)

```
event: phase_started
data: {"phase":"knowledge_bootstrap","jobId":"uuid","ts":"2026-06-03T22:01:00Z"}

event: agent_started
data: {"agentRole":"knowledge-architect","cursorAgentId":"uuid","runId":"uuid"}

event: agent_completed
data: {"agentRole":"knowledge-architect","tokensIn":5200,"tokensOut":1840,"durationMs":42000}

event: commit_skipped
data: {"commitSha":"789abc","reason":"no_jira_key"}

event: audit_verdict
data: {"commitSha":"def456","overallPass":true,"tokenDelta":-1200,"scores":{"coverage":0.85,"precision":0.92,"citation":0.88,"tokenEfficiency":0.91}}

event: bundle_ready
data: {"bundleUrl":"https://...sas","sizeMb":12.4}

event: job_completed
data: {"jobId":"uuid","metrics":{...},"prUrl":"https://github.com/org/legacy-app/pull/42"}
```

### GET /v1/brownfield-jobs/{id}/bundle

**Response** (302):
```
Location: https://specbridgeblob.blob.core.windows.net/bundles/specbridge-bundle-{id}.zip?sp=r&st=...&se=...&sv=2022-11-02&sr=b&sig=...
```

### GET /v1/brownfield-jobs/{id}/report

**Response** (200):
```json
{
  "jobId": "uuid",
  "repoUrl": "https://github.com/org/legacy-app",
  "headSha": "abc123",
  "sddKit": { "id": "csharp-sdd-starter-kit", "version": "1.0.0" },
  "tokenCurve": [
    { "commitSha": "oldest", "tokenEstimate": 1200000, "qaScore": null },
    { "commitSha": "...", "tokenEstimate": 1180000, "qaScore": 0.76 },
    ...
    { "commitSha": "newest", "tokenEstimate": 680000, "qaScore": 0.84 }
  ],
  "tokenEstimateStart": 1200000,
  "tokenEstimateEnd": 680000,
  "tokenReduction": "43%",
  "meanQaScore": 0.81,
  "calibrationOverlapMean": 0.68,
  "commitsProcessed": 34,
  "commitsSkipped": 16,
  "patchesApproved": 102,
  "patchesRejected": 8
}
```

---

## Observability

### Logging

- **Structured JSON logs** via OpenTelemetry with fields: `jobId`, `agentRole`, `commitSha`, `cursorAgentId`, `runId`, `organizationId`.
- **Never log**: Cursor API keys, GitHub tokens, OAuth tokens, prompt bodies, repo file content, Jira issue descriptions.
- **Log levels**:
  - `INFO`: phase transitions, agent starts/completions, commit processing
  - `WARN`: calibration overlap < 0.40, QA score < minAnswerScore, patch rejection rate > 20%
  - `ERROR`: agent failures, Jira/GitHub API errors, Key Vault access failures

### Metrics (Application Insights)

- `jobs.created` (counter, by `organizationId`)
- `jobs.completed` (counter, by `status`: `completed`, `failed`, `cancelled`)
- `jobs.duration_ms` (histogram)
- `agent.runs` (counter, by `agentRole`)
- `agent.tokens_in` / `agent.tokens_out` (histogram, by `agentRole`)
- `agent.duration_ms` (histogram, by `agentRole`)
- `commits.processed` / `commits.skipped` (counter)
- `patches.approved` / `patches.rejected` (counter)
- `bundle.size_mb` (histogram)

### Distributed Tracing

- Correlate `jobId` ↔ Cursor `run.id` using OpenTelemetry trace context.
- Parent span: `POST /brownfield-jobs` → child spans: each agent run, each commit processing.

### Alerts

- **High agent failure rate**: >10% agent runs fail within 1 hour
- **QA score below threshold**: job completes with `meanQaScore < 0.70`
- **Key Vault access denied**: any Key Vault `403` response
- **Rate limit breaches**: org exceeds 50 agent runs/hr

---

## Open Questions

1. **Tree-sitter parser coverage**: Which languages beyond Python, Java, Go, TypeScript should we prioritize for Phase 6 parsers?
2. **Shard cap enforcement**: Should jobs with >100k shards fail preflight, or auto-switch to `tokenize_namespace` / `tokenize_file`?
3. **GHES network testing**: Do we provide a preflight network check endpoint, or document the Cursor egress IP requirement only?
4. **Curator retry strategy**: Should `maxRoundsPerCommit` apply per commit or per question batch?
5. **Plugin manifest versioning**: If `specbridgeVersion: "1.1"` adds fields, should old plugins reject or ignore unknown fields?

---

## Dependencies

### External Services

- **GitHub API** (github.com + GHES): repo clone, PR creation, installation token refresh
- **Jira REST API**: issue fetch via `GET /rest/api/3/issue/{key}`
- **Confluence REST API** (optional): page fetch for advisor context
- **Cursor Cloud Agents**: `@cursor/sdk` with `cloud: { repos: [...] }`

### Azure Resources

- **Container Apps**: API + worker (scale independently)
- **Service Bus Standard**: job queue
- **PostgreSQL Flexible Server**: job metadata, connections, audit log
- **Blob Storage**: bundles, agent artifacts
- **Key Vault**: Cursor keys, GitHub App key, OAuth tokens
- **Application Insights**: logs, metrics, traces
- **Entra ID**: API authentication

### SDD Kit

- **csharp-sdd-starter-kit**: pinned version vendored into every bundle. Default: latest stable release tag.

---

## Success Metrics

### Product Adoption

- **Jobs completed**: 100+ jobs/month within 3 months of GA
- **Mean token reduction**: >30% across all jobs
- **Mean QA score**: >0.75 across all jobs
- **Plugin installations**: 50+ active plugin users within 6 months

### Technical Performance

- **Job completion rate**: >95% of queued jobs complete without `failed` status
- **Agent run success rate**: >98% of agent runs complete without error
- **P95 job duration**: <45 min for 50-commit jobs with `tokenize_class`
- **Bundle generation success**: 100% of completed jobs produce valid ZIP with checksums matching manifest

### Cost Efficiency

- **Cursor token cost/job**: <$5 per 50-commit job (tracked via per-agent token metrics)
- **Azure infra cost/job**: <$0.50 per job (Container Apps + Service Bus + PG + Blob)

---

## Release Plan

### Phase 0 (Week 1)

- OpenAPI 3.1 spec for all 15 endpoints
- `specbridge.manifest.json` JSON Schema
- Postman collection + fake worker

### Phase 1 (Week 2)

- .NET 10 API skeleton (Entra JWT, FluentValidation, SSE stub)
- PostgreSQL schema + EF Core migrations
- Key Vault secret reference pattern

### Phase 2 (Weeks 3–4)

- TypeScript `agent-orchestrator` + `stack-detect`
- Knowledge Architect agent (council-v2 + tokenize)
- Blob bundle packer

### Phase 3 (Weeks 5–6)

- `commit-walker` + Jira REST client
- Feature Historian agent

### Phase 4 (Weeks 7–8)

- Commit Calibrator, Question Prober, Knowledge Curator, Knowledge Auditor
- Per-commit token curve report

### Phase 5 (Weeks 9–10)

- Service Bus + Container Apps Bicep IaC
- App Insights correlation
- Optional PR delivery
- Confluence ingest

### Phase 6 (Ongoing)

- Tree-sitter parsers (Python, Java, Go, TypeScript)
- CI agent mocks
- GHES host registry
- Audit log policy

---

## Approval Checklist

- [ ] Problem statement accurately reflects customer pain
- [ ] Goals are measurable and time-bound
- [ ] Non-Goals prevent scope creep
- [ ] Constraints are technically feasible and operationally acceptable
- [ ] User acceptance criteria cover happy path + edge cases
- [ ] Conceptual APIs match planned OpenAPI spec
- [ ] Observability plan supports production ops
- [ ] Open questions identified with owners assigned
- [ ] Dependencies documented with fallback plans
- [ ] Success metrics align with business goals
- [ ] Release plan maps to implementation phases

---

**Next Steps After Approval:**

1. Run `@backlog_architect.md` to generate `requirements.md`, `svs.md`, `stories.md` with `REQ-SB-*` IDs
2. Run `@technical-devils-advocate.md` to challenge stories
3. Run `@technical_analyst.md` for feasibility assessment
4. Generate `plan.md` mapping to Phases 0–6
5. Begin `/start-story` for Phase 0 (OpenAPI contract)
