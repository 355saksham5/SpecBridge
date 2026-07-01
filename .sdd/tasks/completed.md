# Archived tasks and bug fixes

## customer-ready — Customer-ready hardening — safe config, OAuth, tenant filters, docs

- **Finished:** 2026-07-01
- **Type:** small-feature
- **Traceability:** internal — no Jira

### Files touched

- `apps/api/appsettings.json`
- `apps/api/Services/AtlassianOAuthService.cs`
- `apps/api/Services/ITenantContextAccessor.cs`
- `apps/api/Services/IntegrationsService.cs`
- `apps/api/Services/WorkerCredentialService.cs`
- `apps/api/Data/SpecBridgeDbContext.cs`
- `apps/api/Services/BrownfieldJobService.cs`
- `apps/api/Program.cs`
- `apps/knowledge-worker/src/repo-clone.ts`
- `docs/DEPLOYMENT.md`, `docs/PLUGIN_USAGE.md`, `README.md`

### Summary

Made SpecBridge customer-deployable without committed secrets: real Atlassian OAuth exchange and token refresh, JWT-scoped EF tenant filters, duplicate/cancel 409 rules, worker shallow git clone, sanitized appsettings, and comprehensive README plus plugin/deployment docs. Backend and worker; 78 Vitest tests passing.

### Test scenarios (from brief)

- `npm test` — all Vitest tests pass (including `tests/repo-clone.test.ts`)
- Manual: Jira connect requires `SPECBRIDGE_Atlassian__ClientSecret`; worker clones when `repoUrl` set and `repoPath` omitted
- Manual: duplicate job same repo+branch returns 409; cancel on completed job returns 409

### Blast radius

API integrations (Jira/Confluence connect), all tenant-scoped queries, worker clone path, internal events auth (min key length), job create/cancel semantics
