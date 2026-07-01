-- SpecBridge initial schema (PostgreSQL 15+)
-- Apply: psql -f InitialSchema.sql  OR  dotnet ef database update (when tooling available)

CREATE TABLE IF NOT EXISTS organizations (
    "Id" uuid NOT NULL PRIMARY KEY,
    "Name" character varying(256) NOT NULL,
    "EntraIdTenantId" text NULL,
    "CreatedAt" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS brownfield_jobs (
    "Id" uuid NOT NULL PRIMARY KEY,
    "OrganizationId" uuid NOT NULL,
    "RepoUrl" character varying(2048) NOT NULL,
    "Status" character varying(64) NOT NULL,
    "HeadSha" character varying(64) NULL,
    "CurrentPhase" character varying(64) NULL,
    "CurrentAgentRole" character varying(64) NULL,
    "CurrentCommitSha" character varying(64) NULL,
    "CommitsProcessed" integer NOT NULL DEFAULT 0,
    "CommitsSkipped" integer NOT NULL DEFAULT 0,
    "CommitsRemaining" integer NULL,
    "TokenEstimateStart" integer NULL,
    "TokenEstimateCurrent" integer NULL,
    "MeanQaScore" real NULL,
    "PrUrl" character varying(2048) NULL,
    "BundleBlobName" character varying(512) NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "IX_brownfield_jobs_OrganizationId_CreatedAt"
    ON brownfield_jobs ("OrganizationId", "CreatedAt");

CREATE TABLE IF NOT EXISTS cursor_credentials (
    "Id" uuid NOT NULL PRIMARY KEY,
    "OrganizationId" uuid NOT NULL,
    "Name" character varying(128) NULL,
    "KeyVaultSecretName" character varying(256) NOT NULL,
    "Last4" character varying(4) NULL,
    "CreatedAt" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS github_connections (
    "Id" uuid NOT NULL PRIMARY KEY,
    "OrganizationId" uuid NOT NULL,
    "HostType" character varying(32) NOT NULL,
    "WebUrl" character varying(2048) NOT NULL,
    "ApiBaseUrl" character varying(2048) NOT NULL,
    "InstallationId" bigint NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS jira_connections (
    "Id" uuid NOT NULL PRIMARY KEY,
    "OrganizationId" uuid NOT NULL,
    "BaseUrl" character varying(2048) NOT NULL,
    "KeyVaultSecretName" character varying(256) NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS confluence_connections (
    "Id" uuid NOT NULL PRIMARY KEY,
    "OrganizationId" uuid NOT NULL,
    "BaseUrl" character varying(2048) NOT NULL,
    "KeyVaultSecretName" character varying(256) NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS job_commits (
    "Id" uuid NOT NULL PRIMARY KEY,
    "BrownfieldJobId" uuid NOT NULL REFERENCES brownfield_jobs("Id") ON DELETE CASCADE,
    "CommitSha" character varying(64) NOT NULL,
    "Processed" boolean NOT NULL DEFAULT false,
    "SkipReason" character varying(512) NULL,
    "JiraIssueKey" character varying(64) NULL,
    "TokenEstimateAfter" integer NULL,
    "QaScore" real NULL,
    "CreatedAt" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS job_phase_runs (
    "Id" uuid NOT NULL PRIMARY KEY,
    "BrownfieldJobId" uuid NOT NULL REFERENCES brownfield_jobs("Id") ON DELETE CASCADE,
    "AgentRole" character varying(64) NOT NULL,
    "CommitSha" character varying(64) NULL,
    "CursorAgentId" character varying(128) NULL,
    "CursorRunId" character varying(128) NULL,
    "TokensIn" integer NULL,
    "TokensOut" integer NULL,
    "DurationMs" integer NULL,
    "StartedAt" timestamp with time zone NOT NULL,
    "CompletedAt" timestamp with time zone NULL
);

CREATE TABLE IF NOT EXISTS "__EFMigrationsHistory" (
    "MigrationId" character varying(150) NOT NULL PRIMARY KEY,
    "ProductVersion" character varying(32) NOT NULL
);

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260701203000_InitialCreate', '10.0.8')
ON CONFLICT DO NOTHING;
