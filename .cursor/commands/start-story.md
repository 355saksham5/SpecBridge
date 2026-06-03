# start-story

Pick up a specific story. Generates a focused per-dev task doc for implementation.

## Usage

```
/start-story <feature-identifier> <STORY-ID> [--mode task|direct]
```

Required positional args. **Prompt if missing — do not scan.**

## Reads (tight, no broad scanning)

- That story's section in `.sdd/features/pending/<feature-identifier>/stories.md`.
- `plan.md` for the same feature.
- `.sdd/docs/project_knowledge.md` always; `.sdd/docs/project_deployment_knowledge.md` only if the story touches deploy/infra.
- Coding rules — `@`-mention the relevant `.cursor/rules/dotnet-*.mdc` and `angular-patterns.mdc` files explicitly when generating the task doc so the snippets get inlined.

**Do not read** `.sdd/features/completed/**` or `.sdd/tasks/completed.md`.

## Mode: `task` (default)

Generate `.sdd/features/pending/<feature-identifier>/.tasks/<STORY-ID>.task.md`:

```markdown
# Task: <STORY-ID> — <story title>
> Gitignored per-dev scratch.

## Story summary
{1-paragraph restatement + AC}

## Files to modify
- {path} — {what changes}

## Tests to add or update
- {test path} — {what to verify}

## Rules to honour (inlined from .cursor/rules/)
{Inline the actual snippets — not just rule names. Implementation should run reading only this doc.}

## Assumptions / unknowns

## Suggested order
```

Create `.tasks/` if missing. If `.sdd/features/pending/*/.tasks/` is missing from `.gitignore`, offer to append (don't silently modify).

Stop for review. On dev's "implement" → follow the task doc.

## Mode: `direct`

Skip the task doc. Implement directly against `plan.md`. Use `--source diff` for the matching `/finish-story` later.

## Not in scope

Does not write to `stories.md`, `plan.md`, requirements, svs, truth docs. Does not commit. Does not advance any workflow gate.

## Examples

```
/start-story saved-views STORY-001
/start-story saved-views STORY-003 --mode direct
```
