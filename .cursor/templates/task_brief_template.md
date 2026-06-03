# Task: <one-line description>

- **Identifier:** <kebab-case-identifier>
- **Type:** bug | small-feature | dep-bump | refactor | cleanup
- **Traceability:** <Jira URL or issue number or "internal — no Jira">

## Problem

<Observed behaviour vs expected behaviour. For bugs: be specific about the trigger condition. For non-bugs: what's the current state and what should change.>

## Repro

<Minimal repro steps. Include sample inputs / fixtures. For non-bugs (e.g. dep bumps, refactors): omit this section.>

## Hypothesis

<Likely root cause or design intent. Cite files from `.sdd/docs/project_knowledge.md` rather than re-deriving them. Leave "TBD — pending investigation" if not yet known.>

## Fix scope

- <file path> — <what changes here>
- <file path> — <what changes here>
- **Blast radius:** <other modules / services / consumers that could be affected; "none" if scope is local>

## Test

<Regression plan: which existing test gets extended, or new test file path. For non-bugs: how do we verify the change works.>

## Rules to honour

<Inline 1-3 short snippets from the relevant `.cursor/rules/dotnet-*.mdc` files that apply to this task — e.g. "structured logging via `ILogger<T>`", "use `CancellationToken` on async APIs". Inlining (not just naming) keeps implementation lean.>

## Notes for `/finish-task`

<Any durable project facts that emerge during implementation — new utility added, convention changed, module renamed — that should land in `.sdd/docs/project_knowledge.md`. Leave blank if there are none.>
