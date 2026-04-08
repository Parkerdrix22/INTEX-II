using Lighthouse.API.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Lighthouse.API.Services;

public sealed class DonationValuationService : IDonationValuationService
{
    // Hardcoded fallbacks if the database is empty (matches the medians I
    // observed in the seed data on 2026-04-07).
    private const decimal SkillsRateFallback = 11.51m;
    private const decimal SocialMediaRateFallback = 5.92m;

    public async Task<DonationValuation> ValueDonationAsync(
        string donationType,
        decimal rawAmount,
        AppDbContext dbContext,
        CancellationToken cancellationToken = default)
    {
        // Normalize the type into a canonical value that matches the
        // predominant convention in lighthouse.donations.donation_type
        // (i.e., "InKind", not "In-kind", since 98 of 99 seed rows use no hyphen).
        var canonicalType = NormalizeType(donationType);

        switch (canonicalType)
        {
            case "Monetary":
                return new DonationValuation
                {
                    CanonicalType = "Monetary",
                    ImpactUnit = "USD",
                    RawAmount = rawAmount,
                    EstimatedValue = rawAmount,
                    RatePerUnit = 1m,
                    RateSource = "1:1 USD",
                };

            case "Time":
                return new DonationValuation
                {
                    CanonicalType = "Time",
                    ImpactUnit = "hours",
                    RawAmount = rawAmount,
                    EstimatedValue = Math.Round(rawAmount * IDonationValuationService.VolunteerHourRate, 2),
                    RatePerUnit = IDonationValuationService.VolunteerHourRate,
                    RateSource = "Independent Sector 2024 Value of Volunteer Time ($33.49/hour)",
                };

            case "Skills":
            {
                var rate = await GetMedianRateAsync("Skills", SkillsRateFallback, dbContext, cancellationToken);
                return new DonationValuation
                {
                    CanonicalType = "Skills",
                    ImpactUnit = "hours",
                    RawAmount = rawAmount,
                    EstimatedValue = Math.Round(rawAmount * rate, 2),
                    RatePerUnit = rate,
                    RateSource = $"Median historical Skills donation value (${rate:F2}/hour)",
                };
            }

            case "InKind":
                return new DonationValuation
                {
                    CanonicalType = "InKind",
                    ImpactUnit = "items",
                    RawAmount = rawAmount,
                    EstimatedValue = rawAmount,  // donor enters fair market value directly
                    RatePerUnit = 1m,
                    RateSource = "Donor-entered fair market value (1:1 USD)",
                };

            case "SocialMedia":
            {
                var rate = await GetMedianRateAsync("SocialMedia", SocialMediaRateFallback, dbContext, cancellationToken);
                return new DonationValuation
                {
                    CanonicalType = "SocialMedia",
                    ImpactUnit = "campaigns",
                    RawAmount = rawAmount,
                    EstimatedValue = Math.Round(rawAmount * rate, 2),
                    RatePerUnit = rate,
                    RateSource = $"Median historical SocialMedia donation value (${rate:F2}/campaign)",
                };
            }

            default:
                // Unknown type: treat as monetary, no conversion
                return new DonationValuation
                {
                    CanonicalType = canonicalType,
                    ImpactUnit = "USD",
                    RawAmount = rawAmount,
                    EstimatedValue = rawAmount,
                    RatePerUnit = 1m,
                    RateSource = $"Unknown donation type '{canonicalType}', treated as 1:1",
                };
        }
    }

    /// <summary>
    /// Compute the median estimated_value for a given donation type, using
    /// PostgreSQL's PERCENTILE_CONT. Falls back to the documented default
    /// rate if the table has no rows of this type.
    /// </summary>
    private static async Task<decimal> GetMedianRateAsync(
        string donationType,
        decimal fallback,
        AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        try
        {
            var connectionString = dbContext.Database.GetConnectionString()!;
            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(cancellationToken);

            await using var cmd = new NpgsqlCommand(@"
                SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY estimated_value)::float8
                FROM lighthouse.donations
                WHERE donation_type = @t AND estimated_value IS NOT NULL", conn);
            cmd.Parameters.AddWithValue("t", donationType);

            var result = await cmd.ExecuteScalarAsync(cancellationToken);
            if (result is null or DBNull) return fallback;

            var median = Convert.ToDecimal(result);
            return median > 0 ? Math.Round(median, 2) : fallback;
        }
        catch
        {
            return fallback;
        }
    }

    /// <summary>
    /// Normalize whatever the form sends into one of the canonical values
    /// that match the predominant convention in lighthouse.donations.
    /// </summary>
    private static string NormalizeType(string? raw)
    {
        var s = raw?.Trim().ToLowerInvariant() ?? "monetary";
        return s switch
        {
            "monetary" or "money" or "cash" => "Monetary",
            "time" or "volunteer" => "Time",
            "skills" or "skilled" => "Skills",
            "inkind" or "in-kind" or "in kind" => "InKind",
            "socialmedia" or "social-media" or "social media" => "SocialMedia",
            _ => "Monetary",
        };
    }
}
