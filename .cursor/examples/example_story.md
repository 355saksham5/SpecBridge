# Story: Create Saved View (v1)

> **Companion spec:** See `example_feature_spec.md` (Saved Views for Reports).  
> This file is formatted to match **`agents/backlog_architect.md`** output for SDD handoff.

---

## Traceability

| Artifact | Reference |
|----------|-----------|
| Requirement ID | `REQ-SAVED-VIEWS-001` |
| Spec | `examples/example_feature_spec.md` — § User Acceptance (save); § APIs `POST /api/saved-views`; § Observability |
| PRD / initiative | Reports — Saved Views (v1) |

---

## User Story

As an **analyst**, I want to **save my current filters and columns as a named view**, so that **I can quickly return to the same setup later**.

---

## INVEST check

| Letter | Note |
|--------|------|
| **I** | Deliverable without load/share stories if create+list exists; list can be minimal read for this slice. |
| **N** | API contract and naming rules negotiable pending Open Questions. |
| **V** | Directly supports repeated analyst workflows (spec Goals). |
| **E** | Team can size after answers on max views / naming rules—or spike 0.5d if needed. |
| **S** | Single outcome: persist one named view and confirm in UI. |
| **T** | Gherkin + 409 path cover done state. |

---

## Acceptance Criteria (Gherkin)

- **Given** I have applied filters and adjusted columns on the Reports page  
  **When** I click "Save View", enter a unique name, and confirm  
  **Then** the view is created via the API, appears in my list, and a success toast is announced to screen readers

- **Given** I attempt to save a view with a duplicate name  
  **When** I confirm  
  **Then** I see an accessible error and the API responds with 409

---

## Non-Functional Requirements

- **Performance:** FE additional bundle size < 10 KB (gzip) for this story's components; API p95 for create < 200 ms under 95th percentile load.
- **Security / privacy:** Auth via JWT Bearer; org-scoped authorization enforced by ASP.NET Core `[Authorize(Policy = "OrgMember")]`; view names treated as user content—sanitized/encoded per XSS policy; no PII in URLs or telemetry payload.
- **Reliability:** Idempotent client retry-safe (duplicate `Idempotency-Key` header optional follow-up); EF Core unique index on `(UserId, OrgId, Name)` prevents silent duplicates.
- **Observability:** Emit `view_saved` with orgId/userId/viewId via `ILogger<T>` structured log + OpenTelemetry event; metric for duplicate-name (409) rate.
- **Accessibility:** Toast and errors exposed to assistive tech (ARIA live / role); focus management on dialog close per WCAG 2.1 AA target.

---

## Dependencies

- **Angular:** `reports` module, `saved-views` component/service, route guard for auth
- **ASP.NET Core:** `POST /api/saved-views` controller action, request/response record DTOs, EF Core `SavedView` entity, EF Core migration for table + unique index
- **Flag:** `feature.saved_views`

---

## Risks & Mitigations

- **Duplicate names** → enforce EF Core unique index + clear FE validation (align with 409 AC).
- **Slow load times** → add database index; consider `IMemoryCache` by user/org (later story if list grows).
- **Scope creep (share/load)** → keep v1 to create + minimal list; defer share/default per spec Non-Goals where applicable.

---

## Open Questions

- Max number of saved views per user?
- Naming rules and allowed characters?
- Confirm org-scoped uniqueness vs user-scoped only for name?

---

## Blockers for spec sign-off

**None** — pending resolution of Open Questions for product policy only; technical path is clear enough to start implementation with sensible defaults (documented in ADR if defaults chosen).

---

## Suggested Task Breakdown

- **Dev:** FE dialog + service + error handling for 409; ASP.NET Core controller action + DTO + EF Core entity + migration; wiring & flag
- **Test:** Jest/Jasmine unit tests; xUnit API tests with `WebApplicationFactory<TProgram>`; e2e in Cypress/Playwright for happy + duplicate path
- **Docs:** Update user help; OpenAPI schema (Swashbuckle); ADR for saved views storage
- **Data/Migration:** EF Core `dotnet ef migrations add CreateSavedViewsTable` with unique index on `(UserId, OrgId, Name)` or per policy from Open Questions
- **Feature Flag:** behind `feature.saved_views`; gradual rollout 5%→100%

---

## Validation Notes

- **Repo references:** Illustrative only — replace with real paths when copied into a repo (`reports/`, `Api/SavedViews/`, `Data/Migrations/`, etc.).
- **Confidence:** High for flow; Med until Open Questions closed for limits and naming.
- **Unknowns:** Max views and naming rules — track in spec § Constraints or ADR.
- **Traceability summary (for `tasks.md`):** `REQ-SAVED-VIEWS-001` ↔ Create Saved View (v1) ↔ `POST /api/saved-views` + FE save dialog.
