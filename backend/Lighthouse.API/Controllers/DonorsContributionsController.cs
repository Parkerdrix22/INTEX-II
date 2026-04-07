using Lighthouse.API.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lighthouse.API.Controllers;

[ApiController]
[Route("api/donors-contributions")]
[Authorize(Roles = "Admin,Staff")]
public class DonorsContributionsController(AppDbContext dbContext) : ControllerBase
{
    [HttpGet("dashboard")]
    public async Task<IActionResult> GetDashboard()
    {
        try
        {
            var supporters = await dbContext.Database.SqlQueryRaw<SupporterRow>(
                """
                SELECT
                    s.supporter_id AS "Id",
                    s.display_name AS "DisplayName",
                    s.supporter_type AS "SupporterType",
                    s.status AS "Status",
                    s.created_at AS "CreatedAt"
                FROM lighthouse.supporters s
                ORDER BY s.display_name
                """)
                .ToListAsync();

            var donations = await dbContext.Database.SqlQueryRaw<DonationRow>(
                """
                SELECT
                    d.donation_id AS "Id",
                    d.supporter_id AS "SupporterId",
                    d.donation_type AS "DonationType",
                    d.donation_date AS "DonationDate",
                    d.estimated_value AS "EstimatedValue",
                    d.campaign_name AS "CampaignName"
                FROM lighthouse.donations d
                ORDER BY d.donation_date DESC NULLS LAST
                """)
                .ToListAsync();

            var allocations = await dbContext.Database.SqlQueryRaw<AllocationRow>(
                """
                SELECT
                    da.donation_id AS "DonationId",
                    da.safehouse_id AS "SafehouseId",
                    COALESCE(sh.name, CONCAT('Safehouse #', da.safehouse_id::text)) AS "SafehouseName",
                    da.program_area AS "ProgramArea",
                    da.amount_allocated AS "AmountAllocated"
                FROM lighthouse.donation_allocations da
                LEFT JOIN lighthouse.safehouses sh ON sh.safehouse_id = da.safehouse_id
                """)
                .ToListAsync();

            return Ok(BuildDashboard(supporters, donations, allocations));
        }
        catch
        {
            // Fallback for non-lighthouse local DB shape.
            var supporters = await dbContext.Supporters
                .AsNoTracking()
                .Select(supporter => new SupporterRow
                {
                    Id = supporter.Id,
                    DisplayName = supporter.DisplayName,
                    SupporterType = supporter.SupporterType,
                    Status = supporter.Status,
                    CreatedAt = supporter.CreatedAt,
                })
                .OrderBy(supporter => supporter.DisplayName)
                .ToListAsync();

            var donations = await dbContext.Donations
                .AsNoTracking()
                .Select(donation => new DonationRow
                {
                    Id = donation.Id,
                    SupporterId = donation.SupporterId,
                    DonationType = "Monetary",
                    DonationDate = donation.DonatedAt,
                    EstimatedValue = donation.Amount,
                    CampaignName = donation.CampaignName,
                })
                .OrderByDescending(donation => donation.DonationDate ?? DateTime.MinValue)
                .ToListAsync();

            return Ok(BuildDashboard(supporters, donations, []));
        }
    }

