# AI & SDD handbook (human entry point)

This repository is set up for **human + coding-agent** work on an **Angular** frontend and **ASP.NET Core / .NET 9/10** backend, using **Specs-Driven Design (SDD)**: agree the spec and traceability first, then implement and verify.

Use this file as the **single map** to `.cursor` rules, agents, skills, and templates. Cursor loads project rules automatically; agents and templates are invoked by **@**-mentioning paths in chat (for example `@.cursor/agents/backlog_architect.md`).
For practical, scenario-based guidance on running the kit in greenfield or brownfield work, read [USAGE_GUIDE.md](USAGE_GUIDE.md).

---

## Workflow at a glance (stepped, gated)

The agent generates artifacts **one step at a time**, stopping for your review after each. This is enforced by [`.cursor/rules/sdd-workflow-orchestration.mdc`](.cursor/rules/sdd-workflow-orchestration.mdc).

| Step | What you get | What to do |
| --- | --- | --- |
| **1. Feature spec** | `feature_spec` — Problem, goals/non-goals, constraints, APIs, observability. Example: [`.cursor/examples/example_feature_spec.md`](.cursor/examples/example_feature_spec.md). | **Review and confirm** before proceeding. |
| **2. Backlog** | `requirements.md` + `svs.md` + `stories.md` — REQ IDs, sprint-sized slices, Gherkin AC, NFRs. Template: [`.cursor/templates/story_template.md`](.cursor/templates/story_template.md). | **Review and confirm** before proceeding. |
| **3. Plan** | `plan.md` — Task breakdown, dependencies, deployment order, risk register. | **Review and confirm** before proceeding. |
| **4. Publish** *(optional)* | `initiative_confluence.md` and/or Jira YAML — only when you ask. | **Review** before MCP publish. |
| **5. Per-story implement → finish** | `/start-story <feature> <STORY-ID>` (task doc) → implement → `/finish-story <feature> <STORY-ID>` (prune + archive + truth-doc update). | Repeat per story. |

All output goes to `.sdd/features/pending/{feature-identifier}/` in your workspace (legacy `output/{project-name}/` still recognised). See [`.cursor/rules/output-config.mdc`](.cursor/rules/output-config.mdc).

**Project truth docs:** `/council-v2 --refresh` bootstraps `.sdd/docs/project_knowledge.md` (architecture/code) and `.sdd/docs/project_deployment_knowledge.md` (infra/deploy). Downstream agents read these first instead of re-exploring the codebase. Run once per project, then let `/finish-story` keep them current. `/council-v2` is the new persistent-knowledge command; the original `/council` (broad parallel exploration) stays unchanged.

**Skip-ahead:** If you want multiple steps at once, say so explicitly (e.g. "generate everything" or "skip to plan"). Otherwise the agent will stop after each step.

**Brownfield note:** If you are working in an existing repo, run `/council-v2 --refresh` (or `@.cursor/commands/council.md` for one-shot exploration) before Step 1 to populate the truth docs, then attach the real files you expect to touch from Step 1 onward.

---

## Standalone agent usage (outside the workflow)

You can invoke any agent **independently at any step** without advancing the workflow. This is useful for feasibility checks, risk analysis, or challenging assumptions before confirming a step.

| Agent | Invoke with | Use case |
| --- | --- | --- |
| [`technical_analyst.md`](.cursor/agents/technical_analyst.md) | `@.cursor/agents/technical_analyst.md` | Assess feasibility, complexity, and risks — at any step |
| [`technical-devils-advocate.md`](.cursor/agents/technical-devils-advocate.md) | `@.cursor/agents/technical-devils-advocate.md` | Challenge assumptions, surface edge cases — at any step |
| [`doc_review_assistant.md`](.cursor/agents/doc_review_assistant.md) | `@.cursor/agents/doc_review_assistant.md` | Verify PRs against AC, generate release notes — after implementation |
| [`backlog_architect.md`](.cursor/agents/backlog_architect.md) | `@.cursor/agents/backlog_architect.md` | Generate stories directly if you already have a confirmed spec |

**If you don't want the stepped workflow at all**, simply `@`-mention agents directly. The workflow gates only activate during SDD artifact generation — not when you invoke a specific agent.

---

## Where things live

