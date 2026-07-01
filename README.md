# SpecBridge

> Turn legacy repos into spec-driven codebases — one commit at a time.

SpecBridge is an Azure-hosted platform that makes any brownfield GitHub repository (any language, any framework) SDD-ready using Cursor Cloud Agents, a configurable commit-history calibration loop, and a tokenized knowledge bundle consumed by a custom Cursor plugin.

## Status

🚧 **In Development** — Following SDD Greenfield workflow

## Architecture

- **Public API**: .NET 10 Minimal API (Azure Container Apps)
- **Agent Runner**: TypeScript with `@cursor/sdk` (Azure Container Apps)
- **Queue**: Azure Service Bus
- **Data**: PostgreSQL Flexible Server + Azure Blob Storage
- **Secrets**: Azure Key Vault + Managed Identity
- **Auth**: Microsoft Entra ID + GitHub App + Atlassian OAuth
- **Observability**: Application Insights + OpenTelemetry

## Product Capabilities

1. **Knowledge Bootstrap**: council-v2 truth docs + tokenized shards (6 granularity modes)
2. **Commit Walk**: Process N commits (configurable), extract Jira keys, run 6 designated agents
3. **Quality Improvement**: Per-commit calibration loop improves knowledge with each iteration
4. **Bundle Delivery**: ZIP bundle extracted by custom Cursor plugin OR optional PR

## Repository Structure

```
specbridge/
├── apps/
│   ├── api/                    # .NET 10 Minimal API
│   └── knowledge-worker/       # TypeScript agent orchestrator
├── packages/
│   ├── agent-orchestrator/
│   ├── audit-log/
│   ├── code-parser/
│   ├── commit-walker/
│   ├── knowledge-store/
│   ├── calibration-metrics/
│   ├── bundle-packer/
│   └── stack-detect/
├── prompts/agents/             # 6 agent system prompts
├── docs/                       # OpenAPI spec
├── infra/bicep/               # Azure IaC
└── .sdd/                      # SDD artifacts for SpecBridge itself
```

## Development Workflow

This project follows **Specs-Driven Design** using the `csharp-sdd-starter-kit`. See [USAGE_GUIDE.md](./USAGE_GUIDE.md) for the complete workflow.

**Current Phase**: Phase 8 complete — SSE job events stream, bundle/report endpoints, worker event relay to API.

**Implemented (Phase 8):**
- ✅ `GET /v1/brownfield-jobs/{id}/events` — SSE with replay + live subscription
- ✅ `GET /v1/brownfield-jobs/{id}/bundle` — 302 redirect to bundle URL from `bundle_ready`
- ✅ `GET /v1/brownfield-jobs/{id}/report` — quality report from `job_completed` metrics
- ✅ Internal worker fan-in: `POST /v1/internal/brownfield-jobs/{id}/events` (API key)
- ✅ Worker `event-relay.ts` when `SPECBRIDGE_API_BASE_URL` + `SPECBRIDGE_EVENTS_API_KEY` set
- ✅ EventSource `?token=` middleware for browser SSE clients

## License

Proprietary
