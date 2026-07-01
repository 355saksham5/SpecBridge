# SpecBridge API Documentation

## Overview

This directory contains the OpenAPI contract, JSON schemas, and examples for the SpecBridge API.

## Files

### API Contract

- **`api.openapi.yaml`**: Complete OpenAPI 3.1 specification for all 15 endpoints
  - 5 integration endpoints (Cursor, GitHub, Jira, Confluence)
  - 2 SDD kit registry endpoints
  - 8 brownfield job endpoints (CRUD, SSE, bundle, report, cancel)
  - Entra ID JWT authentication
  - RFC 7807 ProblemDetails error responses

### Schemas

- **`schemas/specbridge.manifest.schema.json`**: JSON Schema for the plugin contract
  - Defines the structure of `specbridge.manifest.json` inside each bundle ZIP
  - Consumed by the custom Cursor plugin to apply SDD artifacts to brownfield repos
  - Version: `specbridgeVersion: "1.0"`

### Examples

- **`examples/specbridge.manifest.example.json`**: Example manifest showing:
  - Job metadata (jobId, repository, timestamps)
  - SDD kit version
  - Knowledge metrics (token reduction, QA scores, calibration overlap)
  - File registry with SHA-256 checksums
  - Optional PR info

## Plugin usage

See **[`PLUGIN_USAGE.md`](./PLUGIN_USAGE.md)** for the full end-to-end guide: configure the Cursor plugin, create jobs, monitor SSE, download bundles, and start using SDD commands in your workspace.

## Deployment

See **[`DEPLOYMENT.md`](./DEPLOYMENT.md)** for production environment variables and Azure configuration.

## Validation

### OpenAPI Validation

Use Redocly CLI to validate and lint the OpenAPI spec:

```bash
npx @redocly/cli lint docs/api.openapi.yaml
```

### JSON Schema Validation

Use AJV to validate example manifests against the schema:

```bash
npx ajv validate -s docs/schemas/specbridge.manifest.schema.json -d docs/examples/specbridge.manifest.example.json
```

## Fake Worker

See `../tools/fake-worker/` for a Phase 0 stub that emits SSE events matching the OpenAPI contract.

Usage:

```bash
node tools/fake-worker/index.js test-job-uuid
```

This outputs SSE-formatted events to stdout, simulating:

- `phase_started`
- `agent_started` / `agent_completed`
- `commit_skipped`
- `audit_verdict`
- `bundle_ready`
- `job_completed`

Use this to validate SSE parsing in the API skeleton (Phase 1) before implementing the real TypeScript worker.

## Next Steps (Phase 1)

1. Scaffold .NET 10 Minimal API
2. Implement Entra ID JWT middleware
3. Add FluentValidation for request DTOs
4. Create SSE endpoint at `/brownfield-jobs/{id}/events`
5. Integrate Service Bus for job queue
6. Set up PostgreSQL schema + EF Core migrations
7. Add Key Vault client for secret references

## References

- [OpenAPI 3.1 Spec](https://spec.openapis.org/oas/v3.1.0)
- [JSON Schema Draft-07](https://json-schema.org/draft-07/schema)
- [RFC 7807 Problem Details](https://datatracker.ietf.org/doc/html/rfc7807)
- [Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
