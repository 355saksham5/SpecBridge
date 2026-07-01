using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SpecBridge.Api.Data;

#nullable disable

namespace SpecBridge.Api.Data.Migrations;

[DbContext(typeof(SpecBridgeDbContext))]
[Migration("20260701220000_AddJobBranch")]
public partial class AddJobBranch : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "Branch",
            table: "brownfield_jobs",
            type: "character varying(255)",
            maxLength: 255,
            nullable: false,
            defaultValue: "main");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "Branch", table: "brownfield_jobs");
    }
}