| What | Location |
| --- | --- |
| **Rules** (always-on + file patterns) | [`.cursor/rules/`](.cursor/rules/) |
| **Agents** (long-form roles: backlog, analyst, docs, Confluence) | [`.cursor/agents/`](.cursor/agents/) |
| **Skills** (reusable workflows: Jira hierarchy, code cleanup) | [`.cursor/skills/`](.cursor/skills/) |
| **Slash-style commands** (e.g. broad codebase council) | [`.cursor/commands/`](.cursor/commands/) |
| **Story / SVS / task / PR templates** | [`.cursor/templates/`](.cursor/templates/) |
| **Example feature spec** | [`.cursor/examples/example_feature_spec.md`](.cursor/examples/example_feature_spec.md) |
| **Generated artefacts** | `.sdd/features/pending/<feature-identifier>/` (in-flight), `.sdd/features/completed/<feature-identifier>.md` + `.sdd/tasks/completed.md` (history). Legacy `output/{project-name}/` still recognised. See [`output-config.mdc`](.cursor/rules/output-config.mdc). |
| **Project truth docs** | `.sdd/docs/project_knowledge.md`, `.sdd/docs/project_deployment_knowledge.md` (maintained by `/council-v2` + `/finish-story`) |
| **Practical usage guide** | [`USAGE_GUIDE.md`](USAGE_GUIDE.md) |
| **SDLC AI usage scenarios** (prompt patterns: understand / decide / document + more) | [`.cursor/examples/sdlc_ai_usage_scenarios.md`](.cursor/examples/sdlc_ai_usage_scenarios.md) |

---

## Rules (coding agent + humans)

- **Always applied:**
  - [`.cursor/rules/security.mdc`](.cursor/rules/security.mdc) — Mandatory OWASP-based security guardrails.
- **Attached when editing SDD artefacts** (`.sdd/**`, `output/**`, `feature_spec`, `plan.md`, `stories.md`, etc.):
  - [`.cursor/rules/specs-driven-design.mdc`](.cursor/rules/specs-driven-design.mdc) — SDD guardrails and traceability.
  - [`.cursor/rules/sdd-workflow-orchestration.mdc`](.cursor/rules/sdd-workflow-orchestration.mdc) — Stepped workflow with review gates.
  - [`.cursor/rules/output-config.mdc`](.cursor/rules/output-config.mdc) — Output directory configuration.
- **Angular:** [`.cursor/rules/angular-patterns.mdc`](.cursor/rules/angular-patterns.mdc), [`.cursor/rules/angular-standards.mdc`](.cursor/rules/angular-standards.mdc), [`.cursor/rules/angular-unit-tests.mdc`](.cursor/rules/angular-unit-tests.mdc).
- **ASP.NET Core / .NET (attached on `.cs` source files):** API, app layout, standards, and data access — `dotnet-api`, `dotnet-backend-patterns`, `dotnet-standards`, `dotnet-data-access` under [`.cursor/rules/`](.cursor/rules/). `@`-mention these explicitly when you want the agent to honour them while writing `plan.md` or task docs.
- **Cross-cutting:** [`.cursor/rules/web-security.mdc`](.cursor/rules/web-security.mdc), [`.cursor/rules/documentation.mdc`](.cursor/rules/documentation.mdc).

Each `.mdc` file lists **globs**. SDD rules used to be always-on; they are now glob-scoped to SDD doc paths to keep day-to-day code-edit turns lean. Discoverability stays via this file (AGENTS.md) which lists the commands and rule purposes.

---

## Agents (when to use which)

| Agent | Role | Typical step | Standalone? |
| --- | --- | --- | --- |
| [`backlog_architect.md`](.cursor/agents/backlog_architect.md) | SVS, user stories, Gherkin, tasks — backlog shape for SDD. | Step 2 | Yes |
| [`technical_analyst.md`](.cursor/agents/technical_analyst.md) | Feasibility, risk, impact, estimates — before major build. | Any | Yes |
| [`qa_test_design_agent.md`](.cursor/agents/qa_test_design_agent.md) | **After AC stable:** formal **`TC-…`** mapped to each AC; data/env, negatives, DoD(test), `QA:` stubs — QA execution view. |
| [`developer_testing_agent.md`](.cursor/agents/developer_testing_agent.md) | **Devs while coding:** unit tests, use cases beyond AC, `UT-…`, mocks, DoD(dev test); pairs with QA agent above. |
| [`epic_initiative_confluence.md`](.cursor/agents/epic_initiative_confluence.md) | Initiative doc → Confluence (with your page id / MCP). | Step 4 | Yes |
| [`doc_review_assistant.md`](.cursor/agents/doc_review_assistant.md) | PR ↔ AC (Acceptance Criteria) verification, release notes, demos — after implementation. | Post-Step 4 | Yes |
| [`technical-devils-advocate.md`](.cursor/agents/technical-devils-advocate.md) | Challenge plans and specs — risks, edge cases, alternatives. | Any | Yes |

