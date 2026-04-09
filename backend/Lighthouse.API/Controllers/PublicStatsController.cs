using Lighthouse.API.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lighthouse.API.Controllers;

[ApiController]
[Route("api/public")]
[AllowAnonymous]
public class PublicStatsController(AppDbContext dbContext) : ControllerBase
{
    [HttpGet("home-stats")]
    public async Task<IActionResult> GetHomeStats()
    {
        try
        {
            var row = await dbContext.Database.SqlQueryRaw<HomeStatsRow>(
                """
                SELECT
                  (SELECT COUNT(*)::int FROM lighthouse.safehouses) AS "SafehomesSupported",
                  (
                    SELECT COUNT(*)::int
                    FROM lighthouse.residents r
                    WHERE r.date_closed IS NULL
                      AND COALESCE(TRIM(r.case_status), '') <> ''
                  ) AS "ActiveResidentCases",
                  (SELECT COUNT(*)::int FROM lighthouse.partners) AS "CommunityPartners"
                """)
                .FirstOrDefaultAsync();

            return Ok(row ?? new HomeStatsRow());
        }
        catch
        {
            return Ok(new HomeStatsRow());
        }
    }

    [HttpGet("impact-stats")]
    public async Task<IActionResult> GetImpactStats()
    {
        try
        {
            var row = await dbContext.Database.SqlQueryRaw<ImpactStatsRow>(
                """
                WITH risk_compared AS (
                  SELECT
                    CASE LOWER(TRIM(COALESCE(r.initial_risk_level, '')))
                      WHEN 'low' THEN 1
                      WHEN 'medium' THEN 2
                      WHEN 'high' THEN 3
                      WHEN 'critical' THEN 4
                      ELSE NULL
                    END AS io,
                    CASE LOWER(TRIM(COALESCE(r.current_risk_level, '')))
                      WHEN 'low' THEN 1
                      WHEN 'medium' THEN 2
                      WHEN 'high' THEN 3
                      WHEN 'critical' THEN 4
                      ELSE NULL
                    END AS co
                  FROM lighthouse.residents r
                ),
                risk_stats AS (
                  SELECT
                    COUNT(*) FILTER (WHERE io IS NOT NULL AND co IS NOT NULL) AS n,
                    COUNT(*) FILTER (WHERE io IS NOT NULL AND co IS NOT NULL AND co < io) AS reduced,
                    COUNT(*) FILTER (WHERE io IS NOT NULL AND co IS NOT NULL AND co = io) AS same,
                    COUNT(*) FILTER (WHERE io IS NOT NULL AND co IS NOT NULL AND co > io) AS increased
                  FROM risk_compared
                )
                SELECT
                  (
                    SELECT COUNT(*)::int
                    FROM lighthouse.residents r
                    WHERE r.date_closed IS NULL
                  ) AS "ActiveResidents",
                  (
                    SELECT COALESCE(
                      ROUND(
                        100.0 * SUM(
                          CASE
                            WHEN COALESCE(r.has_special_needs, FALSE) OR COALESCE(r.is_pwd, FALSE)
                            THEN 1 ELSE 0
                          END
                        )::numeric
                        / NULLIF(COUNT(*), 0),
                        1
                      ),
                      0
                    )::double precision
                    FROM lighthouse.residents r
                  ) AS "InclusiveCarePct",
                  (SELECT COALESCE(ROUND(100.0 * rs.reduced::numeric / NULLIF(rs.n, 0), 1), 0)::double precision FROM risk_stats rs) AS "RiskReducedPct",
                  (SELECT COALESCE(rs.n, 0)::int FROM risk_stats rs) AS "RiskComparedCount",
                  (SELECT COALESCE(rs.reduced, 0)::int FROM risk_stats rs) AS "RiskReducedCount",
                  (SELECT COALESCE(rs.same, 0)::int FROM risk_stats rs) AS "RiskUnchangedCount",
                  (SELECT COALESCE(rs.increased, 0)::int FROM risk_stats rs) AS "RiskIncreasedCount"
                """)
                .FirstOrDefaultAsync();

            return Ok(row ?? new ImpactStatsRow());
        }
        catch
        {
            return Ok(new ImpactStatsRow());
        }
    }

