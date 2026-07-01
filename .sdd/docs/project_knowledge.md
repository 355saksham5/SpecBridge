# SpecBridge — project knowledge

> Living architecture/code reference. Updated by `/council-v2 --refresh` and `/finish-task`.

## Stack

- **API:** .NET 10 Minimal API (`apps/api`) — Entra JWT, FluentValidation, EF Core + PostgreSQL, Key Vault secret references
- **Worker:** TypeScript (`apps/knowledge-worker`) — Service Bus consumer, `@cursor/sdk` agent orchestration, bundle pack
- **Monorepo packages:** `agent-orchestrator`, `knowledge-store`, `commit-walker`, `bundle-packer`, `stack-detect`, `code-parser`, etc.

## Tenant isolation

- JWT claim `org_id` → `ITenantContextAccessor` → EF global query filters on `BrownfieldJob`, `CursorCredential`, `GitHubConnection`, `JiraConnection`, `ConfluenceConnection`
- Internal/worker scopes use `IgnoreQueryFilters()` where cross-tenant lookup is required

## Integrations & secrets

- DB stores Key Vault **secret names** only; values in Azure Key Vault
- **Atlassian OAuth:** `AtlassianOAuthService` exchanges authorization codes, stores `AtlassianTokenBundle` JSON in KV; worker resolves refreshed access tokens via `GetValidAccessTokenAsync`
- **Atlassian client secret:** `SPECBRIDGE_Atlassian__ClientSecret` only — never committed

## Brownfield jobs

- Duplicate active job (same org + `repoUrl` + `branch`) → **409**
- Cancel on terminal status (`completed`, `failed`, `cancelled`) → **409**
- Worker message includes `credentials` block; internal `POST /v1/internal/worker/resolve-credentials`
- Production clone: `repo-clone.ts` shallow-clones HTTPS when `repoUrl` set and `repoPath` omitted (`SPECBRIDGE_SKIP_CLONE=true` to disable)

## Internal worker API

- Header `X-SpecBridge-Events-Key` must match `Internal:EventsApiKey` (minimum 32 characters)
- Endpoints: event fan-in, credential resolve

## Documentation

- Deployment env vars: `docs/DEPLOYMENT.md`
- Cursor plugin workflow: `docs/PLUGIN_USAGE.md`
- OpenAPI: `docs/api.openapi.yaml`
