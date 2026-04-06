using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Lighthouse.API.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "donations",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    SupporterId = table.Column<int>(type: "integer", nullable: true),
                    Amount = table.Column<decimal>(type: "numeric", nullable: false),
                    Currency = table.Column<string>(type: "text", nullable: false),
                    DonatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CampaignName = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_donations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "home_visitations",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ResidentId = table.Column<int>(type: "integer", nullable: false),
                    VisitDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    VisitType = table.Column<string>(type: "text", nullable: false),
                    Observations = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_home_visitations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "partners",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    PartnerName = table.Column<string>(type: "text", nullable: false),
                    PartnerType = table.Column<string>(type: "text", nullable: false),
                    Email = table.Column<string>(type: "text", nullable: true),
                    Status = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_partners", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "process_recordings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ResidentId = table.Column<int>(type: "integer", nullable: false),
                    SessionDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    SessionType = table.Column<string>(type: "text", nullable: false),
                    EmotionalState = table.Column<string>(type: "text", nullable: true),
                    NarrativeSummary = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_process_recordings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "public_impact_snapshots",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    SnapshotDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ResidentsServed = table.Column<int>(type: "integer", nullable: false),
                    DonationsReceived = table.Column<decimal>(type: "numeric", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_public_impact_snapshots", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "residents",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    CaseControlNo = table.Column<string>(type: "text", nullable: false),
                    CaseStatus = table.Column<string>(type: "text", nullable: false),
                    SafehouseId = table.Column<int>(type: "integer", nullable: true),
                    AssignedSocialWorker = table.Column<string>(type: "text", nullable: true),
                    DateAdmitted = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DateClosed = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_residents", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "safehouses",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Region = table.Column<string>(type: "text", nullable: true),
                    Status = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_safehouses", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "supporters",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    SupporterType = table.Column<string>(type: "text", nullable: false),
                    DisplayName = table.Column<string>(type: "text", nullable: false),
                    Email = table.Column<string>(type: "text", nullable: true),
                    Status = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_supporters", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "donations");

            migrationBuilder.DropTable(
                name: "home_visitations");

            migrationBuilder.DropTable(
                name: "partners");

            migrationBuilder.DropTable(
                name: "process_recordings");

            migrationBuilder.DropTable(
                name: "public_impact_snapshots");

            migrationBuilder.DropTable(
                name: "residents");

            migrationBuilder.DropTable(
                name: "safehouses");

            migrationBuilder.DropTable(
                name: "supporters");
        }
    }
}
