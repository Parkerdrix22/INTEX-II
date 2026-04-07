using Lighthouse.API.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Lighthouse.API.Services;

// Pipeline 8 implementation. See INeedBasedAllocationService for the algorithm.
public sealed class NeedBasedAllocationService : INeedBasedAllocationService
{
    // The 6 program areas that exist in lighthouse.donation_allocations
    private static readonly string[] _availableProgramAreas =
    [
        "Education", "Wellbeing", "Operations", "Outreach", "Transport", "Maintenance"
    ];

    public IReadOnlyList<string> AvailableProgramAreas => _availableProgramAreas;

    // Outcome metric mapping. NULL means "no direct outcome signal — fall back
    // to funding deficit only" (e.g. Maintenance, Transport, Outreach).
    private static readonly Dictionary<string, OutcomeMapping?> _outcomeMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Wellbeing"] = new OutcomeMapping("avg_health_score", false),
        ["Education"] = new OutcomeMapping("avg_education_progress", false),
        ["Operations"] = new OutcomeMapping("incident_count", true),
    };

    private record OutcomeMapping(string ColumnName, bool HigherIsMoreNeed);

    public async Task<AllocationPlan> AllocateAsync(
        decimal totalAmount,
        string programArea,
        AppDbContext dbContext,
        CancellationToken cancellationToken = default)
    {
        if (totalAmount <= 0)
        {
            return new AllocationPlan { TotalAmount = totalAmount, ProgramArea = programArea };
        }

        // Normalize the program area to one of the supported values; default to a sensible bucket.
        var normalizedArea = _availableProgramAreas.FirstOrDefault(
            a => string.Equals(a, programArea, StringComparison.OrdinalIgnoreCase)) ?? "Operations";

        var connectionString = dbContext.Database.GetConnectionString()!;
        await using var conn = new NpgsqlConnection(connectionString);
        await conn.OpenAsync(cancellationToken);

        // ---- Step 1: Load every safehouse + most-recent outcome value -----------
        var safehouses = new List<SafehouseRow>();
        var outcomeMap = _outcomeMap.GetValueOrDefault(normalizedArea);

        if (outcomeMap != null)
        {
            // Pull the latest non-null outcome value per safehouse
            var sql = $@"
                SELECT s.safehouse_id, s.name,
                       (
                         SELECT m.{outcomeMap.ColumnName}::float8
                         FROM lighthouse.safehouse_monthly_metrics m
                         WHERE m.safehouse_id = s.safehouse_id
                           AND m.{outcomeMap.ColumnName} IS NOT NULL
                         ORDER BY m.month_start DESC
                         LIMIT 1
                       ) AS outcome_value
                FROM lighthouse.safehouses s
                ORDER BY s.safehouse_id";
            await using var cmd = new NpgsqlCommand(sql, conn);
            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                safehouses.Add(new SafehouseRow
                {
                    Id = reader.GetInt64(0),
                    Name = reader.IsDBNull(1) ? "" : reader.GetString(1),
                    OutcomeValue = reader.IsDBNull(2) ? null : reader.GetDouble(2),
                });
            }
        }
        else
        {
            // No outcome metric — just load names
            await using var cmd = new NpgsqlCommand(
                "SELECT safehouse_id, name FROM lighthouse.safehouses ORDER BY safehouse_id", conn);
            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                safehouses.Add(new SafehouseRow
                {
                    Id = reader.GetInt64(0),
                    Name = reader.IsDBNull(1) ? "" : reader.GetString(1),
                    OutcomeValue = null,
                });
            }
        }

        if (safehouses.Count == 0)
        {
            // Degenerate case — no safehouses exist; just split into general/rainy day.
            return BuildPlanWithoutSafehouses(totalAmount, normalizedArea);
        }

        // ---- Step 2: Outcome deficit ---------------------------------------------
        // For unknown safehouses, substitute the median (treat as average need).
        if (outcomeMap != null)
        {
            var withValues = safehouses.Where(s => s.OutcomeValue.HasValue).Select(s => s.OutcomeValue!.Value).ToList();
            double median = withValues.Count > 0 ? Median(withValues) : 0;

            foreach (var sh in safehouses)
            {
                var value = sh.OutcomeValue ?? median;
                if (outcomeMap.HigherIsMoreNeed)
                {
                    // incidents: higher = more need
                    sh.OutcomeDeficit = median <= 0 ? 0 : Math.Clamp((value - median) / Math.Max(median, 1.0), 0.0, 1.0);
                }
                else
                {
                    // health/education: lower = more need
                    sh.OutcomeDeficit = median <= 0 ? 0 : Math.Clamp((median - value) / Math.Max(median, 0.01), 0.0, 1.0);
                }
            }
        }

        // ---- Step 3: Funding deficit (last 90 days) ------------------------------
        var ninetyDaysAgo = DateTime.UtcNow.AddDays(-90);
        await using (var cmd = new NpgsqlCommand(@"
            SELECT da.safehouse_id, COALESCE(SUM(da.amount_allocated), 0)::float8 AS recent_funding
            FROM lighthouse.donation_allocations da
            WHERE da.program_area = @area
              AND da.allocation_date >= @since
              AND da.safehouse_id IS NOT NULL
            GROUP BY da.safehouse_id", conn))
        {
            cmd.Parameters.AddWithValue("area", normalizedArea);
            cmd.Parameters.AddWithValue("since", DateOnly.FromDateTime(ninetyDaysAgo));
            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var sid = reader.GetInt64(0);
                var amount = reader.GetDouble(1);
                var match = safehouses.FirstOrDefault(s => s.Id == sid);
                if (match != null) match.RecentFunding = amount;
            }
        }

        var maxRecentFunding = safehouses.Max(s => s.RecentFunding);
        foreach (var sh in safehouses)
        {
            sh.FundingDeficit = maxRecentFunding <= 0
                ? 1.0  // Nobody got funded recently → everyone equally needs more
                : Math.Clamp(1.0 - (sh.RecentFunding / maxRecentFunding), 0.0, 1.0);
        }

        // ---- Step 4: Combined need score -----------------------------------------
        foreach (var sh in safehouses)
        {
            if (outcomeMap != null)
            {
                sh.NeedScore = 0.6 * sh.OutcomeDeficit + 0.4 * sh.FundingDeficit;
            }
            else
            {
                sh.NeedScore = sh.FundingDeficit;
            }
        }

        // ---- Step 5: Pick top 2 + compute splits --------------------------------
        var ranked = safehouses.OrderByDescending(s => s.NeedScore).ThenBy(s => s.Id).Take(2).ToList();

        var generalFundAmount = Math.Round(totalAmount * INeedBasedAllocationService.GeneralFundFraction, 2, MidpointRounding.AwayFromZero);
        var rainyDayAmount = Math.Round(totalAmount * INeedBasedAllocationService.RainyDayFraction, 2, MidpointRounding.AwayFromZero);
        var remaining = totalAmount - generalFundAmount - rainyDayAmount;

        var allocations = new List<SafehouseAllocation>();
        if (ranked.Count == 1)
        {
            allocations.Add(new SafehouseAllocation
            {
                SafehouseId = ranked[0].Id,
                SafehouseName = ranked[0].Name,
                ProgramArea = normalizedArea,
                Amount = remaining,
                NeedScore = Math.Round(ranked[0].NeedScore, 4),
            });
        }
        else if (ranked.Count >= 2)
        {
            var totalScore = ranked[0].NeedScore + ranked[1].NeedScore;
            decimal top1Amount;
            if (totalScore <= 0)
            {
                // Both score zero (e.g. no recent data anywhere); split evenly.
                top1Amount = Math.Round(remaining * 0.5m, 2, MidpointRounding.AwayFromZero);
            }
            else
            {
                var top1Share = ranked[0].NeedScore / totalScore;
                top1Amount = Math.Round(remaining * (decimal)top1Share, 2, MidpointRounding.AwayFromZero);
            }
            var top2Amount = remaining - top1Amount; // exact, no rounding error

            allocations.Add(new SafehouseAllocation
            {
                SafehouseId = ranked[0].Id,
                SafehouseName = ranked[0].Name,
                ProgramArea = normalizedArea,
                Amount = top1Amount,
                NeedScore = Math.Round(ranked[0].NeedScore, 4),
            });
            allocations.Add(new SafehouseAllocation
            {
                SafehouseId = ranked[1].Id,
                SafehouseName = ranked[1].Name,
                ProgramArea = normalizedArea,
                Amount = top2Amount,
                NeedScore = Math.Round(ranked[1].NeedScore, 4),
            });
        }

        return new AllocationPlan
        {
            TotalAmount = totalAmount,
            GeneralFundAmount = generalFundAmount,
            RainyDayAmount = rainyDayAmount,
            ProgramArea = normalizedArea,
            SafehouseAllocations = allocations,
        };
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------
    private static double Median(List<double> values)
    {
        if (values.Count == 0) return 0;
        var sorted = values.OrderBy(v => v).ToList();
        var mid = sorted.Count / 2;
        return sorted.Count % 2 == 0 ? (sorted[mid - 1] + sorted[mid]) / 2.0 : sorted[mid];
    }

    private static AllocationPlan BuildPlanWithoutSafehouses(decimal totalAmount, string programArea)
    {
        var generalFund = Math.Round(totalAmount * INeedBasedAllocationService.GeneralFundFraction, 2);
        var rainyDay = Math.Round(totalAmount * INeedBasedAllocationService.RainyDayFraction, 2);
        return new AllocationPlan
        {
            TotalAmount = totalAmount,
            GeneralFundAmount = generalFund,
            RainyDayAmount = rainyDay,
            ProgramArea = programArea,
            SafehouseAllocations = new List<SafehouseAllocation>(),
        };
    }

    private sealed class SafehouseRow
    {
        public long Id { get; init; }
        public string Name { get; init; } = "";
        public double? OutcomeValue { get; set; }
        public double RecentFunding { get; set; }
        public double OutcomeDeficit { get; set; }
        public double FundingDeficit { get; set; }
        public double NeedScore { get; set; }
    }
}