    private static object BuildDashboard(
        IReadOnlyList<SupporterRow> supporters,
        IReadOnlyList<DonationRow> donations,
        IReadOnlyList<AllocationRow> allocations)
    {
        var now = DateTime.UtcNow;
        var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var donationsBySupporter = donations
            .Where(donation => donation.SupporterId.HasValue)
            .GroupBy(donation => donation.SupporterId!.Value)
            .ToDictionary(group => group.Key, group => group.OrderByDescending(item => item.DonationDate ?? DateTime.MinValue).ToList());

        var supporterRows = supporters.Select(supporter =>
        {
            var supporterDonations = donationsBySupporter.GetValueOrDefault(supporter.Id) ?? [];
            var lastDonation = supporterDonations.FirstOrDefault()?.DonationDate;
            return new
            {
                supporter.Id,
                supporter.DisplayName,
                supporter.SupporterType,
                supporter.Status,
                supporter.CreatedAt,
                LastDonationAt = lastDonation,
            };
        }).ToList();

        var contributionRows = donations.Select(donation => new
        {
            donation.Id,
            donation.SupporterId,
            SupporterName = supporterRows.FirstOrDefault(s => s.Id == donation.SupporterId)?.DisplayName ?? "Unknown",
            donation.DonationType,
            donation.DonationDate,
            donation.EstimatedValue,
            donation.CampaignName,
        }).ToList();

        var allocationRows = allocations
            .GroupBy(allocation => allocation.SafehouseName ?? "Unassigned")
            .Select(group =>
            {
                var total = group.Sum(item => item.AmountAllocated ?? 0m);
                var caring = group.Where(item => (item.ProgramArea ?? "").Contains("Caring", StringComparison.OrdinalIgnoreCase)).Sum(item => item.AmountAllocated ?? 0m);
                var healing = group.Where(item => (item.ProgramArea ?? "").Contains("Heal", StringComparison.OrdinalIgnoreCase)).Sum(item => item.AmountAllocated ?? 0m);
                var teaching = group.Where(item => (item.ProgramArea ?? "").Contains("Teach", StringComparison.OrdinalIgnoreCase)).Sum(item => item.AmountAllocated ?? 0m);
                return new
                {
                    Area = group.Key,
                    CaringPct = total > 0 ? Math.Round(caring / total * 100m, 1) : 0,
                    HealingPct = total > 0 ? Math.Round(healing / total * 100m, 1) : 0,
                    TeachingPct = total > 0 ? Math.Round(teaching / total * 100m, 1) : 0,
                };
            })
            .OrderBy(row => row.Area)
            .ToList();

        var activity = contributionRows
            .Where(row => row.DonationDate.HasValue)
            .OrderByDescending(row => row.DonationDate)
            .Take(12)
            .Select(row => new
            {
                At = row.DonationDate,
                Action = "Contribution recorded",
                Details = $"{row.SupporterName} - {row.DonationType} ({row.EstimatedValue ?? 0m:N2})",
            })
            .ToList();

        return new
        {
            Summary = new
            {
                ActiveSupporters = supporterRows.Count(row => string.Equals(row.Status, "Active", StringComparison.OrdinalIgnoreCase)),
                NewThisMonth = supporterRows.Count(row => row.CreatedAt.HasValue && row.CreatedAt.Value >= monthStart),
                ContributionsMtd = donations
                    .Where(row => row.DonationDate.HasValue && row.DonationDate.Value >= monthStart)
                    .Sum(row => row.EstimatedValue ?? 0m),
                TotalContributions = donations.Sum(row => row.EstimatedValue ?? 0m),
            },
            Supporters = supporterRows,
            Contributions = contributionRows.OrderByDescending(row => row.DonationDate ?? DateTime.MinValue).Take(200),
            Allocations = allocationRows,
            Activity = activity,
        };
    }

    private sealed class SupporterRow
    {
        public int Id { get; set; }
        public string DisplayName { get; set; } = string.Empty;
        public string SupporterType { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public DateTime? CreatedAt { get; set; }
    }

    private sealed class DonationRow
    {
        public int Id { get; set; }
        public int? SupporterId { get; set; }
        public string DonationType { get; set; } = string.Empty;
        public DateTime? DonationDate { get; set; }
        public decimal? EstimatedValue { get; set; }
        public string? CampaignName { get; set; }
    }

    private sealed class AllocationRow
    {
        public int DonationId { get; set; }
        public int? SafehouseId { get; set; }
        public string? SafehouseName { get; set; }
        public string? ProgramArea { get; set; }
        public decimal? AmountAllocated { get; set; }
    }
}
