# council-v2

Maintain and query the project's **living truth docs** so other agents and commands don't re-explore the codebase on every call. Complement to (not a replacement for) `/council`.

When to use which:

- **`/council`** — one-shot broad codebase exploration (spawns parallel sub-agents). Best for unfamiliar code, debugging, "how does X work today?".
- **`/council-v2`** — read or refresh persistent project knowledge. Cheaper per call. Best for routine work where `/council` would just re-discover the same facts.

## Truth docs (under `.sdd/docs/`)

- **`project_knowledge.md`** — architecture, modules, contracts, conventions, glossary.
- **`project_deployment_knowledge.md`** — environments, pipelines, infra modules, runtime topology, secrets, rollback.

Kept current incrementally by `/finish-story` and `/finish-task`. `/council-v2` provides bootstrap and on-demand refresh.

## Stack context (this project)

- **Frontend:** Angular (see `.cursor/rules/angular-patterns.mdc`).
- **Backend:** ASP.NET Core APIs (see `.cursor/rules/dotnet-api.mdc`, `dotnet-backend-patterns.mdc`).
- **Process:** Specs-Driven Design — see `.cursor/rules/specs-driven-design.mdc` and `.cursor/agents/backlog_architect.md`.

When refreshing, organise findings by these boundaries (Angular modules vs ASP.NET Core controllers/services) and call out cross-boundary contracts.

## Behaviour (always runs in this order)

### Step 0 — Truth-doc precondition (unconditional)

**Always check first**, before any other branching:

1. Look for `.sdd/docs/project_knowledge.md` and `.sdd/docs/project_deployment_knowledge.md`.
2. If **either** is missing, explore the codebase and **create the missing doc(s) now**. Announce: *"Project truth docs are missing. Generating `.sdd/docs/project_knowledge.md` and `.sdd/docs/project_deployment_knowledge.md` first (one-time setup) — this informs everything that follows."*
3. If both exist, read them into context.

This is unconditional. Even when the prompt looks like a feature plan, the truth docs must exist first — the spec is much better when the agent has the project's architecture in hand.

### Step 1 — Branch on the prompt

After Step 0 has guaranteed the truth docs exist, branch:

| Prompt shape | Action |
|---|---|
| No content (just `/council-v2`) | Print a summary: paths to the truth docs and what was just created/read. |
| `--refresh`, `--refresh code`, or `--refresh deploy` | **Force regenerate** the named doc(s) even if they already exist. Update timestamp + SHA. |
| Feature-planning intent (see signals below) | **Pivot to `/start-feature`** (see Step 2 below). |
| Knowledge question (e.g. "where is the auth boundary?", "what services use OpenSearch?") | Answer from the truth docs. If a clearly durable project fact emerges, append it to the right section. Feature-specific detail does NOT belong here. |

### Step 2 — Feature-planning pivot (when detected)

**Detection signals** — any of these in the prompt:
- "I want to build / implement / plan / add a feature…"
- "I am thinking about / planning to build…"
- "thinking about requirements…"
- "feature to <do something>…"
- "let's build…" / "let's add…" / "let's implement…"

When detected (and after Step 0 has produced the truth docs):

1. Announce the pivot: *"This looks like a new feature, not a project-knowledge question. Running the SDD spec flow per `/start-feature` so you get a proper `feature_spec.md` and a review gate."*
2. Attach `@.cursor/commands/start-feature.md`, `@.cursor/rules/sdd-workflow-orchestration.mdc`, `@.cursor/rules/specs-driven-design.mdc`, and `@.cursor/examples/example_feature_spec.md`.
3. Execute **Step 1 of `start-feature.md`**:
   - Derive a kebab-case `<feature-identifier>` from the description (suggest one and confirm if ambiguous).
   - Create `.sdd/features/pending/<feature-identifier>/`.
   - Write **only** `.sdd/features/pending/<feature-identifier>/feature_spec.md` (Problem / Goals / Non-Goals / Constraints / User Acceptance / Conceptual APIs / Observability) — informed by the truth docs from Step 0.
4. **STOP for review.** Do NOT generate `requirements.md`, `svs.md`, `stories.md`, `plan.md`, code, or tests in this turn.
5. Print: *"Feature spec is ready for review at `.sdd/features/pending/<feature-identifier>/feature_spec.md`. Confirm to proceed to Step 2 (backlog)."*

## Quick reference

| Invocation | What you get |
|---|---|
| `/council-v2` (first run, fresh project) | Both truth docs generated. |
| `/council-v2` (subsequent runs) | Reads existing docs; prints summary. |
| `/council-v2 "<knowledge question>"` | Reads docs (creates if missing), answers from them. Appends durable findings if any. |
| `/council-v2 I want to build/plan/implement <feature>…` | Creates truth docs if missing, **then** pivots to `/start-feature` Step 1 → `feature_spec.md` only → STOP. |
| `/council-v2 --refresh` | Force regenerate both truth docs. |
| `/council-v2 --refresh code` / `--refresh deploy` | Force regenerate one doc only. |

