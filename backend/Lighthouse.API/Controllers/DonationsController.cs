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
    IStaffNotificationEmailService staffNotificationEmail,
    INeedBasedAllocationService allocationService,
    IDonationValuationService valuationService) : ControllerBase
{
    // Server-side cap mirroring the donor-portal UI. Anything larger than this
    // requires a human conversation (tax paperwork, compliance review, custom
    // allocation). The UI blocks it first with a modal; this is the backstop.
    private const decimal LargeGiftCapUsd = 5_000_000m;

    /// <summary>Aligned with <c>PROGRAM_AREAS</c> in the donor-portal frontend.</summary>
    private static readonly string[] AllowedDonorProgramAreas =
    [
        "Education", "Wellbeing", "Operations", "Outreach", "Transport", "Maintenance",
    ];

    [HttpPost]
    [Authorize(Roles = $"{UserRoles.Admin},{UserRoles.Staff},{UserRoles.Donor}")]
    public async Task<IActionResult> CreateDonation([FromBody] CreateDonationRequest request)
    {
        if (request.Amount <= 0)
            return BadRequest(new { message = "Donation amount must be greater than zero." });

        await ApplyDonorSelfServiceGuardsAsync(request);

        var frequency = string.IsNullOrWhiteSpace(request.Frequency)
            ? "one-time"
            : request.Frequency.Trim().ToLowerInvariant();
        var campaignName = string.IsNullOrWhiteSpace(request.CampaignName)
            ? "Donor Portal"
            : request.CampaignName.Trim();

        var donationDate = request.DonationDate?.ToUniversalTime() ?? DateTime.UtcNow;
        var currency = string.IsNullOrWhiteSpace(request.Currency) ? "USD" : request.Currency.Trim().ToUpperInvariant();

        // Convert raw donor input → canonical type, impact_unit, and estimated $ value.
        // Time → hours × $33.49; Skills/SocialMedia → hours × empirical median rate;
        // InKind → 1:1 fair-market USD; Monetary → 1:1.
        var valuation = await valuationService.ValueDonationAsync(
            request.DonationType,
            request.Amount,
            dbContext);

        // Server-side cap on the estimated dollar value (post-valuation). This
        // catches any gift that slips past the UI, including Time/Skills where
        // a huge hour count could translate into millions of dollars.
        if (valuation.EstimatedValue > LargeGiftCapUsd)
        {
            return StatusCode(
                StatusCodes.Status403Forbidden,
                new
                {
                    message =
                        $"Donations above {LargeGiftCapUsd:C0} (USD estimated value) require a staff " +
                        "conversation. Please contact giving@kateri.byuisresearch.com and we will be in " +
                        "touch within one business day.",
                    capUsd = LargeGiftCapUsd,
                    estimatedValue = valuation.EstimatedValue,
                });
        }

        int? supporterId = null;
        if (valuation.CanonicalType == "Monetary")
        {
            supporterId = await ResolveSupporterForLighthouseAsync(request.DonorName);
            var deny = await VerifyDonorSupporterLinkAsync(supporterId);
            if (deny is not null) return deny;
        }

        try
        {
            var newDonationId = await NextLighthouseIdAsync("lighthouse.donations", "donation_id");
            var insertedRows = await dbContext.Database.SqlQueryRaw<InsertedDonationIdRow>(
                """
                INSERT INTO lighthouse.donations
                    (donation_id, supporter_id, donation_type, donation_date,
                     amount, estimated_value, currency_code, impact_unit, campaign_name)
                VALUES ({0}, {1}, {2}, {3}, {4}, {5}, {6}, {7}, {8})
                RETURNING donation_id AS "Id"
                """,
                newDonationId,
                supporterId,
                valuation.CanonicalType,
                donationDate,
                valuation.RawAmount,        // raw quantity (hours, items, campaigns, USD)
                valuation.EstimatedValue,   // dollar equivalent
                currency,
                valuation.ImpactUnit,       // hours / items / campaigns / USD
                campaignName)
                .ToListAsync();
            var insertedId = insertedRows.FirstOrDefault()?.Id ?? 0;

            // ---- Pipeline 8: Need-Based Donation Routing -----------------------
            // Allocate based on the DOLLAR value, not the raw count.
            var allocationPlan = await allocationService.AllocateAsync(
                valuation.EstimatedValue,
                request.ProgramArea ?? "Operations",
                dbContext);
            await WriteAllocationRowsAsync(insertedId, donationDate, allocationPlan);

            await NotifyDonationEmailsAsync(request, currency, donationDate);
            return Ok(new
            {
                message = "Donation recorded successfully.",
                donationId = insertedId,
                valuation,
                allocation = allocationPlan
            });
        }
        catch
        {
            // EF fallback path: use the dollar-equivalent value, not the raw count.
            var donation = new Donation
            {
                SupporterId = supporterId,
                Amount = valuation.EstimatedValue,
                Currency = currency,
                DonatedAt = donationDate,
                CampaignName = campaignName,
            };
            dbContext.Donations.Add(donation);
            await dbContext.SaveChangesAsync();
            await NotifyDonationEmailsAsync(request, currency, donationDate);
            return Ok(new { message = "Donation recorded successfully.", donationId = donation.Id });
        }
    }

    [HttpPost("in-kind")]
    [Authorize(Roles = $"{UserRoles.Admin},{UserRoles.Staff},{UserRoles.Donor}")]
    public async Task<IActionResult> CreateInKindDonation(
        [FromBody] CreateInKindDonationRequest request,
        CancellationToken cancellationToken)
    {
        if (request.Quantity < 1)
            return BadRequest(new { message = "Quantity must be at least 1." });
        if (request.EstimatedTotalValue <= 0)
            return BadRequest(new { message = "Estimated value must be greater than zero." });

        await ApplyDonorSelfServiceGuardsAsync(request);

        // Same large-gift backstop as the monetary endpoint.
        if (request.EstimatedTotalValue > LargeGiftCapUsd)
        {
            return StatusCode(
                StatusCodes.Status403Forbidden,
                new
                {
                    message =
                        $"In-kind donations above {LargeGiftCapUsd:C0} (USD estimated value) require a " +
                        "staff conversation. Please contact giving@kateri.byuisresearch.com and we will " +
                        "be in touch within one business day.",
                    capUsd = LargeGiftCapUsd,
                    estimatedValue = request.EstimatedTotalValue,
                });
        }

        var itemName = request.ItemName.Trim();
        if (string.IsNullOrWhiteSpace(itemName))
            return BadRequest(new { message = "Item name is required." });

        var campaignName = string.IsNullOrWhiteSpace(request.CampaignName)
            ? "Donor Portal"
            : request.CampaignName.Trim();
        var donationDate = request.DonationDate?.ToUniversalTime() ?? DateTime.UtcNow;
        var currency = string.IsNullOrWhiteSpace(request.Currency) ? "USD" : request.Currency.Trim().ToUpperInvariant();

        var supporterId = await ResolveSupporterForLighthouseAsync(request.DonorName);
        var denyInKind = await VerifyDonorSupporterLinkAsync(supporterId);
        if (denyInKind is not null) return denyInKind;

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
            if (string.IsNullOrWhiteSpace(donorEmail))
                donorEmail = user?.Email?.Trim() ?? string.Empty;
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

        await staffNotificationEmail.SendDonationReceiptAsync(
            donorName,
            donorEmail,
            request.EstimatedTotalValue,
            currency,
            "In-kind (goods)",
            campaignName,
            donationDate,
            details,
            cancellationToken);

        return Ok(new { message = "In-kind donation recorded successfully.", donationId = recordedDonationId });
    }

    /// <summary>
    /// Donors using the public portal may only record gifts for themselves. Staff/Admin may
    /// supply donor attribution when entering pledges on behalf of someone else.
    /// </summary>
    private static bool IsDonorSelfServiceUser(ClaimsPrincipal user) =>
        user.IsInRole(UserRoles.Donor)
        && !user.IsInRole(UserRoles.Admin)
        && !user.IsInRole(UserRoles.Staff);

    private static string CanonicalProgramAreaForDonor(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return "Operations";
        var t = raw.Trim();
        foreach (var area in AllowedDonorProgramAreas)
        {
            if (area.Equals(t, StringComparison.OrdinalIgnoreCase)) return area;
        }

        return "Operations";
    }

    private static string DisplayNameForUser(AppUser user)
    {
        var name = $"{user.FirstName} {user.LastName}".Trim();
        return string.IsNullOrWhiteSpace(name) ? (user.Email?.Trim() ?? "Donor") : name;
    }

    private async Task ApplyDonorSelfServiceGuardsAsync(CreateDonationRequest request)
    {
        if (!IsDonorSelfServiceUser(User)) return;

        var user = await userManager.GetUserAsync(User);
        if (user is null) return;

        request.DonorName = DisplayNameForUser(user);
        request.CampaignName = "Donor Portal";
        request.Frequency = "one-time";
        request.ProgramArea = CanonicalProgramAreaForDonor(request.ProgramArea);
    }

    private async Task ApplyDonorSelfServiceGuardsAsync(CreateInKindDonationRequest request)
    {
        if (!IsDonorSelfServiceUser(User)) return;

        var user = await userManager.GetUserAsync(User);
        if (user is null) return;

        request.DonorName = DisplayNameForUser(user);
        request.CampaignName = "Donor Portal";
    }

    /// <summary>
    /// If the account is linked to a supporter row, monetary/in-kind gifts must resolve to that same id
    /// (prevents tampering with donor_name to attach gifts to another supporter).
    /// </summary>
    private async Task<IActionResult?> VerifyDonorSupporterLinkAsync(int? resolvedSupporterId)
    {
        if (!IsDonorSelfServiceUser(User)) return null;

        var user = await userManager.GetUserAsync(User);
        if (user?.SupporterId is not int expectedId) return null;

        if (resolvedSupporterId is not int resolvedId || resolvedId != expectedId)
        {
            return StatusCode(
                StatusCodes.Status403Forbidden,
                new { message = "This gift could not be linked to your supporter profile. Contact staff for help." });
        }

        return null;
    }

    private async Task NotifyDonationEmailsAsync(CreateDonationRequest request, string currency, DateTime donationDateUtc)
    {
        var donorEmail = User.FindFirstValue(ClaimTypes.Email) ?? string.Empty;
        var donorName = string.IsNullOrWhiteSpace(request.DonorName) ? "Donor" : request.DonorName.Trim();
        var donationType = NormalizeDonationType(request.DonationType);
        string? donorPhone = null;
        var userId = User.FindFirstValue("user_id");
        if (!string.IsNullOrWhiteSpace(userId))
        {
            var user = await userManager.FindByIdAsync(userId);
            if (string.IsNullOrWhiteSpace(donorEmail))
                donorEmail = user?.Email?.Trim() ?? string.Empty;
            donorPhone = user?.PhoneNumber;
        }

        await staffNotificationEmail.SendDonationNotificationAsync(
            donorName,
            donorEmail,
            donorPhone,
            request.Amount,
            currency,
            donationType,
            string.IsNullOrWhiteSpace(request.CampaignName) ? "Donor Portal" : request.CampaignName.Trim(),
            donationDateUtc);

        await staffNotificationEmail.SendDonationReceiptAsync(
            donorName,
            donorEmail,
            request.Amount,
            currency,
            donationType,
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

    /// <summary>
    /// Write a row in lighthouse.donation_allocations for each piece of the
    /// allocation plan: the top-N safehouses (by need score), the General Fund,
    /// and the Rainy Day Reserve. The General Fund + Rainy Day rows have
    /// safehouse_id = NULL since they don't go to a specific safehouse.
    /// </summary>
    private async Task WriteAllocationRowsAsync(
        int donationId,
        DateTime donationDate,
        AllocationPlan plan)
    {
        if (donationId <= 0) return;

        var allocationDate = DateOnly.FromDateTime(donationDate);

        foreach (var sa in plan.SafehouseAllocations)
        {
            if (sa.Amount <= 0) continue;
            await dbContext.Database.ExecuteSqlRawAsync(
                """
                INSERT INTO lighthouse.donation_allocations
                    (donation_id, safehouse_id, program_area, amount_allocated, allocation_date, allocation_notes)
                VALUES ({0}, {1}, {2}, {3}, {4}, {5})
                """,
                donationId,
                sa.SafehouseId,
                sa.ProgramArea,
                sa.Amount,
                allocationDate,
                $"Auto-routed by need score = {sa.NeedScore:F4}");
        }

        if (plan.GeneralFundAmount > 0)
        {
            await dbContext.Database.ExecuteSqlRawAsync(
                """
                INSERT INTO lighthouse.donation_allocations
                    (donation_id, safehouse_id, program_area, amount_allocated, allocation_date, allocation_notes)
                VALUES ({0}, NULL, {1}, {2}, {3}, {4})
                """,
                donationId,
                INeedBasedAllocationService.GeneralFundLabel,
                plan.GeneralFundAmount,
                allocationDate,
                "10% reserve for general operating expenses");
        }

        if (plan.RainyDayAmount > 0)
        {
            await dbContext.Database.ExecuteSqlRawAsync(
                """
                INSERT INTO lighthouse.donation_allocations
                    (donation_id, safehouse_id, program_area, amount_allocated, allocation_date, allocation_notes)
                VALUES ({0}, NULL, {1}, {2}, {3}, {4})
                """,
                donationId,
                INeedBasedAllocationService.RainyDayLabel,
                plan.RainyDayAmount,
                allocationDate,
                "5% reserve for emergencies");
        }
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
    [StringLength(40)]
    public string? ProgramArea { get; set; }
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