---

## Skills (optional automation)

- **Jira hierarchy** — [`.cursor/skills/jira-epic-story-task-automation/SKILL.md`](.cursor/skills/jira-epic-story-task-automation/SKILL.md) — Epic → Story → Task order and YAML-friendly structure; align summaries with `REQ-…` when using SDD.
- **Code cleanup** — [`.cursor/skills/remove-ai-code-slop/SKILL.md`](.cursor/skills/remove-ai-code-slop/SKILL.md) — Naming, noise, style for TypeScript and C#.
- **PR Readiness Check** — [`.cursor/skills/pr-readiness-check/SKILL.md`](.cursor/skills/pr-readiness-check/SKILL.md) — First-pass sanity check before human review: SDD traceability (`REQ-…` IDs, story scope), code quality, security, Snyk/dependency scanning, test coverage, breaking changes, AWS tagging/encryption, third-party library pinning, **WatchGuard Open Source Use (WGSEC) policy** when dependencies change, **performance and scalability** for capacity-affecting changes, and WatchGuard shared-library usage (wg_dotnet_utils for ECS/Container; wgc-dotnet-lambda-layer for Lambda). Run on your own PR before requesting review. Pairs with `doc_review_assistant.md` for the full post-implementation gate.

---

## Commands

All commands take **required positional args** — if you forget them, the command will prompt; it will not scan to "find" the right item.

### Project knowledge

Two complementary commands:

- **`/council`** — original behaviour, **unchanged**. One-shot broad codebase exploration via parallel sub-agents. Best for unfamiliar code, debugging, "how does X work today?". Stack-aware (Angular + ASP.NET Core + SDD).
- **`/council-v2`** — new persistent-knowledge command. Maintains two living truth docs the rest of the workflow reads:
  - `/council-v2` — read `.sdd/docs/project_knowledge.md` and `.sdd/docs/project_deployment_knowledge.md` and answer from them. Does NOT re-explore.
  - `/council-v2 "<question>"` — answer from docs; append durable findings.
  - `/council-v2 --refresh` — fully regenerate both truth docs.
  - `/council-v2 --refresh code` / `--refresh deploy` — regenerate one doc only.

### Feature workflow
- **`/start-feature "<name>" [--non-interactive]`** — kick off a new feature; runs the stepped SDD workflow.
- **`/start-story <feature-identifier> <STORY-ID> [--mode task|direct]`** — generate a per-dev task doc (`task` mode, default) or implement straight from `plan.md` (`direct` mode).
- **`/finish-story <feature-identifier> <STORY-ID> [--source task|diff|both]`** — prune the story from `stories.md`, update `requirements.md`/`svs.md`/`plan.md`, update the relevant truth doc, append to `.sdd/features/completed/<feature-identifier>.md`. Auto-archives the whole feature when the last story closes.

### Bug fix / small task workflow (lightweight; no SDD ceremony)
- **`/start-task "<description>" [--identifier <task-identifier>]`** — generate a one-file brief at `.sdd/tasks/pending/<task-identifier>.md`.
- **`/finish-task <task-identifier> [--source task|diff|both]`** — archive to `.sdd/tasks/completed.md` (single shared doc).

Command definitions live in [`.cursor/commands/`](.cursor/commands/).

---

## Conventions worth repeating

- **Traceability:** Put `REQ-…` (and story / Jira key when you use it) in specs, stories, and PR descriptions as your process requires.
- **Contracts:** Keep HTTP behavior, DTO record types, and OpenAPI (Swashbuckle/NSwag) or generated TypeScript client types aligned when APIs change.
- **Scope:** Agents are instructed not to invent product scope; resolve ambiguity with the spec owner or explicit user direction.
- **Brownfield:** Run `/council-v2 --refresh` first to populate the truth docs, then attach real files from Step 1 onward and constrain implementation prompts to named files where practical. Use the original `/council "<query>"` for deep one-shot exploration when the truth docs don't cover what you need.
- **Output:** All generated artifacts go to `.sdd/` (or legacy `output/{project-name}/`) — never to arbitrary locations outside the workspace.
- **Required args:** Workflow commands (`/start-story`, `/finish-story`, `/start-task`, `/finish-task`) take required positional args. If you forget, the command will prompt — it never scans the project to "find" the right item.
- **Completed isolation:** `.sdd/features/completed/` and `.sdd/tasks/completed.md` should be in `.cursorignore` (install script adds them). Completed is human-only reference; agents should not read from it during planning or implementation.

If you add new rules or agents, **link them from this file** so the entry point stays accurate.
