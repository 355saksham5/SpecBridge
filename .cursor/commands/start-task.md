# start-task

Lightweight flow for bug fixes and small tasks. No SDD ceremony.

**Use for:** bug fixes, copy/UX tweaks, dependency bumps, small refactors, internal cleanup, on-call fixes.
**Don't use for:** new public contracts, schema changes, cross-team coordination — those go through `/start-feature`.

## Usage

```
/start-task "<short description>" [--identifier <task-identifier>]
```

Required: description. Prompt if missing.

## Steps

### Step 0 — Scope check (before anything else)

Quickly assess the description against these **big-scope signals**. If **any** clearly applies, this is bigger than a task — recommend `/start-feature` instead.

- Introduces a **new public API** or changes existing API contracts.
- **Breaking changes** to shared schemas, message formats, or DB structures.
- Spans **multiple services or modules** in unrelated areas.
- Requires **multi-team coordination**.
- Would naturally **split into 2+ stories** (multiple acceptance criteria; multiple independently testable outcomes).
- Adds a **genuinely new feature** (not a bug fix, refactor, dep bump, or polish).
- Touches **security boundaries, auth, RBAC, or PII handling** in a way that needs an explicit spec.

If any apply, **stop and tell the user**:

> "This sounds bigger than a task — it [reason, e.g. 'spans multiple services and introduces a new contract']. Recommend `/start-feature \"<suggested-name>\"` for the full SDD flow (spec → backlog → plan → multiple stories). Want me to:
>
> 1. Pivot to `/start-feature` now (recommended), or
> 2. Proceed with the lightweight `/start-task` flow anyway?"

Wait for the user's choice. **If they pick 1**, pivot to the `/start-feature` flow (announce, attach `@.cursor/commands/start-feature.md` + SDD rules + `@.cursor/examples/example_feature_spec.md`, generate `feature_spec.md` only, STOP for review). **If they pick 2**, continue to Step 1 below.

If **no signals apply**, skip the prompt and continue straight to Step 1.

### Step 1 — Generate the brief

1. **Identifier** (kebab-case) derived from description, or use `--identifier` if provided.
2. **Read truth docs** — `project_knowledge.md` always; `project_deployment_knowledge.md` if the description hints at infra/deploy.
3. **Generate** `.sdd/tasks/pending/<task-identifier>.md` from `templates/task_brief_template.md`. Populate what you can infer; mark unknowns.
4. **Stop for review.** Print the path.
5. On dev's "implement" → implement against the brief.

## Mid-flight escalation to `/start-feature`

If during the brief or implementation the work turns out to be larger than Step 0 caught — new public API, breaking changes, multi-team — stop and tell the user. Same pivot offer as Step 0.

## Finishing

```
/finish-task <task-identifier>
```

## Examples

```
/start-task "search returns duplicates when filter is empty"
/start-task "bump ASP.NET Core to 0.115" --identifier bump-ASP.NET Core-0-115
/start-task "rename SessionTokenManager to SessionTokenStore"
```
