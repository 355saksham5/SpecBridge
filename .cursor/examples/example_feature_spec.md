# Example Feature Spec – Saved Views for Reports (Angular + ASP.NET Core)

## Problem

Analysts repeatedly re-apply filters and column selections in the Reports page. They want to **save**, **load**, and **share** common views.

## Goals / Non-Goals

* **Goal:** Save, load, and share a view (filters + sort + columns)
* **Non-Goal (v1):** Cross-organization sharing, offline support

## Constraints

* **Frontend:** Angular 17+; RxJS 7+; optional NgRx for state
* **Backend:** .NET 9/10; ASP.NET Core Web API; Entity Framework Core; SQL Server or PostgreSQL
* **Performance:** p95 load of a saved view < 400 ms (API); FE additional bundle < 30 KB gzip
* **Security:** Auth via JWT Bearer; org-scoped authorization via ASP.NET Core policy; no PII in URLs
* **Rollout:** Feature flag `feature.saved_views`

## User Acceptance

* Save a view with a unique name per user
* Load a saved view from a list; default view persists
* Share via link to users in the same org (v1)

## APIs (Conceptual)

* `GET /api/saved-views` — list
* `POST /api/saved-views` — create
* `GET /api/saved-views/{id}` — get
* `PUT /api/saved-views/{id}` — update
* `DELETE /api/saved-views/{id}` — delete

> Final request/response models will use C# record types with Data Annotations (or FluentValidation) and be versioned if contracts change. OpenAPI spec generated via Swashbuckle.

## Observability

* Events: `view_saved`, `view_loaded`, `view_shared`
* Metrics: p95 load latency, error rate, duplicate name errors
* Logs: include orgId, userId, viewId (no PII); structured via `ILogger<T>` + OpenTelemetry
