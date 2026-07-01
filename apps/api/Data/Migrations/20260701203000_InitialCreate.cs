using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SpecBridge.Api.Data;

#nullable disable

namespace SpecBridge.Api.Data.Migrations;

[DbContext(typeof(SpecBridgeDbContext))]
[Migration("20260701203000_InitialCreate")]
public partial class InitialCreate : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "organizations",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                Name = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                EntraIdTenantId = table.Column<string>(type: "text", nullable: true),
                CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
            },
            constraints: table => table.PrimaryKey("PK_organizations", x => x.Id));

        migrationBuilder.CreateTable(
            name: "brownfield_jobs",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                RepoUrl = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                Status = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                HeadSha = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                CurrentPhase = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                CurrentAgentRole = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                CurrentCommitSha = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                CommitsProcessed = table.Column<int>(type: "integer", nullable: false),
                CommitsSkipped = table.Column<int>(type: "integer", nullable: false),
                CommitsRemaining = table.Column<int>(type: "integer", nullable: true),
                TokenEstimateStart = table.Column<int>(type: "integer", nullable: true),
                TokenEstimateCurrent = table.Column<int>(type: "integer", nullable: true),
                MeanQaScore = table.Column<float>(type: "real", nullable: true),
                PrUrl = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                BundleBlobName = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
            },
            constraints: table => table.PrimaryKey("PK_brownfield_jobs", x => x.Id));

        migrationBuilder.CreateIndex(
            name: "IX_brownfield_jobs_OrganizationId_CreatedAt",
            table: "brownfield_jobs",
            columns: new[] { "OrganizationId", "CreatedAt" });

        migrationBuilder.CreateTable(
            name: "cursor_credentials",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                Name = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                KeyVaultSecretName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                Last4 = table.Column<string>(type: "character varying(4)", maxLength: 4, nullable: true),
                CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
            },
            constraints: table => table.PrimaryKey("PK_cursor_credentials", x => x.Id));

        migrationBuilder.CreateTable(
            name: "github_connections",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                HostType = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                WebUrl = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                ApiBaseUrl = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                InstallationId = table.Column<long>(type: "bigint", nullable: false),
                CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
            },
            constraints: table => table.PrimaryKey("PK_github_connections", x => x.Id));

        migrationBuilder.CreateTable(
            name: "jira_connections",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                BaseUrl = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                KeyVaultSecretName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
            },
            constraints: table => table.PrimaryKey("PK_jira_connections", x => x.Id));

        migrationBuilder.CreateTable(
            name: "confluence_connections",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                BaseUrl = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                KeyVaultSecretName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
            },
            constraints: table => table.PrimaryKey("PK_confluence_connections", x => x.Id));

        migrationBuilder.CreateTable(
            name: "job_commits",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                BrownfieldJobId = table.Column<Guid>(type: "uuid", nullable: false),
                CommitSha = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                Processed = table.Column<bool>(type: "boolean", nullable: false),
                SkipReason = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                JiraIssueKey = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                TokenEstimateAfter = table.Column<int>(type: "integer", nullable: true),
                QaScore = table.Column<float>(type: "real", nullable: true),
                CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_job_commits", x => x.Id);
                table.ForeignKey(
                    name: "FK_job_commits_brownfield_jobs_BrownfieldJobId",
                    column: x => x.BrownfieldJobId,
                    principalTable: "brownfield_jobs",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateTable(
            name: "job_phase_runs",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                BrownfieldJobId = table.Column<Guid>(type: "uuid", nullable: false),
                AgentRole = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                CommitSha = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                CursorAgentId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                CursorRunId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                TokensIn = table.Column<int>(type: "integer", nullable: true),
                TokensOut = table.Column<int>(type: "integer", nullable: true),
                DurationMs = table.Column<int>(type: "integer", nullable: true),
                StartedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                CompletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_job_phase_runs", x => x.Id);
                table.ForeignKey(
                    name: "FK_job_phase_runs_brownfield_jobs_BrownfieldJobId",
                    column: x => x.BrownfieldJobId,
                    principalTable: "brownfield_jobs",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "job_phase_runs");
        migrationBuilder.DropTable(name: "job_commits");
        migrationBuilder.DropTable(name: "confluence_connections");
        migrationBuilder.DropTable(name: "jira_connections");
        migrationBuilder.DropTable(name: "github_connections");
        migrationBuilder.DropTable(name: "cursor_credentials");
        migrationBuilder.DropTable(name: "brownfield_jobs");
        migrationBuilder.DropTable(name: "organizations");
    }
}
