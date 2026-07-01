# SpecBridge deployment configuration

All secrets and environment-specific values are supplied at deploy time via **environment variables** (prefix `SPECBRIDGE_`), **Azure Key Vault**, or **Container Apps secrets**. Nothing sensitive belongs in git.

## Required for production API

| Setting | Environment variable | Notes |
|---------|---------------------|--------|
| PostgreSQL | `SPECBRIDGE_ConnectionStrings__PostgreSQL` | Full Npgsql connection string |
| Entra Client ID | `SPECBRIDGE_EntraId__ClientId` | App registration |
| Entra Tenant ID | `SPECBRIDGE_EntraId__TenantId` | Your tenant |
| Entra Audience | `SPECBRIDGE_EntraId__Audience` | e.g. `api://specbridge` |
| Key Vault URI | `SPECBRIDGE_Azure__KeyVaultUri` | Cursor/GitHub/Jira/Atlassian secrets |
| Internal events key | `SPECBRIDGE_Internal__EventsApiKey` | Worker → API fan-in (min 32 chars) |
| Atlassian client secret | `SPECBRIDGE_Atlassian__ClientSecret` | **Never commit** — OAuth token exchange |

## Required for production worker

| Setting | Environment variable | Notes |
|---------|---------------------|--------|
| Service Bus | `SPECBRIDGE_SERVICE_BUS_CONNECTION` | Queue consumer |
| API base URL | `SPECBRIDGE_API_BASE_URL` | Event relay + credential resolve |
| Events API key | `SPECBRIDGE_EVENTS_API_KEY` | Same as `Internal:EventsApiKey` |
| Blob storage | `SPECBRIDGE_BLOB_CONNECTION_STRING` | Bundle upload (optional if API serves local path) |
| Git | `git` on PATH | Shallow clone when `repoPath` omitted |

## Optional

| Setting | Environment variable |
|---------|---------------------|
| App Insights | `SPECBRIDGE_ApplicationInsights__ConnectionString` |
| Blob container | `SPECBRIDGE_BLOB_CONTAINER` (default `bundles`) |
| GHES hosts | `SPECBRIDGE_GitHub__AllowedGhesHosts__0` |
| Worker repo fallback | `SPECBRIDGE_REPO_PATH` |

## Atlassian OAuth (Jira / Confluence)

1. Create an OAuth 2.0 (3LO) app in [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/).
2. Set redirect URI to match your SPA/API callback.
3. Configure `SPECBRIDGE_Atlassian__ClientId` and `SPECBRIDGE_Atlassian__ClientSecret`.
4. Call `POST /v1/integrations/jira/connect` with the authorization `code` — the API exchanges it for access/refresh tokens stored in Key Vault.

## Local development

Use `dotnet user-secrets` for the API (gitignored) or export `SPECBRIDGE_*` variables. Do not add secrets to `appsettings.json`.
