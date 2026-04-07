using Lighthouse.API.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;

namespace Lighthouse.API.Controllers;

[ApiController]
[Route("api/donors-contributions")]
[Authorize(Roles = "Admin,Staff")]
public class DonorsContributionsController(AppDbContext dbContext) : ControllerBase
{
    [HttpPost("supporters/{supporterId:int}/donations")]
    public async Task<IActionResult> CreateSupporterDonation(int supporterId, [FromBody] CreateSupporterDonationRequest request)
    {
        if (request.EstimatedValue <= 0)
        {
            return BadRequest(new { message = "Donation amount must be greater than zero." });
        }

        var donationDate = request.DonationDate?.ToUniversalTime() ?? DateTime.UtcNow;
        var donationType = string.IsNullOrWhiteSpace(request.DonationType) ? "Monetary" : request.DonationType.Trim();

        try
        {
            var donationId = await NextLighthouseIdAsync("lighthouse.donations", "donation_id");
            await dbContext.Database.ExecuteSqlRawAsync(
                """
                INSERT INTO lighthouse.donations
                    (donation_id, supporter_id, donation_type, donation_date, estimated_value, campaign_name)
                VALUES ({0}, {1}, {2}, {3}, {4}, {5})
                """,
                donationId,
                supporterId,
                donationType,
                donationDate,
                request.EstimatedValue,
                CleanString(request.CampaignName));

            return Ok(new { message = "Donation created successfully.", donationId });
        }
        catch
        {
            var donation = new Data.Entities.Donation
            {
                SupporterId = supporterId,
                Amount = request.EstimatedValue,
                Currency = "PHP",
                DonatedAt = donationDate,
                CampaignName = CleanString(request.CampaignName),
            };
            dbContext.Donations.Add(donation);
            await dbContext.SaveChangesAsync();
            return Ok(new { message = "Donation created successfully.", donationId = donation.Id });
        }
    }

    [HttpGet("supporters/{supporterId:int}/donations")]
    public async Task<IActionResult> GetSupporterDonations(int supporterId)
    {
        try
        {
            var rows = await dbContext.Database.SqlQueryRaw<DonationRow>(
                """
                SELECT
                    d.donation_id AS "Id",
                    d.supporter_id AS "SupporterId",
                    d.donation_type AS "DonationType",
                    d.donation_date AS "DonationDate",
                    d.estimated_value AS "EstimatedValue",
                    d.campaign_name AS "CampaignName"
                FROM lighthouse.donations d
                WHERE d.supporter_id = {0}
                ORDER BY d.donation_date DESC NULLS LAST, d.donation_id DESC
                """,
                supporterId)
                .ToListAsync();
            return Ok(rows);
        }
        catch
        {
            var rows = await dbContext.Donations
                .AsNoTracking()
                .Where(donation => donation.SupporterId == supporterId)
                .OrderByDescending(donation => donation.DonatedAt ?? DateTime.MinValue)
                .Select(donation => new DonationRow
                {
                    Id = donation.Id,
                    SupporterId = donation.SupporterId,
                    DonationType = "Monetary",
                    DonationDate = donation.DonatedAt,
                    EstimatedValue = donation.Amount,
                    CampaignName = donation.CampaignName,
                })
                .ToListAsync();
            return Ok(rows);
        }
    }

    [HttpPut("donations/{donationId:int}")]
    public async Task<IActionResult> UpdateDonation(int donationId, [FromBody] UpdateDonationRequest request)
    {
        if (request.EstimatedValue <= 0)
        {
            return BadRequest(new { message = "Donation amount must be greater than zero." });
        }

        try
        {
            var affected = await dbContext.Database.ExecuteSqlRawAsync(
                """
                UPDATE lighthouse.donations
                SET
                    donation_type = {1},
                    donation_date = {2},
                    estimated_value = {3},
                    campaign_name = {4}
                WHERE donation_id = {0}
                """,
                donationId,
                request.DonationType.Trim(),
                request.DonationDate,
                request.EstimatedValue,
                CleanString(request.CampaignName));

            if (affected == 0) return NotFound(new { message = "Donation not found." });
            return Ok(new { message = "Donation updated successfully." });
        }
        catch
        {
            var donation = await dbContext.Donations.FirstOrDefaultAsync(item => item.Id == donationId);
            if (donation is null) return NotFound(new { message = "Donation not found." });
            donation.Amount = request.EstimatedValue;
            donation.DonatedAt = request.DonationDate;
            donation.CampaignName = CleanString(request.CampaignName);
            await dbContext.SaveChangesAsync();
            return Ok(new { message = "Donation updated successfully." });
        }
    }

    [HttpDelete("donations/{donationId:int}")]
    public async Task<IActionResult> DeleteDonation(int donationId)
    {
        try
        {
            var affected = await dbContext.Database.ExecuteSqlRawAsync(
                """
                DELETE FROM lighthouse.donations
                WHERE donation_id = {0}
                """,
                donationId);

            if (affected == 0) return NotFound(new { message = "Donation not found." });
            return Ok(new { message = "Donation deleted successfully." });
        }
        catch
        {
            var donation = await dbContext.Donations.FirstOrDefaultAsync(item => item.Id == donationId);
            if (donation is null) return NotFound(new { message = "Donation not found." });
            dbContext.Donations.Remove(donation);
            await dbContext.SaveChangesAsync();
            return Ok(new { message = "Donation deleted successfully." });
        }
    }

