using Lighthouse.API.Data;

namespace Lighthouse.API.Services;

// =============================================================================
// Need-Based Donation Routing (Pipeline 8)
//
// When a donor gives to a chosen program area, this service decides which
// safehouses receive the funds based on a transparent, data-driven need score:
//
//     need_score(safehouse, area) =
//         0.6 * outcome_deficit(safehouse, area)
//       + 0.4 * funding_deficit(safehouse, area)
//
//   outcome_deficit  — how much WORSE this safehouse's relevant outcome
//                      metric is vs the median across all safehouses
//                      (Wellbeing → avg_health_score, Education →
//                       avg_education_progress, Operations → incident_count).
//                      For program areas without a direct outcome signal
//                      (Transport, Outreach, Maintenance), this term is 0
//                      and funding_deficit gets full weight.
//
//   funding_deficit  — 1 minus this safehouse's share of recent (last 90d)
//                      donations to this area. Safehouses that haven't been
//                      funded recently in this area score higher.
//
// Then 15% of the donation is reserved (10% General Fund + 5% Rainy Day),
// and the remaining 85% is split across the TOP 2 safehouses by need_score
// proportional to their scores. Documented + transparent on the donor form.
// =============================================================================

public sealed class AllocationPlan
{
    public decimal TotalAmount { get; init; }
    public decimal GeneralFundAmount { get; init; }
    public decimal RainyDayAmount { get; init; }
    public string ProgramArea { get; init; } = "";
    public List<SafehouseAllocation> SafehouseAllocations { get; init; } = new();
}

public sealed class SafehouseAllocation
{
    public long SafehouseId { get; init; }
    public string SafehouseName { get; init; } = "";
    public string ProgramArea { get; init; } = "";
    public decimal Amount { get; init; }
    public double NeedScore { get; init; }
}

public interface INeedBasedAllocationService
{
    /// <summary>
    /// Compute the routing plan for a donation. Does NOT write to the
    /// database — that's the controller's responsibility after the donation
    /// row exists.
    /// </summary>
    Task<AllocationPlan> AllocateAsync(
        decimal totalAmount,
        string programArea,
        AppDbContext dbContext,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// The 6 program areas the donor can choose from (matches the existing
    /// values in lighthouse.donation_allocations.program_area).
    /// </summary>
    IReadOnlyList<string> AvailableProgramAreas { get; }

    /// <summary>
    /// Special program area used for the unallocated portion of a gift that
    /// goes to general operating expenses.
    /// </summary>
    public const string GeneralFundLabel = "General Fund";

    /// <summary>
    /// Special program area used for the rainy-day reserve.
    /// </summary>
    public const string RainyDayLabel = "Rainy Day Reserve";

    /// <summary>10% of every donation is reserved for the General Operating Fund.</summary>
    public const decimal GeneralFundFraction = 0.10m;

    /// <summary>5% of every donation is reserved for the Rainy Day Fund.</summary>
    public const decimal RainyDayFraction = 0.05m;
}