    [HttpGet("health-wellbeing-impact")]
    public async Task<IActionResult> GetHealthWellbeingImpact()
    {
        try
        {
            var monthly = await dbContext.Database.SqlQueryRaw<HealthMonthlyTrendRow>(
                """
                SELECT
                  TO_CHAR(DATE_TRUNC('month', h.record_date), 'YYYY-MM') AS "MonthKey",
                  ROUND(AVG(h.general_health_score)::numeric, 2)::double precision AS "GeneralHealthScore",
                  ROUND(AVG(h.nutrition_score)::numeric, 2)::double precision AS "NutritionScore",
                  ROUND(AVG(h.sleep_quality_score)::numeric, 2)::double precision AS "SleepQualityScore",
                  ROUND(AVG(h.energy_level_score)::numeric, 2)::double precision AS "EnergyLevelScore"
                FROM lighthouse.health_wellbeing_records h
                WHERE h.record_date IS NOT NULL
                GROUP BY 1
                ORDER BY 1
                """)
                .ToListAsync();

            var summary = await dbContext.Database.SqlQueryRaw<HealthImpactSummaryRow>(
                """
                WITH first_last AS (
                  SELECT
                    resident_id,
                    (
                      COALESCE(general_health_score, 0) +
                      COALESCE(nutrition_score, 0) +
                      COALESCE(sleep_quality_score, 0) +
                      COALESCE(energy_level_score, 0)
                    ) / 4.0 AS composite_score,
                    ROW_NUMBER() OVER (PARTITION BY resident_id ORDER BY record_date ASC) AS rn_first,
                    ROW_NUMBER() OVER (PARTITION BY resident_id ORDER BY record_date DESC) AS rn_last
                  FROM lighthouse.health_wellbeing_records
                ),
                baseline AS (
                  SELECT
                    resident_id,
                    MAX(CASE WHEN rn_first = 1 THEN composite_score END) AS first_score,
                    MAX(CASE WHEN rn_last = 1 THEN composite_score END) AS last_score
                  FROM first_last
                  GROUP BY resident_id
                )
                SELECT
                  COALESCE(ROUND(AVG(last_score - first_score)::numeric, 3), 0)::double precision AS "AverageScoreChange",
                  COALESCE(
                    ROUND(
                      100.0 * AVG(CASE WHEN last_score > first_score THEN 1.0 ELSE 0.0 END)::numeric,
                      1
                    ),
                    0
                  )::double precision AS "ImprovedResidentPct"
                FROM baseline
                WHERE first_score IS NOT NULL AND last_score IS NOT NULL
                """)
                .FirstOrDefaultAsync();

            return Ok(new HealthImpactResponse
            {
                Monthly = monthly,
                AverageScoreChange = summary?.AverageScoreChange ?? 0,
                ImprovedResidentPct = summary?.ImprovedResidentPct ?? 0,
            });
        }
        catch
        {
            return Ok(new HealthImpactResponse());
        }
    }

    public sealed class HomeStatsRow
    {
        public int SafehomesSupported { get; set; }
        public int ActiveResidentCases { get; set; }
        public int CommunityPartners { get; set; }
    }

    public sealed class ImpactStatsRow
    {
        public int ActiveResidents { get; set; }

        /// <summary>Percent of residents with special needs and/or documented disability (PWD).</summary>
        public double InclusiveCarePct { get; set; }

        /// <summary>Percent of residents with valid initial+current risk whose tier improved (lower ordinal).</summary>
        public double RiskReducedPct { get; set; }

        public int RiskComparedCount { get; set; }
        public int RiskReducedCount { get; set; }
        public int RiskUnchangedCount { get; set; }
        public int RiskIncreasedCount { get; set; }
    }

    public sealed class HealthMonthlyTrendRow
    {
        public string MonthKey { get; set; } = string.Empty;
        public double GeneralHealthScore { get; set; }
        public double NutritionScore { get; set; }
        public double SleepQualityScore { get; set; }
        public double EnergyLevelScore { get; set; }
    }

    public sealed class HealthImpactSummaryRow
    {
        public double AverageScoreChange { get; set; }
        public double ImprovedResidentPct { get; set; }
    }

    public sealed class HealthImpactResponse
    {
        public List<HealthMonthlyTrendRow> Monthly { get; set; } = [];
        public double AverageScoreChange { get; set; }
        public double ImprovedResidentPct { get; set; }
    }
}

