# SpecBridge — deployment knowledge

> Infra/deploy reference. Updated by `/council-v2 --refresh` and `/finish-task`.

## Configuration model

All production secrets via **`SPECBRIDGE_*` environment variables**, Azure Key Vault, or Container Apps secrets. Committed `appsettings.json` uses empty strings only.

## Required API env vars

| Variable | Purpose |
|----------|---------|
| `SPECBRIDGE_ConnectionStrings__PostgreSQL` | Npgsql connection string |
| `SPECBRIDGE_EntraId__ClientId` / `TenantId` / `Audience` | Entra JWT validation |
| `SPECBRIDGE_Azure__KeyVaultUri` | Cursor/GitHub/Atlassian secrets |
| `SPECBRIDGE_Internal__EventsApiKey` | Worker → API (min 32 chars) |
| `SPECBRIDGE_Atlassian__ClientSecret` | OAuth token exchange (**never commit**) |

## Required worker env vars

| Variable | Purpose |
|----------|---------|
| `SPECBRIDGE_SERVICE_BUS_CONNECTION` | Queue consumer |
| `SPECBRIDGE_API_BASE_URL` | Event relay + credential resolve |
| `SPECBRIDGE_EVENTS_API_KEY` | Same as API internal key |
| `git` on PATH | Shallow clone when `repoPath` omitted |

## Startup behaviour

- EF `MigrateAsync()` runs only when PostgreSQL connection string is non-empty; failures are logged and skipped
- API starts without PostgreSQL configured (persistence endpoints fail until configured)

## Azure resources (target)

Container Apps (API + worker), Service Bus, PostgreSQL Flexible Server, Blob Storage, Key Vault, Application Insights, Entra ID app registration.

Full table: `docs/DEPLOYMENT.md`.
