# council

Use this command when you need **broad codebase exploration** before answering or planning.

## Stack context (this project)

- **Frontend:** Angular (see `.cursor/rules/angular-patterns.mdc`).
- **Backend:** ASP.NET Core / .NET 9/10 (see `.cursor/rules/dotnet-api.mdc`, `dotnet-backend-patterns.mdc`).
- **Process:** **Specs-Driven Design (SDD)** — specs, `REQ-…` IDs, stories, and `plan.md` / `tasks.md` before implementation (see `.cursor/rules/specs-driven-design.mdc`, `.cursor/agents/backlog_architect.md`).

When reporting findings, tie discoveries to **architecture** (Angular modules/routes vs ASP.NET Core controllers/services/EF Core data layer) and, if relevant, to **traceability** (spec sections, requirement IDs).

## Steps

Based on the given area of interest:

1. Dig around the codebase for that area; gather keywords and an **architecture overview** (Angular vs ASP.NET Core boundaries, shared contracts, EF Core entities).
2. Spawn **n = 10** task agents to dig deeper (unless the user specifies another **n**), with **variety** in exploration paths (e.g. UI, API, data layer, migrations, tests, infra).
3. Use the collected information to do what the user requested.
4. If in **plan mode**, use the information to build the plan **in line with SDD** (scope, risks, tasks mapped to specs).

## Example usage

/council n=15 how does authentication work?
/council map all ViewModels and their navigation targets
/council n=5 getting this error, investigate
/council Map out the data flow from login to dashboard
/council Show me every place we touch the DbContext

---

## Related: `/council-v2` (persistent project knowledge)

If you want a **persistent knowledge cache** (so future agents don't re-explore the codebase from scratch), see [`council-v2.md`](council-v2.md). It maintains two living truth docs (`.sdd/docs/project_knowledge.md`, `.sdd/docs/project_deployment_knowledge.md`) that `/finish-story` and `/finish-task` keep current. `/council-v2` complements `/council`; both can be used.
