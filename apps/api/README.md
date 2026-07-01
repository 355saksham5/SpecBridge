# SpecBridge.Api

> .NET 10 Minimal API for SpecBridge platform

## Phase 1 Status

**Implemented:**
- ✅ .NET 10 project structure
- ✅ Entra ID JWT authentication
- ✅ FluentValidation integration
- ✅ EF Core + PostgreSQL setup
- ✅ Azure Key Vault client (DefaultAzureCredential)
- ✅ Azure Service Bus SDK
- ✅ Application Insights + OpenTelemetry
- ✅ Swagger/OpenAPI UI
- ✅ Entity models (BrownfieldJob, JobCommit, JobPhaseRun, Connections)
- ✅ DbContext with tenant isolation query filters
- ✅ Health check endpoint
- ✅ Placeholder job CRUD endpoints

**Implemented (Phase 7):**
- ✅ Full `CreateBrownfieldJobRequest` DTO aligned with OpenAPI
- ✅ FluentValidation rules (repoUrl, GHES allowlist, ranges, nested options)
- ✅ Tenant credential checks (GitHub + Cursor + optional Jira connections)
- ✅ `BrownfieldJobService` — persist job, enqueue worker message
- ✅ `GET /v1/brownfield-jobs/{id}` with tenant isolation
- ✅ EF entity configurations (ready for `dotnet ef migrations add Initial`)

**Implemented (Phase 8):**
- ✅ SSE stream at `GET /v1/brownfield-jobs/{id}/events` (`text/event-stream`, event replay)
- ✅ `GET /v1/brownfield-jobs/{id}/bundle` — 302 to bundle URL captured from `bundle_ready`
- ✅ `GET /v1/brownfield-jobs/{id}/report` — quality metrics from `job_completed`
- ✅ Internal events fan-in for knowledge-worker (`Internal:EventsApiKey`)
- ✅ EventSource `?token=` query support for browser clients

**Pending:**
- ⏳ EF Core migrations (`dotnet ef migrations add Initial`)
- ⏳ Azure Blob SAS generation for bundle downloads (local path today from worker)
- ⏳ ProblemDetails middleware

## Running Locally

### Prerequisites

- .NET 10 SDK
- PostgreSQL 15+
- Docker (optional, for local PostgreSQL)
- Azure CLI (for Key Vault local dev)

### Setup

1. **Start PostgreSQL:**

   ```bash
   docker run --name specbridge-pg -e POSTGRES_PASSWORD=dev_password -p 5432:5432 -d postgres:15
   ```

2. **Update connection string:**

   Edit `appsettings.Development.json` if needed.

3. **Run migrations:**

   ```bash
   dotnet ef database update
   ```

4. **Run the API:**

   ```bash
   dotnet run
   ```

5. **Open Swagger UI:**

   Navigate to `https://localhost:5001/swagger`

## Configuration

### Environment Variables

Prefix all with `SPECBRIDGE_`:

- `SPECBRIDGE_ConnectionStrings__PostgreSQL`
- `SPECBRIDGE_EntraId__ClientId`
- `SPECBRIDGE_Azure__KeyVaultUri`
- `SPECBRIDGE_ApplicationInsights__ConnectionString`

### User Secrets (Local Dev)

```bash
dotnet user-secrets set "EntraId:ClientId" "your-entra-app-id"
dotnet user-secrets set "Azure:KeyVaultUri" "https://your-kv.vault.azure.net/"
```

## Authentication

API requires Entra ID JWT bearer tokens. For local testing:

1. Register an Azure AD app
2. Configure `appsettings.Development.json` with ClientId
3. Obtain a token via Azure CLI or Postman
4. Pass as `Authorization: Bearer <token>`

For unauthenticated endpoints (health, root), use `.AllowAnonymous()`.

## Database Migrations

Create a new migration:

```bash
dotnet ef migrations add MigrationName
```

Apply migrations:

```bash
dotnet ef database update
```

Generate SQL script:

```bash
dotnet ef migrations script
```

## Tenant Isolation

All tenant-scoped entities (`BrownfieldJob`, `CursorCredential`, etc.) include `OrganizationId`.

Global query filters are configured in `SpecBridgeDbContext.OnModelCreating`.

**Tenant context** should be extracted from JWT claims (e.g., `oid` or custom `orgid` claim) and injected into HTTP context for filtering.

## Azure Services

### Key Vault

Secrets are never stored in DB. Only Key Vault secret **names** are persisted.

Example:
- DB: `{ "KeyVaultSecretName": "cursor-api-key-org-abc" }`
- Key Vault: `cursor-api-key-org-abc` → actual secret value

### Service Bus

Job queue messages are published to `brownfield-jobs` queue. Worker processes dequeue and orchestrate agents.

### Blob Storage

Bundle ZIPs are uploaded to `bundles` container. API returns 302 redirect to SAS URL.

## Next Steps (Phase 1 Completion)

1. Implement full CRUD endpoints per OpenAPI spec
2. Add SSE endpoint with `text/event-stream` content type
3. Create EF Core entity configurations + indexes
4. Add FluentValidation validators
5. Implement ProblemDetails error handling
6. Add Service Bus publisher
7. Write unit tests for endpoints

## Next Steps (Phase 2)

See Phase 2 todo: TypeScript agent-orchestrator package + Knowledge Architect agent.
