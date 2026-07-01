# Feature archive: specbridge-platform

> **SpecBridge Brownfield Onboarding Platform** — v1 shipped  
> **Archived:** 2026-07-01  
> **Feature ID:** specbridge-platform  
> **Original spec:** 2026-06-03 (approved implicitly by phased delivery)

---

## Summary

SpecBridge turns brownfield GitHub repos into SDD-ready codebases using Cursor Cloud Agents, a commit-history calibration loop, and a plugin-consumable knowledge bundle. v1 platform code is **customer-ready**; deployment secrets and the Cursor plugin are customer-side.

Implementation followed the release plan in the original feature spec (Phases 0–6) plus Phases 7–10 and a **customer-ready** hardening pass. Backlog (`requirements.md`, `stories.md`, `plan.md`) was not generated — delivery used phased commits and `/finish-task customer-ready` instead of `/finish-story`.

---

## Problem (from spec)

Brownfield teams cannot adopt SDD because:

1. One-shot exploration wastes tokens and gives inconsistent context.
2. No feedback loop improves knowledge from commit history.
3. Manual SDD kit / truth-doc setup blocks `/start-feature`.

---

## Goals — v1 status

| # | Goal | Status |
|---|------|--------|
| 1 | Bootstrap council-v2 truth docs + tokenized shards at HEAD | ✅ |
| 2 | Commit walk + 5-agent calibration loop per Jira-linked commit | ✅ |
| 3 | Measurable token curve + QA scores in report | ✅ |
| 4 | Plugin-ready ZIP bundle + `specbridge.manifest.json` | ✅ |
| 5 | Optional PR delivery (`delivery.openPr`) | ✅ |
| 6 | Multi-tenant API (Entra, Key Vault, isolated connections) | ✅ |

---

## Non-goals (v1 — unchanged)

- Custom SDD templates beyond `csharp-sdd-starter-kit`
- Retro `requirements.md` / `stories.md` / `plan.md` per historical commit
- Local Cursor execution (Cloud Agents only)
- Hard failure on low calibration overlap
- GHES network fixes (customer allowlists Cursor egress)
- Upfront Cursor cost prediction

---

## Implementation phases (shipped)

| Phase | Scope | Commit (approx.) |
|-------|--------|------------------|
| 0 | OpenAPI, manifest schema, fake worker | (initial) |
| 1 | .NET 10 API skeleton, EF, Key Vault pattern | |
| 2 | agent-orchestrator, stack-detect, Knowledge Architect, bundle packer | |
| 3 | commit-walker, Jira client, Feature Historian | |
| 4 | Calibrator, Prober, Curator, Auditor, token curve | |
| 5 | Service Bus, Bicep, App Insights, PR delivery, Confluence | |
| 6 | Parsers, recorded mocks, GHES allowlist, audit sanitization | `ed1af11` |
| 7 | FluentValidation, tenant credential checks, GET job | `bc19cd9` |
| 8 | SSE, bundle/report, worker event relay | `b7c210b` |
| 9 | EF migrations, blob SAS, integrations, SDD kits, job list | `3fdc0b5` |
| 10 | Worker credential resolve, DB progress, E2E recorded flow | `18df812` |
| Customer-ready | OAuth, tenant EF filters, 409 rules, git clone, docs | `c7cb77c` |

---

## Key deliverables

- **API:** `apps/api` — 15+ endpoints, Entra JWT, SSE, integrations, internal worker API
- **Worker:** `apps/knowledge-worker` — Service Bus, job pipeline, six agents, bundle upload
- **Packages:** `agent-orchestrator`, `knowledge-store`, `commit-walker`, `bundle-packer`, etc.
- **Docs:** `README.md`, `docs/DEPLOYMENT.md`, `docs/PLUGIN_USAGE.md`, `docs/api.openapi.yaml`
- **Truth docs:** `.sdd/docs/project_knowledge.md`, `project_deployment_knowledge.md`
- **Task archive:** `.sdd/tasks/completed.md` → `customer-ready`

---

## User acceptance criteria (spec reference)

Full Gherkin AC from the original feature spec covered:

1. Job creation, SSE, status tracking  
2. Knowledge bootstrap (truth docs + shards)  
3. Commit walk with Jira enrichment and skip events  
4. Iterative quality improvement (token delta per commit)  
5. Bundle delivery (302 SAS, manifest checksums)  
6. Optional PR  
7. Quality report JSON  
8. Security and tenant isolation  

Automated coverage: 78+ Vitest tests including E2E recorded job flow.

---

## Out of repo / customer actions

- Deploy Azure (`infra/bicep/main.bicep`) and set `SPECBRIDGE_*` env vars  
- Entra app registration with `org_id` claim  
- Atlassian OAuth app + `SPECBRIDGE_Atlassian__ClientSecret`  
- **Cursor plugin** (separate extension consuming `specbridge.manifest.json`)  
- First production smoke test on a real brownfield repo  

---

## v2 candidates (not scoped)

- Formal REQ-SB backlog for SpecBridge itself  
- Custom SDD template registry  
- Local Cursor / VM runner  
- Agent cost estimation UI  
- Additional language parsers beyond py/java/go/ts  

---

## Original feature spec

Full text preserved in git:

```bash
git show 9a23cec:.sdd/features/pending/specbridge-platform/feature_spec.md
```

Initial commit: `9a23cec` — *feat: initial SpecBridge repo setup with SDD kit and feature spec*

---

## References

- Product overview: [`README.md`](../../README.md)
- Plugin usage: [`docs/PLUGIN_USAGE.md`](../../docs/PLUGIN_USAGE.md)
- Deployment: [`docs/DEPLOYMENT.md`](../../docs/DEPLOYMENT.md)
- OpenAPI: [`docs/api.openapi.yaml`](../../docs/api.openapi.yaml)
