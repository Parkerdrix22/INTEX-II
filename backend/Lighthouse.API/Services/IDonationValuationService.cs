using Lighthouse.API.Data;

namespace Lighthouse.API.Services;

// =============================================================================
// DonationValuationService
//
// Converts a raw "amount" entered on the donate form into an estimated dollar
// value (`estimated_value`) for non-monetary donation types. Different types
// use different unit conventions:
//
//   Monetary    → amount is already USD               (1:1)
//   Time        → amount is hours; valued at $33.49   (Independent Sector 2024)
//   Skills      → amount is hours; valued at MEDIAN historical Skills value
//                 from lighthouse.donations (currently ~$11.51)
//   InKind      → amount is fair-market USD entered by the donor (1:1)
//   SocialMedia → amount is campaigns; valued at MEDIAN historical
//                 SocialMedia value (currently ~$5.92)
//
// Skills and SocialMedia rates are computed from the database on service
// construction so they self-update as the org's data grows. They fall back
// to documented defaults if the table is empty.
// =============================================================================

public sealed class DonationValuation
{
    public string CanonicalType { get; init; } = "";   // Monetary | Time | Skills | InKind | SocialMedia
    public string ImpactUnit { get; init; } = "";      // pesos | hours | items | campaigns
    public decimal RawAmount { get; init; }            // what the donor typed
    public decimal EstimatedValue { get; init; }       // computed dollar equivalent
    public decimal RatePerUnit { get; init; }          // the multiplier used
    public string RateSource { get; init; } = "";     // human-readable explanation
}

public interface IDonationValuationService
{
    /// <summary>
    /// Convert a raw donor input into a canonical DonationValuation. The
    /// donate-form controllers should call this BEFORE inserting into
    /// lighthouse.donations so estimated_value, amount, and impact_unit are
    /// all consistent.
    /// </summary>
    Task<DonationValuation> ValueDonationAsync(
        string donationType,
        decimal rawAmount,
        AppDbContext dbContext,
        CancellationToken cancellationToken = default);

    /// <summary>The fixed rate for general volunteer time, in USD per hour.</summary>
    public const decimal VolunteerHourRate = 33.49m;
}
