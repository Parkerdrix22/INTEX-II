using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Lighthouse.API.Data;
using Lighthouse.API.Data.Entities;
using Lighthouse.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lighthouse.API.Controllers;

[ApiController]
[Route("api/donations")]
[Authorize]
public class DonationsController(
    AppDbContext dbContext,
    UserManager<AppUser> userManager,
    IStaffNotificationEmailService staffNotificationEmail) : ControllerBase
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

        int? supporterId = donationType == "Monetary"
            ? await ResolveSupporterForLighthouseAsync(request.DonorName)
            : null;

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

            await NotifyStaffDonationAsync(request, currency, donationDate);
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
            await NotifyStaffDonationAsync(request, currency, donationDate);
            return Ok(new { message = "Donation recorded successfully.", donationId = donation.Id });
        }
    }

    [HttpPost("in-kind")]
    public async Task<IActionResult> CreateInKindDonation(
        [FromBody] CreateInKindDonationRequest request,
        CancellationToken cancellationToken)
    {
        if (request.Quantity < 1)
            return BadRequest(new { message = "Quantity must be at least 1." });
        if (request.EstimatedTotalValue <= 0)
            return BadRequest(new { message = "Estimated value must be greater than zero." });

        var itemName = request.ItemName.Trim();
        if (string.IsNullOrWhiteSpace(itemName))
            return BadRequest(new { message = "Item name is required." });

        var campaignName = string.IsNullOrWhiteSpace(request.CampaignName)
            ? "Donor Portal"
            : request.CampaignName.Trim();
        var donationDate = request.DonationDate?.ToUniversalTime() ?? DateTime.UtcNow;
        var currency = string.IsNullOrWhiteSpace(request.Currency) ? "USD" : request.Currency.Trim().ToUpperInvariant();

        var supporterId = await ResolveSupporterForLighthouseAsync(request.DonorName);
        var unitValue = Math.Round(request.EstimatedTotalValue / request.Quantity, 4, MidpointRounding.AwayFromZero);

        var itemCategory = request.ItemCategory.Trim();
        var unitOfMeasure = request.UnitOfMeasure.Trim();
        var intendedUse = request.IntendedUse.Trim();
        var receivedCondition = request.ReceivedCondition.Trim();

        var recordedDonationId = 0;
        await using var tx = await dbContext.Database.BeginTransactionAsync(cancellationToken);
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
                "In-kind",
                donationDate,
                request.EstimatedTotalValue,
                campaignName)
                .ToListAsync(cancellationToken);
            var donationId = insertedRows.FirstOrDefault()?.Id ?? 0;
            if (donationId == 0)
            {
                await tx.RollbackAsync(cancellationToken);
                return Problem("Could not record in-kind donation.");
            }

            var newItemId = await NextLighthouseIdAsync("lighthouse.in_kind_donation_items", "item_id");
            var itemAffected = await dbContext.Database.ExecuteSqlRawAsync(
                """
                INSERT INTO lighthouse.in_kind_donation_items
                    (item_id, donation_id, item_name, item_category, quantity, unit_of_measure, estimated_unit_value, intended_use, received_condition)
                VALUES ({0}, {1}, {2}, {3}, {4}, {5}, {6}, {7}, {8})
                """,
                new object[]
                {
                    newItemId,
                    donationId,
                    itemName,
                    itemCategory,
                    request.Quantity,
                    unitOfMeasure,
                    unitValue,
                    intendedUse,
                    receivedCondition,
                },
                cancellationToken);

            if (itemAffected == 0)
            {
                await tx.RollbackAsync(cancellationToken);
                return Problem("Could not record in-kind item.");
            }

            recordedDonationId = donationId;
            await tx.CommitAsync(cancellationToken);
        }
        catch (Exception)
        {
            await tx.RollbackAsync(cancellationToken);
            throw;
        }

        var donorName = string.IsNullOrWhiteSpace(request.DonorName) ? "Donor" : request.DonorName.Trim();
        var donorEmail = User.FindFirstValue(ClaimTypes.Email) ?? string.Empty;
        string? donorPhone = null;
        var userId = User.FindFirstValue("user_id");
        if (!string.IsNullOrWhiteSpace(userId))
        {
            var user = await userManager.FindByIdAsync(userId);
            donorPhone = user?.PhoneNumber;
        }

        var details =
            $"Item: {itemName}\nCategory: {itemCategory}\nQuantity: {request.Quantity} {unitOfMeasure}\nEst. value (total): {request.EstimatedTotalValue:N2} {currency}\nEst. unit value: {unitValue:N2} {currency}\nIntended use: {intendedUse}\nReceived condition: {receivedCondition}";

        await staffNotificationEmail.SendDonationNotificationAsync(
            donorName,
            donorEmail,
            donorPhone,
            request.EstimatedTotalValue,
            currency,
            "In-kind (goods)",
            campaignName,
            donationDate,
            details,
            cancellationToken);

        return Ok(new { message = "In-kind donation recorded successfully.", donationId = recordedDonationId });
    }

    private async Task NotifyStaffDonationAsync(CreateDonationRequest request, string currency, DateTime donationDateUtc)
    {
        var donorEmail = User.FindFirstValue(ClaimTypes.Email) ?? string.Empty;
        var donorName = string.IsNullOrWhiteSpace(request.DonorName) ? "Donor" : request.DonorName.Trim();
        string? donorPhone = null;
        var userId = User.FindFirstValue("user_id");
        if (!string.IsNullOrWhiteSpace(userId))
        {
            var user = await userManager.FindByIdAsync(userId);
            donorPhone = user?.PhoneNumber;
        }

        await staffNotificationEmail.SendDonationNotificationAsync(
            donorName,
            donorEmail,
            donorPhone,
            request.Amount,
            currency,
            NormalizeDonationType(request.DonationType),
            string.IsNullOrWhiteSpace(request.CampaignName) ? "Donor Portal" : request.CampaignName.Trim(),
            donationDateUtc);
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
    [StringLength(40)]
    public string DonationType { get; set; } = "Monetary";
    [StringLength(20)]
    public string Frequency { get; set; } = "one-time";
    [StringLength(8)]
    public string Currency { get; set; } = "USD";
    public DateTime? DonationDate { get; set; }
    [StringLength(120)]
    public string? CampaignName { get; set; }
    [StringLength(120)]
    public string? DonorName { get; set; }
}

public sealed class CreateInKindDonationRequest
{
    [Required]
    [StringLength(200)]
    public string ItemName { get; set; } = string.Empty;

    [Required]
    [StringLength(80)]
    public string ItemCategory { get; set; } = string.Empty;

    [Range(1, long.MaxValue)]
    public long Quantity { get; set; }

    [Required]
    [StringLength(40)]
    public string UnitOfMeasure { get; set; } = string.Empty;

    [Range(typeof(decimal), "0.01", "1000000000")]
    public decimal EstimatedTotalValue { get; set; }

    [Required]
    [StringLength(80)]
    public string IntendedUse { get; set; } = string.Empty;

    [Required]
    [StringLength(40)]
    public string ReceivedCondition { get; set; } = string.Empty;

    [StringLength(8)]
    public string Currency { get; set; } = "USD";

    public DateTime? DonationDate { get; set; }

    [StringLength(120)]
    public string? CampaignName { get; set; }

    [StringLength(120)]
    public string? DonorName { get; set; }
}
