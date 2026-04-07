using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Lighthouse.API.Data;
using Lighthouse.API.Data.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lighthouse.API.Controllers;

[ApiController]
[Route("api/donations")]
[Authorize]
public class DonationsController(AppDbContext dbContext) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> CreateDonation([FromBody] CreateDonationRequest request)
    {
        if (request.Amount <= 0)
            return BadRequest(new { message = "Donation amount must be greater than zero." });

        var donationType = NormalizeDonationType(request.DonationType);
        var frequency = string.IsNullOrWhiteSpace(request.Frequency)
            ? "one-time"
            : request.Frequency.Trim().ToLowerInvariant();
        var campaignName = string.IsNullOrWhiteSpace(request.CampaignName)
            ? "Donor Portal"
            : request.CampaignName.Trim();

        var donationDate = request.DonationDate?.ToUniversalTime() ?? DateTime.UtcNow;
        var currency = string.IsNullOrWhiteSpace(request.Currency) ? "USD" : request.Currency.Trim().ToUpperInvariant();

        int? supporterId = await ResolveSupporterForLighthouseAsync(request.DonorName);

        try
        {
            var newDonationId = await NextLighthouseIdAsync("lighthouse.donations", "donation_id");
            var insertedRows = await dbContext.Database.SqlQueryRaw<InsertedDonationIdRow>(
                """
                INSERT INTO lighthouse.donations
                    (donation_id, supporter_id, donation_type, donation_date, estimated_value, campaign_name)
                VALUES ({0}, {1}, {2}, {3}, {4}, {5})
                RETURNING donation_id AS "Id"
                """,
                newDonationId,
                supporterId,
                donationType,
                donationDate,
                request.Amount,
                campaignName)
                .ToListAsync();
            var insertedId = insertedRows.FirstOrDefault()?.Id ?? 0;

            return Ok(new { message = "Donation recorded successfully.", donationId = insertedId });
        }
        catch
        {
            var donation = new Donation
            {
                SupporterId = supporterId,
                Amount = request.Amount,
                Currency = currency,
                DonatedAt = donationDate,
                CampaignName = campaignName,
            };
            dbContext.Donations.Add(donation);
            await dbContext.SaveChangesAsync();
            return Ok(new { message = "Donation recorded successfully.", donationId = donation.Id });
        }
    }

    private async Task<int?> ResolveSupporterForLighthouseAsync(string? donorName)
    {
        var claimedEmail = User.FindFirstValue(ClaimTypes.Email)?.Trim().ToLowerInvariant();

        if (int.TryParse(User.FindFirstValue("supporter_id"), out var claimedId))
        {
            var existsRows = await dbContext.Database.SqlQueryRaw<InsertedDonationIdRow>(
                """
                SELECT s.supporter_id AS "Id"
                FROM lighthouse.supporters s
                WHERE s.supporter_id = {0}
                LIMIT 1
                """,
                claimedId)
                .ToListAsync();
            if (existsRows.Count > 0) return claimedId;
        }

        if (!string.IsNullOrWhiteSpace(claimedEmail) || !string.IsNullOrWhiteSpace(donorName))
        {
            return await EnsureSupporterAsync(donorName, claimedEmail);
        }

        return null;
    }

    private async Task<int?> EnsureSupporterAsync(string? donorName, string? donorEmail)
    {
        var displayName = string.IsNullOrWhiteSpace(donorName) ? "Donor" : donorName.Trim();
        var email = string.IsNullOrWhiteSpace(donorEmail) ? null : donorEmail.Trim().ToLowerInvariant();

        if (!string.IsNullOrWhiteSpace(email))
        {
            try
            {
                var existingRows = await dbContext.Database.SqlQueryRaw<InsertedDonationIdRow>(
                    """
                    SELECT s.supporter_id AS "Id"
                    FROM lighthouse.supporters s
                    WHERE LOWER(s.email) = {0}
                    LIMIT 1
                    """,
                    email)
                    .ToListAsync();
                var existingId = existingRows.FirstOrDefault()?.Id ?? 0;
                if (existingId > 0) return existingId;
            }
            catch
            {
                var existingLocal = await dbContext.Supporters
                    .Where(supporter => supporter.Email != null && supporter.Email.ToLower() == email)
                    .Select(supporter => supporter.Id)
                    .FirstOrDefaultAsync();
                if (existingLocal > 0) return existingLocal;
            }
        }

        try
        {
            var newSupporterId = await NextLighthouseIdAsync("lighthouse.supporters", "supporter_id");
            var insertedRows = await dbContext.Database.SqlQueryRaw<InsertedDonationIdRow>(
                """
                INSERT INTO lighthouse.supporters
                    (supporter_id, display_name, supporter_type, status, created_at, email)
                VALUES ({0}, {1}, {2}, {3}, {4}, {5})
                RETURNING supporter_id AS "Id"
                """,
                newSupporterId,
                displayName,
                "MonetaryDonor",
                "Active",
                DateTime.UtcNow,
                email)
                .ToListAsync();
            var newId = insertedRows.FirstOrDefault()?.Id ?? 0;
            if (newId > 0) return newId;
            return null;
        }
        catch
        {
            var supporter = new Supporter
            {
                DisplayName = displayName,
                Email = email,
                SupporterType = "MonetaryDonor",
                Status = "Active",
                CreatedAt = DateTime.UtcNow,
            };
            dbContext.Supporters.Add(supporter);
            await dbContext.SaveChangesAsync();
            return supporter.Id;
        }
    }

    private sealed class InsertedDonationIdRow
    {
        public int Id { get; set; }
    }

    private async Task<int> NextLighthouseIdAsync(string tableName, string idColumn)
    {
        var rows = await dbContext.Database.SqlQueryRaw<InsertedDonationIdRow>(
            $"""
            SELECT COALESCE(MAX({idColumn}), 0) + 1 AS "Id"
            FROM {tableName}
            """)
            .ToListAsync();
        return rows.FirstOrDefault()?.Id ?? 1;
    }

    private static string NormalizeDonationType(string? donationType)
    {
        var raw = donationType?.Trim().ToLowerInvariant() ?? "monetary";
        return raw switch
        {
            "inkind" or "in-kind" => "In-kind",
            "time" => "Time",
            "skills" => "Skills",
            _ => "Monetary",
        };
    }
}

public sealed class CreateDonationRequest
{
    [Range(typeof(decimal), "0.01", "1000000000")]
    public decimal Amount { get; set; }
    public string DonationType { get; set; } = "Monetary";
    public string Frequency { get; set; } = "one-time";
    public string Currency { get; set; } = "USD";
    public DateTime? DonationDate { get; set; }
    public string? CampaignName { get; set; }
    public string? DonorName { get; set; }
}
