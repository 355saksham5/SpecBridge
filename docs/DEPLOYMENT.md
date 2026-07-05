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

## Deploying the Bicep template

[`infra/bicep/main.bicep`](../infra/bicep/main.bicep) provisions Log Analytics, App Insights,
Service Bus, Storage, Key Vault, PostgreSQL Flexible Server, and both Container Apps, and wires
the `SPECBRIDGE_*` environment variables above between them automatically. It does **not**
provision the Entra ID app registration or build/push your container images — do those first:

1. Register an Entra ID (Azure AD) app for the API and note its client ID, tenant ID, and
   audience (e.g. `api://specbridge`).
2. Build and push `apps/api` and `apps/knowledge-worker` images to a registry the Container Apps
   environment can pull from (e.g. Azure Container Registry).
3. Deploy:

   ```bash
   az deployment group create \
     --resource-group <your-rg> \
     --template-file infra/bicep/main.bicep \
     --parameters \
       postgresAdminPassword='<strong-password>' \
       apiImage='<registry>/specbridge-api:<tag>' \
       workerImage='<registry>/specbridge-worker:<tag>' \
       entraClientId='<entra-app-client-id>' \
       entraTenantId='<entra-tenant-id>' \
       entraAudience='api://specbridge' \
       internalEventsApiKey='<32+ char random secret>'
   ```

The template grants the API's managed identity `Key Vault Secrets User` on the provisioned Key
Vault (the worker never talks to Key Vault directly — it resolves credentials through the API's
internal endpoint). Atlassian OAuth still requires the manual steps below and the
`SPECBRIDGE_Atlassian__ClientSecret` environment variable set out-of-band (it is not wired by
this template).

## Atlassian OAuth (Jira / Confluence)

1. Create an OAuth 2.0 (3LO) app in [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/).
2. Set redirect URI to match your SPA/API callback.
3. Configure `SPECBRIDGE_Atlassian__ClientId` and `SPECBRIDGE_Atlassian__ClientSecret`.
4. Call `POST /v1/integrations/jira/connect` with the authorization `code` — the API exchanges it for access/refresh tokens stored in Key Vault.

## Local development

Use `dotnet user-secrets` for the API (gitignored) or export `SPECBRIDGE_*` variables. Do not add secrets to `appsettings.json`.
