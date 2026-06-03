# finish-story

Close a story locally before opening the PR. Prunes active docs, updates plan + the right truth doc, appends an archive entry.

## Usage

```
/finish-story <feature-identifier> <STORY-ID> [--source task|diff|both]
```

Required positional args. **Prompt if missing — do not scan.** `--source` default: `task` (cheapest); falls back to `diff` if task doc absent.

## Steps (in order)

1. **Read targeted inputs only** — that story's section in `stories.md`, plus `requirements.md`, `svs.md`, `plan.md`, the task doc (or `git diff --stat` + hunks per `--source`). If `<STORY-ID>` is already in `.sdd/features/completed/<feature-identifier>.md`, exit idempotent with a warning.

2. **Update the right truth doc.** Routing by file path:
   - Deploy/infra → `.sdd/docs/project_deployment_knowledge.md`. Matches: `infra/**`, `deploy/**`, `terraform/**`, `cdk/**`, `**/k8s/**`, `**/Jenkinsfile*`, `**/Dockerfile*`, `**/.github/workflows/**`.
   - Everything else → `.sdd/docs/project_knowledge.md`.
   - A single change may update both. One or two lines per durable fact.

3. **`plan.md`** — append `## Implementation notes — <STORY-ID>` (2–4 lines) only if implementation deviated from plan. Skip otherwise.

4. **`requirements.md`** — move REQs covered by this story to a `## Completed` section. Preserve IDs.

5. **`svs.md`** — mark completed slices.

6. **`stories.md`** — delete the story's section. Preserve the rest.

7. **Append to `.sdd/features/completed/<feature-identifier>.md`**:

   ```markdown
   ## <STORY-ID> — <title>

   - **Finished:** {ISO date}
   - **REQs:** {comma-separated IDs}
   - **Jira / issue:** {link if available, else "—"}

   ### Acceptance criteria
   {Full Gherkin AC, copied verbatim from stories.md — preserve Given/When/Then structure}

   ### Non-functional requirements
   {Copied verbatim from the story's NFR section — performance targets, security, observability, accessibility, reliability. Each NFR as a separate bullet. "None" if the story had no NFRs.}

   ### Files touched
   {bulleted; cap ~10 or summarise by area if more}

   ### Summary of changes
   {2–4 sentences — what changed and why. Mention scope (backend / frontend / infra / migration).}

   ### Implementation notes
   {only if implementation deviated from plan}
   ```

   **Why this shape:** the entry is the canonical audit record for a shipped story. Reviewers, post-merge auditors, and anyone writing release notes should be able to read this entry without going back to the original `stories.md` (which gets deleted on whole-feature archive). Keep the full Gherkin AC verbatim, the verbatim NFRs, the file list, and the summary — do not summarise.

   Create the archive file with a top-level heading if absent.

8. **Whole-feature archive check.** If `stories.md` is empty AND `requirements.md` has no remaining open REQs, prompt:
   > "All stories complete for `<feature-identifier>`. Archive the whole feature? This merges spec/plan summaries into the archive doc and deletes `.sdd/features/pending/<feature-identifier>/` (including `initiative_confluence.md`, `jira/`, `.tasks/`). (yes/no)"

   If yes: prepend a feature header to the archive doc (identifier, spec summary, completed REQs, plan summary, references to confluence/jira files if they exist), then delete the active folder.

9. **Stop before commit.** Print every file changed. Dev commits.

## Notes

- Idempotent on already-archived stories.
- Does not commit, push, or open a PR. After review, commit + open the PR via your normal flow.
- For bugs/small tasks: use `/finish-task <task-identifier>` instead.

## Examples

```
/finish-story saved-views STORY-001
/finish-story saved-views STORY-002 --source diff
```
