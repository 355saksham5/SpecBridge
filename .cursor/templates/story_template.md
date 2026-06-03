# Story Template (Angular + ASP.NET Core)

> **Used by:** `agents/backlog_architect.md` — fill each user story using this structure.  
> **Filled example:** `examples/example_story.md`.  
> **Other stacks:** use **TBD** under Dependencies and NFRs where Angular/.NET do not apply; list **Open Questions** instead of force-fitting.

---

**Title:** \<clear, concise\>

---

## Traceability

| Field | Value |
|-------|--------|
| Requirement ID | `REQ-…` |
| Spec / PRD | §… or path to `spec.md` / doc |

---

## User Story

As a \<role>, I want \<capability>, so that \<outcome>.

---

## INVEST check

Short note: **I**ndependent / **N**egotiable / **V**aluable / **E**stimable / **S**mall / **T**estable — call out any concern or split suggestion.

---

## Acceptance Criteria (Gherkin)

- Given \<precondition\>
  When \<action\>
  Then \<result\>
- Given …

---

## Non-Functional Requirements

- **Performance:** additional FE bundle (e.g. gzip KB); TTI/LCP if UI-heavy; API p95; pagination/caching
- **Security / Privacy:** auth model (JWT Bearer / ASP.NET Core policy), PII, audit, CSRF if cookies
- **Reliability:** retries/timeouts (Polly); idempotency for writes; EF Core concurrency tokens
- **Observability:** FE events; API structured logs (`ILogger<T>`), OpenTelemetry metrics/traces
- **Accessibility:** keyboard, focus, ARIA, contrast (WCAG 2.1 AA target)

---

## Dependencies

- **Angular:** modules/components/services/routes; interceptors; state (NgRx/Signals) — or **TBD**
- **ASP.NET Core:** controllers or Minimal API endpoints; request/response DTOs; EF Core entities; migrations (`dotnet ef migrations add`); feature flags/config — or **TBD**
- **Feature flags / config:** …

---

## Risks & Mitigations

- …

---

## Open Questions

- …

---

## Blockers for spec sign-off

**None** — or list must-resolve items (legal, security architecture, data/UX contract) before dev commits.

---

## Suggested Task Breakdown

- **Dev:** FE component/service/route + ASP.NET Core controller/service/EF entity + wiring/flags
- **Test:** unit (FE: Jest/Jasmine; API: xUnit + `WebApplicationFactory`), integration, e2e (Cypress/Playwright); **contract tests** if API is shared/consumed elsewhere
- **Docs:** user help, API (OpenAPI/Swagger via Swashbuckle), ADR
- **Data / Migration:** EF Core migration script (`dotnet ef migrations add`), backfill plan
- **Feature Flag:** rollout plan + metrics

---

## Validation Notes (optional)

Use for handoff to `tasks.md` or epic rollup.

- **Repo references:** files/dirs/PRs (or TBD)
- **Confidence:** High / Med / Low
- **Traceability summary:** story title ↔ `REQ-…`
