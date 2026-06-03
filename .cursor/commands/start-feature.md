# start-feature

Entry-point for a new feature. Drives the stepped SDD workflow.

This command is the **only** required invocation to kick off a feature — it loads the SDD rules into context and gates the workflow. Do not just describe a feature in freeform chat; the rules that enforce "feature spec first, then STOP for review" are not loaded on every turn (to save tokens), so you'll get a plan-and-implement response instead of a proper spec.

## Usage

```
/start-feature "<feature name>" [--non-interactive]
```

Required: feature name. Prompt the user if missing.

## What this command must do — embedded gate behaviour

The full SDD workflow rules live in `@.cursor/rules/sdd-workflow-orchestration.mdc` and `@.cursor/rules/specs-driven-design.mdc`. **Attach those files before proceeding** so the gating logic and traceability rules are in context for this command's run.

Then execute the SDD workflow:

### Step 1 — Spec only (this turn)

1. Derive a kebab-case `<feature-identifier>` from the feature name. Example: "Saved Views for Reports" → `saved-views-for-reports`.
2. Create `.sdd/features/pending/<feature-identifier>/`. If it already exists, ask the user: overwrite | resume | versioned variant.
3. Read truth docs for project context:
   - `@.sdd/docs/project_knowledge.md` (always)
   - `@.sdd/docs/project_deployment_knowledge.md` (only if the feature touches deploy/infra)

   If the truth docs are missing, run `/council-v2` first (it auto-creates them) or tell the user to do so.
4. Read the spec shape template: `@.cursor/examples/example_feature_spec.md`.
5. **Write ONLY `.sdd/features/pending/<feature-identifier>/feature_spec.md`**. It must contain:
   - **Problem** — what user pain is being solved
   - **Goals / Non-Goals** — in scope vs out of scope for this version
   - **Constraints** — tech stack, performance targets, security, rollout
   - **User Acceptance** — high-level "done" conditions
   - **APIs (Conceptual)** — rough endpoint list
   - **Observability** — events, metrics, log fields
6. **STOP for explicit user review.** Print: *"Feature spec is ready for review at `.sdd/features/pending/<feature-identifier>/feature_spec.md`. Confirm to proceed to Step 2 (backlog)."*
7. **Do NOT generate** `requirements.md`, `svs.md`, `stories.md`, `plan.md`, code, tests, or anything else in this turn.

### Step 2+ — Subsequent turns (user-driven)

On user approval ("approved", "looks good", "proceed", etc.):

- **Step 2 — backlog.** Invoke the Backlog Architect: `@.cursor/agents/backlog_architect.md`. Generate `requirements.md`, `svs.md`, `stories.md`. STOP for review.
- **Step 3 — plan.** Write `plan.md` with task breakdown, dependencies, risk register, each step tagged with its REQ-ID. STOP for review.
- **Step 4 (optional) — publish.** Confluence (`@.cursor/agents/epic_initiative_confluence.md`) and/or Jira (`@.cursor/skills/jira-epic-story-task-automation/SKILL.md`).

Each step is one turn. Stop after each. Do not collapse multiple steps into one response.

### `--non-interactive`

Runs all steps straight through without stopping for review. Use only when you're confident in the inputs (rare).

## Hard rules

- **No code, tests, or plan content in Step 1.** Only `feature_spec.md`.
- **No scope expansion beyond the spec's goals** in any later step without explicit user confirmation. Spec is the canonical scope.
- **All output** under `.sdd/features/pending/<feature-identifier>/` (or legacy `output/<project-name>/` if the project already uses that).

## Examples

```
/start-feature "Saved Views for Reports"
/start-feature "Per-Tenant Data Residency"
/start-feature "Async Webhook Retries"
```
