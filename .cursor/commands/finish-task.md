# finish-task

Archive a completed bug fix or small task. Same archive/truth-doc behaviour as `/finish-story`, just routed to `.sdd/tasks/completed.md`.

## Usage

```
/finish-task <task-identifier> [--source task|diff|both]
```

Required arg. Prompt if missing. `--source` default: `task`; falls back to `diff` if the brief is absent.

## Steps (in order)

### Step 1 — Read inputs (explicit attachment required)

**Always attach the task brief at the start:** `@.sdd/tasks/pending/<task-identifier>.md`. Do NOT skip the brief and jump straight to git diff — the brief carries the original problem statement, hypothesis, and intended scope, all of which inform the archive entry and truth-doc updates.

Read **per `--source`** (default: `task`):

| `--source` | Reads | Use when |
|---|---|---|
| `task` (default) | The attached brief at `.sdd/tasks/pending/<task-identifier>.md`. **This is the default; honour it.** | Default. The brief was kept current during implementation. |
| `diff` | `git diff --stat <base>...HEAD` + hunks of files changed since base. | The brief is missing or stale (e.g. fix turned out different from hypothesis). |
| `both` | Brief **and** `git diff`. | Maximum fidelity — rare. |

If `--source task` is set but the brief file is missing, fall back to `diff` automatically and **warn the user**: *"Task brief at `.sdd/tasks/pending/<task-identifier>.md` is missing — using git diff instead."* Do NOT silently skip the brief.

If `<task-identifier>` is already present in `.sdd/tasks/completed.md`, exit idempotent with a warning — no other changes.

### Step 2 — Update the right truth doc

**Check both truth docs and add any durable facts** that emerged from this task. Routing by file path of what was changed:

- Deploy/infra files → `.sdd/docs/project_deployment_knowledge.md`. Matches: `infra/**`, `deploy/**`, `terraform/**`, `cdk/**`, `**/k8s/**`, `**/Jenkinsfile*`, `**/Dockerfile*`, `**/.github/workflows/**`.
- Everything else → `.sdd/docs/project_knowledge.md`.
- A single change may legitimately update both.

What counts as a durable fact (add **one or two lines** for each):

- A new module, utility, or helper added that other features will consume.
- A renamed module, class, or function.
- A new convention (e.g. "all caller IDs now passed via `X-Caller-ID` header").
- A new external integration, env var, or secret path.
- A change to existing cross-cutting behaviour (auth, logging, error handling, masking, RBAC).
- A new constraint or invariant worth surfacing (e.g. "queue depth never exceeds 1024 — enforced in `background worker / hosted service`").

If genuinely nothing durable changed (common for tiny one-line bug fixes), say so **explicitly in the chat output**: *"No durable project facts to record — truth docs unchanged."* Do not silently skip — make it visible.

### Step 3 — Prepend to `.sdd/tasks/completed.md`

Newest on top:

```markdown
## <task-identifier> — <description>

- **Finished:** {ISO date}
- **Type:** {bug | small-feature | dep-bump | refactor | cleanup}
- **Traceability:** {Jira link / issue / "internal"}

### Files touched
{bulleted; cap ~10}

### Summary
{1–3 sentences — what was wrong, what fixed it. Mention scope (backend / frontend / infra).}

### Test scenarios (from brief)
{Copied verbatim from the brief's `## Test` section — every scenario, including the original failing repro. Each as a separate bullet. "None" only if the brief genuinely had no Test section.}

### Blast radius
{Copied verbatim from the brief's `## Fix scope > Blast radius` line — modules/services/consumers that could be affected. "None" if scope was local.}
```

**Why this shape:** the entry is the canonical audit record for a shipped task. Reviewers and anyone tracking what went out should be able to read this entry without going back to the original brief (which gets deleted in Step 4). Keep the Files touched list, the Summary, the verbatim Test scenarios from the brief, and the Blast radius — do not drop or summarise them.

Create the file with `# Archived tasks and bug fixes` heading if absent.

### Step 4 — Delete `.sdd/tasks/pending/<task-identifier>.md`

After the archive entry is written.

### Step 5 — Stop before commit

Print every file changed in this run. Dev reviews and commits.

## Notes

- Idempotent — re-running on an archived task is a no-op with a warning.
- Does not commit, push, or open a PR. After review, commit + open the PR via your normal flow.

## Examples

```
/finish-task search-returns-duplicates
/finish-task bump-ASP.NET Core-0-115 --source both
/finish-task tighten-rate-limit --source diff   # when brief is stale
```