**First run on a fresh project:** just type `/council-v2`. Truth docs will be created automatically.

**Stale docs after a major refactor:** run `/council-v2 --refresh` to rebuild from scratch.

## Goal of the truth docs

The truth docs are the **single source of project knowledge for AI agents**. Generate them with enough depth that downstream agents (Backlog Architect, Devil's Advocate, Technical Analyst, story implementers) **rarely need to re-explore the codebase**. If they do need to look at code, they should be able to go directly to specific files because the doc named them.

Capture **existing features, rules, and business logic** — not just architecture. The doc should answer: *"What does this project DO today, and where does each piece live?"*

If a section can only be stubbed, mark it explicitly **TBD** so the gap is visible — don't drop the section.

## Doc shapes

### `project_knowledge.md`

```markdown
# Project Knowledge — {repo}
> Refreshed: {ISO} at SHA {sha}. Auto-updated by /finish-story and /finish-task.

## Architecture overview
{Purpose; deployment shape; sibling/parent dependencies; key cloud services; runtime topology in one paragraph.}

## Module / package map
{Every non-trivial module/package with its role. For C# / .NET: every project under src/ or the solution root. For Angular: every module/component/service. Skip generated/vendored code. Keep one row per file or tight grouping.}

## Existing features
{What the codebase IMPLEMENTS today. One row per feature: name, entry point(s), one-line description. This is the "what does this project DO" answer. New work plugs into or extends what's here — agents must know what already exists.}

## Key contracts
{Public APIs, DTOs, schemas, message contracts. Names + signatures + auth + status codes. Not implementation — just the contract surface.}

## External integrations
{Every external service called: name, purpose, auth method, base URL env var, secret/key location. Agents wiring new integrations should not have to grep for env var names.}

## Common code patterns
{The typical handler / controller / service structure with a representative 5–10 line example. Decorator stacking, request/response flow, error wrapping. One example is worth a paragraph of prose.}

## Cross-cutting concerns
{Auth flows (every mechanism in use), RBAC model, observability/logging stack (init, levels, masking, audit, monitoring), feature flags, error-handling pattern, PII / sanitisation rules already in place.}

## Testing
{Framework, where tests live, fixture conventions, what's mocked vs real, how to run locally, coverage expectations, common gotchas.}

## Build & packaging
{How the artefact is produced (zip, NuGet package, Docker, zip deploy). Multi-arch? Bundled dependencies? Local build command. CI integration.}

## Configuration
{Environment variables, config sources (env, SSM, Secrets Manager), where to add new ones, naming conventions.}

## Conventions in effect
{Pointers to .cursor/rules/*.mdc. Do NOT duplicate rule content here — link only.}

## Glossary
{Domain terms used across the codebase, especially internal jargon and product-specific abbreviations.}
```

### `project_deployment_knowledge.md`

```markdown
# Deployment Knowledge — {repo}
> Refreshed: {ISO} at SHA {sha}. Auto-updated by /finish-story for deploy/infra changes.

## Environments and regions
{dev / qa / staging / prod; AWS regions; tenancy model; how environments differ.}

## Pipeline shape
{Jenkins jobs, stages, promotion flow, artefacts produced at each stage.}

## Infra modules
{Terraform / CDK / k8s manifests / CloudFormation templates — names, what each provisions, dependency order.}

## Runtime topology
{Containers, lambdas, queues, schedulers, scheduled jobs (with cron expressions), DNS, load balancers.}

## Secrets and config sources
{Where secrets live (Secrets Manager paths, Parameter Store namespaces). Naming conventions. NEVER put secret values here.}

## Deploy procedures
{How a typical deploy happens. Promotion order. Manual gates. Approval flow.}

## Rollback procedures
{Per environment / per service. How to revert quickly when something goes wrong.}

## Monitoring & alerts
{Dashboards (with paths), alert thresholds, on-call playbooks.}
```

## Coverage standard

After `--refresh` completes, a reviewer should be able to answer **all** of these questions from the docs alone (without grep):

- What does this project do today? What features ship in it?
- Where does the typical request/handler/controller live? What's the structure?
- How is auth handled? RBAC? Logging? Error handling?
- What external services are called, with what auth, from what env vars?
- How are tests organised? How do I run them?
- How is the artefact built and deployed? Promoted? Rolled back?
- What domain terms / abbreviations are in use?

If any of those still requires exploration, the truth docs are incomplete — refine the generation, don't accept thin sections.

## Routing rules (used by /finish-story, /finish-task)

- Deployment doc for: `infra/**`, `deploy/**`, `terraform/**`, `cdk/**`, `**/k8s/**`, `**/Jenkinsfile*`, `**/Dockerfile*`, `**/.github/workflows/**`.
- Code doc for: everything else.
- A single change may update both.

## Examples

```
/council-v2
/council-v2 "where is the auth boundary?"
/council-v2 --refresh
/council-v2 --refresh deploy
```
