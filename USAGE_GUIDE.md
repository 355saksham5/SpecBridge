# C# / .NET SDD Starter Kit Practical Usage Guide

> Companion to [`README.md`](./README.md) and [`AGENTS.md`](./AGENTS.md).
> Use this guide for scenario-based, operational advice on applying the kit in real work.

This guide does not replace the canonical workflow, file reference, or rule definitions in `README.md` and `AGENTS.md`. It shows how to apply them in practice, especially the differences between greenfield and brownfield work.

A practical, no-fluff guide to running the kit end-to-end — once for a brand-new service, and once for changes to code that already exists. Both flows use the same gated workflow from the kit, but what you attach, what you push back on, and where you spend your time are very different.

Read the short "Before you start" section first. Then jump to Section 1 (Greenfield) or Section 2 (Brownfield) depending on what you're doing.

---

## Before you start (applies to both flows)

### One-time setup

1. **Install the kit into the target project** (recommended: one-shot script):

   ```bash
   # from inside the target project directory
   curl -sSL https://github.infra.int.daas-watchguard.com/Platform/wgc-ai-common-guidelines/raw/dev/install_wgc_ai_sdd_kit.py -o install_wgc_ai_sdd_kit.py
   python install_wgc_ai_sdd_kit.py
   ```

   On Windows: `install_wgc_ai_sdd_kit.cmd` is the wrapper. Pin a specific version with `--ref csharp-sdd/v1.0.0`. Re-run any time to update.

   Alternate methods (zip download, sparse-checkout) are documented in [README.md → Installation](./README.md#installation).

2. Open the project in Cursor — `File -> Open Folder`. The `.cursor/` directory must sit at the project root or rules and agents won't load.
3. **Bootstrap project truth docs** with `/council-v2 --refresh`. This creates `.sdd/docs/project_knowledge.md` and `.sdd/docs/project_deployment_knowledge.md` — the living docs every later command reads instead of re-exploring the codebase.
4. Open an agent chat window in Cursor.
5. (Optional) Connect the Atlassian MCP server in Cursor settings if you want the agent to create Jira tickets or publish Confluence pages directly.

### Mental model

The kit is a **prompt library with forced stop points**, not a framework. The "agents" are system prompts, the "rules" are always-on instructions, and the orchestration is a Cursor rule that makes the coding agent produce one artifact layer at a time and wait for your review before proceeding. The value is not magic — it's the discipline of not letting the AI run ahead into code before scope is agreed.

### The steps (at a glance)

| Step | Artifact | Agent / Command | Output file |
|------|----------|-----------------|-------------|
| 0 | Bootstrap project knowledge | `/council-v2 --refresh` | `.sdd/docs/project_knowledge.md`, `.sdd/docs/project_deployment_knowledge.md` |
| 1 | Feature description | `/start-feature "<name>"` | — |
| 2 | Formatted feature spec | Orchestration rule | `.sdd/features/pending/<feature-identifier>/feature_spec.md` |
| 3 | Backlog (SVS + stories) | `@backlog_architect.md` | `requirements.md`, `svs.md`, `stories.md` |
| 3.5 | Challenge the backlog | `@technical-devils-advocate.md` | (chat output) |
| 4 | Confluence doc (optional) | `@epic_initiative_confluence.md` | (chat or published page) |
| 5 | Feasibility assessment | `@technical_analyst.md` | (chat output) |
| 6 | Jira tickets + plan | `@jira-epic-story-task-automation/SKILL.md` | `plan.md` + Jira hierarchy |
| 7 | Pick up a story | `/start-story <feature-identifier> <STORY-ID>` | `.sdd/features/pending/<feature-identifier>/.tasks/<STORY-ID>.task.md` (gitignored) |
| 8 | Implement | (coding agent, following the task doc) | Code + tests |
| 9 | Close the story | `/finish-story <feature-identifier> <STORY-ID>` | Prunes story, updates plan + truth doc, appends to `.sdd/features/completed/<feature-identifier>.md` |

Every REQ-ID assigned in Step 2 must thread through every downstream artifact. This is the thread that makes the whole thing auditable. If you skip the IDs, skip the kit — you're getting the overhead without the payoff.

### Lightweight flow for bugs / small tasks (no SDD ceremony)

For bug fixes, small features, dependency bumps, or refactors that don't warrant the full feature flow:

| Step | Command / agent | Output |
|------|-----------------|--------|
| 1 | `/start-task "<description>"` | `.sdd/tasks/pending/<task-identifier>.md` (brief from template) |
| 2 | Implement (coding agent against the brief) | Code + tests |
| 3 | `/finish-task <task-identifier>` | Archive entry in `.sdd/tasks/completed.md` |

If a task turns out to be bigger than expected mid-flow (introduces new contracts, breaking changes, multi-team coordination), stop and escalate to `/start-feature`.

### When to use the kit (and when not to)

Use it for: mid-to-large features (a week+ of work), cross-team initiatives, unfamiliar territory, regulated domains, anything where getting scope wrong is expensive to unwind.

Skip it for: one-line fixes, small bug patches, research spikes, or features so obvious they don't need a spec. Ceremony that nobody will reread is just cost.

---

## 1. Greenfield workflow — building a new service from scratch

**Scenario used throughout this section:** building a standalone internal "AI Agent Portal" — an Angular + ASP.NET Core + MySQL web app that acts as a company-wide repository of AI agents, with SSO login, public/private agent models, and a metrics dashboard. No existing code.

### Step 1 — Describe the feature in plain English

Open the Cursor chat and just type what you want to build. No `@` mentions yet. Be verbose — the more context you give, the more accurate the spec.

Example prompt:

> I want to build an Angular/ASP.NET Core web portal that acts as a repository for AI agents built by my company. Requirements:
>
> - SSO-integrated login (Okta, but design for pluggable providers)
> - Agents can be public (visible org-wide) or private (visible only to the owning team)
> - Agents are categorized by org function: HR, Finance, Engineering, Legal, Sales, Other
> - Each agent has metadata: name, description, owner, category, visibility, version, tags, link to source repo
> - User profiles with preferences (default category filter, preferred theme)
> - Dashboard showing: most popular agents (by views), most downloaded, most liked
> - Tech stack: Angular 16, ASP.NET Core + EF Core + EF Core migrations, MySQL, deployed on AWS
>
> Help me think through the metadata model and produce a feature spec.

The orchestration rule picks this up, produces `.sdd/features/pending/ai-agent-portal/feature_spec.md`, announces the path, and **stops**. It will not move on until you approve.

### Step 2 — Review and lock the spec (this is the gate that matters most)

Read the generated spec critically. It will have sections for Problem, Goals, Non-Goals, Constraints, User Acceptance, APIs, Observability. It will also have things you didn't specify — these are AI guesses dressed as requirements. Your job is to confirm, correct, or delete each one.

Typical corrections on a spec like this:

- "Goals" includes *"agent versioning and rollback"* — but you wanted v1 to be read-only. Move to Non-Goals.
- "Observability" proposes Datadog — but you use CloudWatch. Fix it.
- "APIs" invents a `PATCH /agents/{id}/like` endpoint — you wanted `POST /agents/{id}/reactions`. Fix it.
- Missing: what happens when an agent owner leaves the company? Add a rule (ownership transfers to team lead) or add to Non-Goals.

Tell the agent in chat: *"Move versioning to Non-Goals. Use CloudWatch not Datadog. Rename the like endpoint. Add ownership transfer: on owner offboarding, ownership transfers to the team lead email from HRIS."*

Agent updates the file. Re-read. Iterate until the spec actually reflects what you want. Then say **"approved, proceed"**.

**Why this gate matters more than the others:** every downstream artifact — the stories, the tasks, the code — is derived from this document. A misunderstood requirement caught here costs five minutes to fix. The same misunderstanding caught at the PR stage costs a week. Do not cut corners here.

Once approved, treat the spec as the contract. If scope needs to change later, update the spec first, then regenerate what's downstream.

### Step 3 — Generate the backlog

Invoke the Backlog Architect with the spec and the story template attached:

> `@.sdd/features/pending/ai-agent-portal/feature_spec.md` `@.cursor/templates/story_template.md` `@.cursor/agents/backlog_architect.md` Generate the SVS, stories, and task breakdowns. Propose stable REQ-IDs.

You get back three files in `.sdd/features/pending/ai-agent-portal/`:

- `requirements.md` — numbered REQ-IDs like `REQ-PORTAL-001`, `REQ-PORTAL-002`, each tied to a goal or constraint from the spec.
- `svs.md` — the Smallest Valuable Slice. For this feature, probably *"SSO login + agent metadata model + public agent list view."* Private agents, the dashboard, and user preferences get pushed to later slices.
- `stories.md` — individual stories, each with REQ-ID, INVEST check, Gherkin AC, NFRs, dependencies, task breakdown.

Expect 4–7 stories in the first SVS. A typical set for the Agent Portal:

1. SSO login with Okta (REQ-PORTAL-001)
2. Agent metadata model + EF Core migrations migration (REQ-PORTAL-002)
3. `GET /api/agents` list endpoint with filters (REQ-PORTAL-003)
4. Angular agent list page with category filter (REQ-PORTAL-004)
5. User profile skeleton (REQ-PORTAL-005)

### Step 3.5 — Run Devil's Advocate

Do not skip this. It's the single highest-leverage step in the kit.

> `@.cursor/agents/technical-devils-advocate.md` Analyze `@.sdd/features/pending/ai-agent-portal/stories.md` and surface risks, edge cases, assumptions, and anything missing.

Typical things it will raise on this feature:

- What happens if Okta is down? Is there a break-glass admin login?
- Agent names — unique per org or per team? If unique per org, you need a constraint and a clear error.
- How are agents soft-deleted vs hard-deleted? Who sees deleted agents?
- Who can edit agent metadata — only the owner, or any team member?
- Metrics like "most popular" — what's the time window? Ever, last 30 days, last 7 days?
- Seeding: how does the first agent get added? Is there an admin UI or just a migration?

Some you'll accept ("yes, add a story for soft delete"). Some you'll push back into the spec as Non-Goals. Some you'll tag as Open Questions in the story. Do not silently ignore them.

### Step 4 — Confluence (optional, and only if stakeholders need it)

Only do this after the backlog is stable and reviewed. Confluence is stakeholder communication, not a replacement for the spec.

> `@.cursor/agents/epic_initiative_confluence.md` Convert this backlog `@.sdd/features/pending/ai-agent-portal/stories.md` into my Confluence space at `https://myorg.atlassian.net/wiki/spaces/ENG`.

If MCP is connected, the agent publishes directly. Otherwise it gives you Markdown to paste.

### Step 5 — Feasibility assessment

> `@.cursor/agents/technical_analyst.md` Analyze `@.sdd/features/pending/ai-agent-portal/stories.md` for feasibility, risks, assumptions, prerequisites, and estimate guidance.

For a greenfield project, this is where "invisible" prerequisites surface:

- Okta tenant and app registration must exist before dev starts.
- AWS accounts, IAM roles, RDS instance provisioning need to be kicked off now, not at deploy time.
- Which MySQL version? Aurora or plain RDS?
- Deployment target — ECS, EKS, Lambda?
- CI/CD pipeline needs to exist before the first PR.

You get back a recommendation: *Proceed / Proceed with conditions / Spike first / Defer.* For a new service, "Proceed with conditions" is the usual answer, with a list of things that need to happen in parallel with Sprint 1.

### Step 6 — Jira tickets and plan.md

Always create in the order: **Epic -> Stories -> Tasks/Sub-tasks.**

> Convert `@.sdd/features/pending/ai-agent-portal/stories.md` into Jira at `https://myorg.atlassian.net/jira/software/projects/PORTAL`. Use the Jira skill: `@.cursor/skills/jira-epic-story-task-automation/SKILL.md`. Every ticket must reference its REQ-ID in the description. Add label `SDD`.

Then:

> Generate `plan.md` for `@.sdd/features/pending/ai-agent-portal/stories.md`. Each step tagged with its REQ-ID.

`plan.md` is the file the coding agent will follow during implementation. For a greenfield service, the first few steps typically are:

1. Scaffold the ASP.NET Core project (directory structure, `.csproj / solution structure`, linting, pre-commit).
2. Scaffold the Angular project (`ng new`, lint config, folder structure).
3. Set up EF Core migrations and create the initial migration.
4. Add the User and Agent models.
5. Implement the SSO login flow (backend + frontend).
6. Implement `GET /api/agents` + the list page.

### Step 7 — Build

With spec, backlog, and plan in place, start the code generation:

> I'm ready to implement. This is greenfield — no code exists. Tech stack is .NET 9, ASP.NET Core (Minimal API), EF Core, SQL Server, Angular 16. Follow `@.sdd/features/pending/ai-agent-portal/plan.md` step by step. Start with Step 1 (scaffold ASP.NET Core solution). Reference REQ-IDs in commits.

Greenfield build practices:

- Let the coding agent set up the project structure in one go — it's low-risk when nothing exists.
- Ask for tests alongside each feature, not at the end. Agents generate better tests when they write them next to the code.
- After each story is complete, run the AC check: `@.cursor/agents/doc_review_assistant.md` Verify the code in this PR against the AC for Story N.
- (Optional) Run `@.cursor/skills/remove-ai-code-slop/SKILL.md` after generation to clean up placeholder names, dead code, and redundant comments before PR review.

### Greenfield time budget (rough)

| Phase | Time |
|-------|------|
| Steps 1–2 (spec + approval) | 45–90 min |
| Step 3 (backlog) | 30 min |
| Step 3.5 (Devil's Advocate) | 30–60 min |
| Step 5 (feasibility) | 20–30 min |
| Step 6 (Jira + plan) | 20–30 min |
| **Total planning** | **2.5–4 hours** |
| Step 7 (build, first SVS) | Days to weeks, depending on feature size |

The planning investment feels heavy, but it's front-loaded. Once the SVS is done and the skeleton of the service exists, subsequent slices reuse the same spec and run faster.

---

## 2. Brownfield workflow — adding features to existing code

**Scenario used throughout this section:** adding TOTP-based two-factor authentication to an existing auth service in an Angular + ASP.NET Core portal that already has SSO and local password login.

The same seven-step skeleton still applies, but three things change fundamentally:

1. You must **explore the existing code first** — before the spec, not during or after.
2. Every prompt from Step 1 onwards must **attach the real files** the agent will touch. Otherwise it will invent a parallel codebase that looks plausible and doesn't match reality.
3. The coding agent in Step 7 must be **constrained to named files** per story. Brownfield scope creep happens in the diff, not in the plan.

### Step 0 — Explore the existing code (brownfield pre-step)

This is a recommended pre-step before the official Step 1 in the kit. It does not replace the canonical workflow; it grounds it.

Before anything else, use the `/council` command to map the area of the codebase you're about to touch.

> `@.cursor/commands/council.md` Explore the existing authentication in this codebase. I need to understand:
>
> - Where login is handled (routes, controllers)
> - How sessions / tokens are issued and validated
> - The User model and what fields it has
> - What middleware exists for protected routes
> - How the Angular frontend handles auth state (guard, interceptor, service)
> - Any existing integration tests that cover login
>
> I'm planning to add TOTP-based 2FA.

You get back a map — something like:

- Login route: `Endpoints/AuthEndpoints.cs::login()`
- Authentication logic: `Services/AuthService.cs::AuthService.authenticate()`
- Token issuance: `Infrastructure/JwtTokenService.cs::create_access_token()`
- User model: `Entities/User.cs` — fields `id`, `email`, `password_hash`, `sso_provider`, `created_at`
- Frontend guard: `src/app/core/guards/auth.guard.ts`
- Frontend interceptor: `src/app/core/interceptors/auth.interceptor.ts`
- Frontend auth service: `src/app/core/services/auth.service.ts`
- Integration tests: `tests/Integration/AuthTests.cs` (12 tests covering login, token refresh, logout)

**This map is the grounding for every subsequent prompt.** Without it, the agent will fabricate structures that don't exist.

### Step 1 — Write the spec anchored to real files

Now write the feature spec with the existing files attached:

> I want to add TOTP-based 2FA to our existing auth service.
>
> Context (existing code): `@Endpoints/AuthEndpoints.cs` `@Services/AuthService.cs` `@Entities/User.cs` `@src/app/core/services/auth.service.ts` `@src/app/core/guards/auth.guard.ts`
>
> Requirements:
>
> - Opt-in per user (not enforced org-wide in v1)
> - TOTP only — no SMS, no push
> - Users enroll from their profile page by scanning a QR code
> - On login, after password validation, prompt for the 6-digit code
> - 10 backup codes generated at enrollment time, each single-use
> - Admins can reset a user's 2FA (removes enrollment, invalidates backup codes)
> - Feature flag: `feature.TwoFactorAuth_auth`
> - Backward compatible: users who haven't enrolled must continue to log in unchanged
>
> Produce a feature spec following `@.cursor/examples/example_feature_spec.md`. Be explicit about:
>
> - What existing files/models change vs what's new
> - Migration strategy for the existing `users` table (it has live data)
> - Backward compatibility for non-enrolled users
> - Impact on existing integration tests

The spec you get back will now have sections like:

> **Changes to existing code:**
>
> - `Entities/User.cs` — add columns: `totp_secret` (nullable), `totp_enabled` (bool, default false), `backup_codes_hash` (JSON, nullable)
> - `Services/AuthService.cs::authenticate()` — on success, check `totp_enabled`. If true, return `{requires_2fa: true, partial_token: ...}` instead of a full JWT.
> - `Endpoints/AuthEndpoints.cs` — modify `/login` response shape. Add new endpoint `POST /login/verify-2fa`.
>
> **New code:**
>
> - `Endpoints/TotpEndpoints.cs` — enrollment endpoints
> - `Services/TotpService.cs` — TOTP generation/verification
> - EF Core migrations migration adding columns (all nullable to avoid breaking existing users)

That's the brownfield shape — a clear boundary between "modified" and "new."

### Step 2 — Approve the spec, with extra attention to backward compatibility

Every brownfield spec review has one extra question beyond the usual: **does this spec respect the existing architecture, or is it fighting it?**

Common issues to push back on:

- Agent proposes a new `AuthenticationOrchestrator` class. You don't need that — `AuthService` is fine, just extend it.
- Agent proposes a new `TwoFactorAuth` table. Overkill for a 1:1 relationship — add columns to `users`.
- Agent proposes making `password_hash` nullable to support "passwordless 2FA." Out of scope.
- Agent proposes changing the login response shape unconditionally. This breaks mobile clients on old versions — make the new shape conditional on a request header.

Iterate until the spec is **additive and surgical**. Then approve.

### Step 3 — Backlog with existing files attached

Attach the real files, not just the spec and template:

> `@.sdd/features/pending/2fa/feature_spec.md` `@.cursor/templates/story_template.md` `@Endpoints/AuthEndpoints.cs` `@Services/AuthService.cs` `@Entities/User.cs` `@.cursor/agents/backlog_architect.md`
>
> Generate the SVS, stories, and task breakdown. Each story must explicitly list:
>
> - Files CREATED
> - Files MODIFIED
> - Files only READ (for context)
>
> Every task must reference an actual file path.

Stories now look like:

- **Story 1 — TOTP enrollment endpoint** (REQ-2FA-001, 002)
  - Created: `Endpoints/TotpEndpoints.cs`, `Services/TotpService.cs`, `EF Core migrations/versions/xxxx_add_totp_columns.py`
  - Modified: `Entities/User.cs` (add 3 columns), `Program.cs` (mount new router)
- **Story 2 — Modify login to check 2FA** (REQ-2FA-003, 004)
  - Modified: `Services/AuthService.cs::authenticate()`, `Endpoints/AuthEndpoints.cs::login()`
  - New endpoint: `POST /api/auth/login/verify-2fa`
- **Story 3 — Angular enrollment UI** (REQ-2FA-005)
  - Created: `src/app/profile/two-factor/*`
  - Modified: `src/app/profile/profile.component.ts` (add entry point)
- **Story 4 — Angular login flow update** (REQ-2FA-006)
  - Modified: `src/app/auth/login.component.ts`, `src/app/core/services/auth.service.ts`
- **Story 5 — Backup codes + admin reset** (REQ-2FA-007, 008)
- **Story 6 — Update existing integration tests + add new ones** (REQ-2FA-009)

Note Story 6 — **treating "update existing tests" as its own story is a brownfield-specific habit.** It gets dropped otherwise and shows up as broken CI on PR day.

### Step 3.5 — Devil's Advocate, focused on integration risk

Phrase the prompt to pull on integration seams, not just feature seams:

> `@.cursor/agents/technical-devils-advocate.md` Analyze `@.sdd/features/pending/2fa/stories.md`. Pay particular attention to:
>
> - Backward compatibility: what breaks for users who haven't enrolled?
> - Existing clients that call `/login`: what assumptions do they make about the response shape?
> - Migration safety: is the EF Core migrations migration safe on a live DB with existing users?
> - Concurrent logins during the feature flag rollout
> - Mid-session behavior when the flag flips
> - Existing integration tests that will break

Typical findings:

- *"The existing `AuthInterceptor` assumes `/login` returns `{access_token, refresh_token}`. The new shape will make old mobile clients crash. Mitigation: gate the new shape behind a `X-Client-Supports-2FA: true` header, OR only return the new shape when the user has 2FA enabled."*
- *"`tests/Integration/AuthTests.cs::test_login_success` will fail because the response assertion checks for `access_token` directly. 12 tests need updating."*
- *"The EF Core migrations migration adds `totp_enabled BOOLEAN NOT NULL`. SQL Server will fail on a table with existing rows. Fix: make it nullable, or add with `DEFAULT false`."*

These are exactly the findings that turn a 3-day feature into a 2-week rollback if you don't catch them. Fix before any code is written.

### Step 4 — Confluence (optional)

Same as greenfield, same caveats. Often less necessary for brownfield features — an internal change to auth doesn't always warrant a stakeholder page.

### Step 5 — Feasibility, focused on blast radius

The Technical Analyst's real job on brownfield is to map **what else breaks when this changes**.

> `@.cursor/agents/technical_analyst.md` Analyze `@.sdd/features/pending/2fa/stories.md`. Focus on blast radius:
>
> - What else in the codebase depends on the login flow?
> - Are there cron jobs, background workers, or other services that assume the current token shape?
> - What integration tests will need updating?
> - Are there downstream consumers (mobile app, CLI tool, third-party integrations) that hit `/login` directly?
> - Are there analytics or audit log events that depend on the current login event shape?

You get back a list of files, tests, and external consumers to watch. This feeds directly into the task breakdown — each item on the blast radius list should become either a task or an Open Question on a story.

### Step 6 — Jira with a regression lens

Same as greenfield, but the Jira hierarchy should explicitly include:

- A task per existing integration test file that needs updating.
- A task for validating the existing login flow still works (non-2FA users).
- A task for backward-compatibility testing with any pinned clients (mobile app, CLI).
- A rollback plan as an Open Question on the epic.

> Convert `@.sdd/features/pending/2fa/stories.md` into Jira at `https://myorg.atlassian.net/jira/software/projects/AUTH`. Use `@.cursor/skills/jira-epic-story-task-automation/SKILL.md`. Every ticket must reference its REQ-ID. Add label `SDD` and `brownfield`. Include explicit sub-tasks for updating existing tests.

Then:

> Generate `plan.md` for `@.sdd/features/pending/2fa/stories.md`. Order the steps so that backward compatibility is validated before the feature is turned on.

### Step 7 — Build, one thin slice at a time, with file constraints

This is where brownfield discipline matters most. Coding agents on existing codebases love to "improve" adjacent code — rename things, tidy imports, extract helpers, fix unrelated formatting. That's how a 50-line 2FA diff turns into a 600-line unreviewable PR.

**Rule: constrain the agent to named files per story.**

> Implement Story 2 (modify login to check 2FA). Reference REQ-2FA-003 and REQ-2FA-004 in the commit.
>
> Files in scope — modify ONLY these:
>
> - `Services/AuthService.cs`
> - `Endpoints/AuthEndpoints.cs`
>
> Files for context only — READ but DO NOT MODIFY:
>
> - `Entities/User.cs`
> - `Infrastructure/JwtTokenService.cs`
>
> Do not touch any other file. Do not refactor anything outside the change. Do not rename variables in unrelated code. Show me the diff before applying.

After the diff is applied:

- Run the new tests (they should pass).
- Run the existing tests (most should still pass; the ones you knew would break should fail in the way you expected).
- Review the diff line by line. In brownfield, *every* line should either implement the story or be explicitly expected.
- Commit with REQ-IDs in the message: `git commit -m "[REQ-2FA-003] Modify authenticate() to return partial token when 2FA enabled"`

Repeat for each story. Do not let the agent work on multiple stories in one turn — the whole point of the slicing is to keep each diff reviewable.

### Brownfield-specific practices during build

| Practice | Why |
|----------|-----|
| Constrain files per prompt | Prevents silent scope creep in the diff |
| "Show me the diff before applying" | Forces a review gate at the smallest unit |
| Run existing tests after every change | Catches regressions while they're still cheap |
| Treat "update existing tests" as tasks, not afterthoughts | Otherwise they're discovered on PR day |
| Commit one story at a time with REQ-IDs | Keeps traceability readable in `git log` |
| Use `@council` mid-build when you hit unfamiliar code | Don't let the agent guess at shared utilities |
| Use `@technical-devils-advocate` before merging | Catch integration issues before the PR goes to a human reviewer |

### Brownfield time budget (rough)

| Phase | Time |
|-------|------|
| Step 0 (exploration) | 30–60 min |
| Steps 1–2 (spec + approval, grounded in real files) | 60–120 min |
| Step 3 (backlog with file lists) | 30–45 min |
| Step 3.5 (Devil's Advocate, integration focus) | 45–90 min |
| Step 5 (feasibility / blast radius) | 30–45 min |
| Step 6 (Jira + plan) | 20–30 min |
| **Total planning** | **3.5–6 hours** |
| Step 7 (build, with per-story constraints) | Slower per LOC than greenfield because of review gates, but safer |

Brownfield planning costs more than greenfield, but a single production incident from a missed backward-compatibility case costs a hundred times that.

---

## Quick reference — greenfield vs brownfield

| Aspect | Greenfield | Brownfield |
|--------|-----------|-----------|
| Starting point | Empty folder, plain-English description | Existing codebase, `/council` exploration first |
| Spec content | Goals, APIs, models (all new) | Goals + explicit "modified vs new" boundary |
| Approval gate focus | Is the scope right? | Is the scope right AND is it additive/surgical? |
| Backlog prompt | Spec + template | Spec + template + **existing files** |
| Story shape | "Create X, Y, Z" | "Modify A, Create B, Read C" |
| Devil's Advocate focus | Feature risk, edge cases | Backward compatibility, blast radius, integration risk |
| Feasibility focus | Prerequisites (infra, accounts, pipelines) | Blast radius (tests, consumers, downstream) |
| Build constraint | "Build Story N per plan.md" | "Build Story N, modify ONLY these files, show diff first" |
| Highest-risk failure mode | Scope keeps growing | Silent scope creep inside the diff |
| Dedicated story for tests | Usually one per feature story | Always a separate story for updating existing tests |

---

## Common pitfalls (both flows)

**Approving the spec without reading it carefully.** The spec is the contract. Everything downstream amplifies whatever is in it. If you skim-approve, you've just laundered AI guesses into "approved scope."

**Skipping Devil's Advocate to save time.** It's the step with the highest ratio of time-saved-later to time-spent-now. Skipping it is exactly backwards.

**Dropping REQ-IDs somewhere in the chain.** If they don't make it into commits, the traceability story dies and you have the kit's overhead without its payoff.

**Letting the coding agent work on multiple stories at once.** Reviewable diffs come from thin slices. Fat slices get rubber-stamped.

**Treating Confluence as a substitute for the spec.** It's stakeholder communication. It does not replace the spec-and-backlog discipline.

**Using the full seven-step flow for tiny changes.** A one-line fix does not need an SVS. Steal the pieces that fit, skip the rest.

---

## Final note

The kit is a set of templates and prompts with review gates baked in. It doesn't make you a better engineer — it makes it harder to ship something you haven't thought about. On greenfield, that means forcing scope to be written down before code starts. On brownfield, it means forcing the boundary between new and existing code to be explicit, and keeping every diff surgical.

The discipline matters more than the tooling. If you internalize the habits — write a real spec, ground it in real files, challenge the backlog, constrain the coding agent — you can reproduce 80% of the kit's value with three saved prompts and no `.cursor/` directory at all. The kit is most valuable when a whole team needs to move in the same way. For a sharp individual engineer, take what earns its keep and leave the rest.