    [HttpPost("supporters")]
    public async Task<IActionResult> CreateSupporter([FromBody] CreateSupporterRequest request)
    {
        var displayName = CleanString(request.DisplayName);
        var firstName = CleanString(request.FirstName);
        var lastName = CleanString(request.LastName);
        var createdAt = request.CreatedAt ?? DateTime.UtcNow;

        if (string.IsNullOrWhiteSpace(displayName))
        {
            displayName = $"{firstName} {lastName}".Trim();
        }

        if (string.IsNullOrWhiteSpace(displayName))
        {
            return BadRequest(new { message = "Display name is required." });
        }

        try
        {
            var supporterId = await NextLighthouseIdAsync("lighthouse.supporters", "supporter_id");
            await dbContext.Database.ExecuteSqlRawAsync(
                """
                INSERT INTO lighthouse.supporters
                (
                    supporter_id,
                    supporter_type,
                    display_name,
                    organization_name,
                    first_name,
                    last_name,
                    relationship_type,
                    region,
                    country,
                    email,
                    phone,
                    status,
                    created_at,
                    first_donation_date,
                    acquisition_channel
                )
                VALUES
                (
                    {0},
                    {1},
                    {2},
                    {3},
                    {4},
                    {5},
                    {6},
                    {7},
                    {8},
                    {9},
                    {10},
                    {11},
                    {12},
                    {13},
                    {14}
                )
                """,
                supporterId,
                request.SupporterType.Trim(),
                displayName,
                CleanString(request.OrganizationName),
                firstName,
                lastName,
                request.RelationshipType.Trim(),
                request.Region.Trim(),
                request.Country.Trim(),
                CleanString(request.Email),
                CleanString(request.Phone),
                request.Status.Trim(),
                createdAt,
                request.FirstDonationDate,
                request.AcquisitionChannel.Trim());

            return Ok(new { message = "Supporter created successfully.", supporterId });
        }
        catch
        {
            var supporter = new Data.Entities.Supporter
            {
                SupporterType = request.SupporterType.Trim(),
                DisplayName = displayName,
                Email = CleanString(request.Email),
                Status = request.Status.Trim(),
                CreatedAt = createdAt,
            };

            dbContext.Supporters.Add(supporter);
            await dbContext.SaveChangesAsync();
            return Ok(new { message = "Supporter created successfully.", supporterId = supporter.Id });
        }
    }

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
                decimal caring = 0m;
                decimal healing = 0m;
                decimal teaching = 0m;

                foreach (var item in group)
                {
                    var amount = item.AmountAllocated ?? 0m;
                    var area = (item.ProgramArea ?? string.Empty).Trim().ToLowerInvariant();

                    // donation_allocations.csv uses labels like Education, Wellbeing, Transport, Operations.
                    if (area.Contains("teach") || area.Contains("educat") || area.Contains("school") || area.Contains("learning") || area.Contains("training"))
                    {
                        teaching += amount;
                    }
                    else if (area.Contains("heal") || area.Contains("wellbeing") || area.Contains("well-being") || area.Contains("counsel") || area.Contains("health") || area.Contains("medical") || area.Contains("psych"))
                    {
                        healing += amount;
                    }
                    else
                    {
                        // Treat logistics/shelter/operations/etc. as caring support.
                        caring += amount;
                    }
                }

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

    private static string? CleanString(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }

    private async Task<int> NextLighthouseIdAsync(string tableName, string idColumn)
    {
        var rows = await dbContext.Database.SqlQueryRaw<IdRow>(
            $"""
            SELECT COALESCE(MAX({idColumn}), 0) + 1 AS "Id"
            FROM {tableName}
            """)
            .ToListAsync();
        return rows.FirstOrDefault()?.Id ?? 1;
    }

    private sealed class IdRow
    {
        public int Id { get; set; }
    }
}

public sealed class CreateSupporterRequest
{
    [Required]
    [StringLength(60)]
    public string SupporterType { get; set; } = "MonetaryDonor";

    [StringLength(140)]
    public string? DisplayName { get; set; }

    [StringLength(180)]
    public string? OrganizationName { get; set; }

    [StringLength(100)]
    public string? FirstName { get; set; }

    [StringLength(100)]
    public string? LastName { get; set; }

    [Required]
    [StringLength(80)]
    public string RelationshipType { get; set; } = "Local";

    [Required]
    [StringLength(80)]
    public string Region { get; set; } = "Luzon";

    [Required]
    [StringLength(80)]
    public string Country { get; set; } = "Philippines";

    [EmailAddress]
    [StringLength(160)]
    public string? Email { get; set; }

    [StringLength(60)]
    public string? Phone { get; set; }

    [Required]
    [StringLength(40)]
    public string Status { get; set; } = "Active";

    public DateTime? CreatedAt { get; set; }

    public DateTime? FirstDonationDate { get; set; }

    [Required]
    [StringLength(80)]
    public string AcquisitionChannel { get; set; } = "Website";
}

public sealed class UpdateDonationRequest
{
    [Required]
    [StringLength(60)]
    public string DonationType { get; set; } = "Monetary";

    [Range(typeof(decimal), "0.01", "1000000000")]
    public decimal EstimatedValue { get; set; }

    [Required]
    public DateTime DonationDate { get; set; }

    [StringLength(120)]
    public string? CampaignName { get; set; }
}

public sealed class CreateSupporterDonationRequest
{
    [Required]
    [StringLength(60)]
    public string DonationType { get; set; } = "Monetary";

    [Range(typeof(decimal), "0.01", "1000000000")]
    public decimal EstimatedValue { get; set; }

    public DateTime? DonationDate { get; set; }

    [StringLength(120)]
    public string? CampaignName { get; set; }
}
