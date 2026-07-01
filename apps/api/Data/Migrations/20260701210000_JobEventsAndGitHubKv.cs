using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SpecBridge.Api.Data;

#nullable disable

namespace SpecBridge.Api.Data.Migrations;

[DbContext(typeof(SpecBridgeDbContext))]
[Migration("20260701210000_JobEventsAndGitHubKv")]
public partial class JobEventsAndGitHubKv : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "KeyVaultSecretName",
            table: "github_connections",
            type: "character varying(256)",
            maxLength: 256,
            nullable: true);

        migrationBuilder.CreateTable(
            name: "job_events",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                BrownfieldJobId = table.Column<Guid>(type: "uuid", nullable: false),
                EventType = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                DataJson = table.Column<string>(type: "character varying(32768)", maxLength: 32768, nullable: false),
                CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
            },
            constraints: table => table.PrimaryKey("PK_job_events", x => x.Id));

        migrationBuilder.CreateIndex(
            name: "IX_job_events_BrownfieldJobId_CreatedAt",
            table: "job_events",
            columns: new[] { "BrownfieldJobId", "CreatedAt" });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "job_events");
        migrationBuilder.DropColumn(name: "KeyVaultSecretName", table: "github_connections");
    }
}
