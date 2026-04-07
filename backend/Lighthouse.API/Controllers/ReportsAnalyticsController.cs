using Lighthouse.API.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lighthouse.API.Controllers;

[ApiController]
[Route("api/reports-analytics")]
[Authorize(Roles = "Admin,Staff")]
public class ReportsAnalyticsController(AppDbContext dbContext) : ControllerBase
{
    [HttpGet("dashboard")]
    public async Task<IActionResult> GetDashboard()
    {
        var serviceVolume = await dbContext.Database.SqlQueryRaw<ServiceVolumeRow>(
            """
            WITH process AS (
              SELECT TO_CHAR(DATE_TRUNC('month', session_date), 'YYYY-MM') AS month_key, COUNT(*)::int AS cnt
              FROM lighthouse.process_recordings
              WHERE session_date IS NOT NULL
              GROUP BY 1
            ),
            home AS (
              SELECT TO_CHAR(DATE_TRUNC('month', visit_date), 'YYYY-MM') AS month_key, COUNT(*)::int AS cnt
              FROM lighthouse.home_visitations
              WHERE visit_date IS NOT NULL
              GROUP BY 1
            ),
            incidents AS (
              SELECT TO_CHAR(DATE_TRUNC('month', incident_date), 'YYYY-MM') AS month_key, COUNT(*)::int AS cnt
              FROM lighthouse.incident_reports
              WHERE incident_date IS NOT NULL
              GROUP BY 1
            ),
            months AS (
              SELECT month_key FROM process
              UNION
              SELECT month_key FROM home
              UNION
              SELECT month_key FROM incidents
            )
            SELECT
              m.month_key AS "MonthKey",
              COALESCE(p.cnt, 0) AS "ProcessRecordings",
              COALESCE(h.cnt, 0) AS "HomeVisitations",
              COALESCE(i.cnt, 0) AS "Incidents"
            FROM months m
            LEFT JOIN process p ON p.month_key = m.month_key
            LEFT JOIN home h ON h.month_key = m.month_key
            LEFT JOIN incidents i ON i.month_key = m.month_key
            ORDER BY m.month_key
            """).ToListAsync();

        var safehouseComparison = await dbContext.Database.SqlQueryRaw<SafehouseComparisonRow>(
            """
            WITH latest_health AS (
              SELECT
                h.resident_id,
                h.general_health_score,
                ROW_NUMBER() OVER (
                  PARTITION BY h.resident_id
                  ORDER BY h.record_date DESC NULLS LAST, h.health_record_id DESC
                ) AS rn
              FROM lighthouse.health_wellbeing_records h
            ),
            latest_education AS (
              SELECT
                e.resident_id,
                e.progress_percent,
                ROW_NUMBER() OVER (
                  PARTITION BY e.resident_id
                  ORDER BY e.record_date DESC NULLS LAST, e.education_record_id DESC
                ) AS rn
              FROM lighthouse.education_records e
            ),
            incident_counts AS (
              SELECT
                i.safehouse_id,
                COUNT(*)::int AS incidents
              FROM lighthouse.incident_reports i
              GROUP BY i.safehouse_id
            )
            SELECT
              s.safehouse_id AS "SafehouseId",
              COALESCE(s.name, CONCAT('Safehouse #', s.safehouse_id::text)) AS "SafehouseName",
              COUNT(r.resident_id)::int AS "ActiveResidents",
              COALESCE(ROUND(AVG(lh.general_health_score)::numeric, 2), 0)::double precision AS "AvgHealthScore",
              COALESCE(ROUND(AVG(le.progress_percent)::numeric, 1), 0)::double precision AS "AvgEducationProgress",
              COALESCE(ic.incidents, 0)::int AS "IncidentCount"
            FROM lighthouse.safehouses s
            LEFT JOIN lighthouse.residents r
              ON r.safehouse_id = s.safehouse_id
              AND r.date_closed IS NULL
            LEFT JOIN latest_health lh
              ON lh.resident_id = r.resident_id
              AND lh.rn = 1
            LEFT JOIN latest_education le
              ON le.resident_id = r.resident_id
              AND le.rn = 1
            LEFT JOIN incident_counts ic
              ON ic.safehouse_id = s.safehouse_id
            GROUP BY s.safehouse_id, s.name, ic.incidents
            ORDER BY "ActiveResidents" DESC, "SafehouseName"
            """).ToListAsync();

        var outcomes = await dbContext.Database.SqlQueryRaw<OutcomeSummaryRow>(
            """
            WITH latest_health AS (
              SELECT
                h.resident_id,
                h.general_health_score,
                ROW_NUMBER() OVER (
                  PARTITION BY h.resident_id
                  ORDER BY h.record_date DESC NULLS LAST, h.health_record_id DESC
                ) AS rn
              FROM lighthouse.health_wellbeing_records h
            ),
            latest_education AS (
              SELECT
                e.resident_id,
                e.progress_percent,
                ROW_NUMBER() OVER (
                  PARTITION BY e.resident_id
                  ORDER BY e.record_date DESC NULLS LAST, e.education_record_id DESC
                ) AS rn
              FROM lighthouse.education_records e
            )
            SELECT
              COALESCE(ROUND(AVG(lh.general_health_score)::numeric, 2), 0)::double precision AS "AvgHealthScore",
              COALESCE(ROUND(AVG(le.progress_percent)::numeric, 1), 0)::double precision AS "AvgEducationProgress",
              (SELECT COUNT(*)::int FROM lighthouse.process_recordings) AS "TotalProcessRecordings",
              (SELECT COUNT(*)::int FROM lighthouse.home_visitations) AS "TotalHomeVisitations"
            FROM lighthouse.residents r
            LEFT JOIN latest_health lh
              ON lh.resident_id = r.resident_id
              AND lh.rn = 1
            LEFT JOIN latest_education le
              ON le.resident_id = r.resident_id
              AND le.rn = 1
            """).FirstOrDefaultAsync();

        var reintegration = await dbContext.Database.SqlQueryRaw<ReintegrationRow>(
            """
            SELECT
              COALESCE(
                ROUND(
                  100.0 * SUM(
                    CASE
                      WHEN LOWER(COALESCE(r.reintegration_status, '')) LIKE '%success%'
                        OR LOWER(COALESCE(r.reintegration_status, '')) LIKE '%reintegrat%'
                        OR LOWER(COALESCE(r.reintegration_status, '')) LIKE '%complet%'
                      THEN 1 ELSE 0
                    END
                  )::numeric
                  / NULLIF(COUNT(*), 0),
                  1
                ),
                0
              )::double precision AS "OverallRate",
              COALESCE(COUNT(*)::int, 0) AS "ResidentsWithReintegrationStatus"
            FROM lighthouse.residents r
            WHERE COALESCE(TRIM(r.reintegration_status), '') <> ''
            """).FirstOrDefaultAsync();

        var reintegrationBreakdown = await dbContext.Database.SqlQueryRaw<SimpleCountRow>(
            """
            SELECT
              COALESCE(NULLIF(TRIM(r.reintegration_status), ''), 'Unknown') AS "Label",
              COUNT(*)::int AS "Count"
            FROM lighthouse.residents r
            GROUP BY 1
            ORDER BY 2 DESC, 1
            """).ToListAsync();

        var incidentTypeBreakdown = await dbContext.Database.SqlQueryRaw<SimpleCountRow>(
            """
            SELECT
              COALESCE(NULLIF(TRIM(i.incident_type), ''), 'Unknown') AS "Label",
              COUNT(*)::int AS "Count"
            FROM lighthouse.incident_reports i
            GROUP BY 1
            ORDER BY 2 DESC, 1
            """).ToListAsync();

        var interventionPlanStatus = await dbContext.Database.SqlQueryRaw<SimpleCountRow>(
            """
            SELECT
              COALESCE(NULLIF(TRIM(ip.status), ''), 'Unknown') AS "Label",
              COUNT(*)::int AS "Count"
            FROM lighthouse.intervention_plans ip
            GROUP BY 1
            ORDER BY 2 DESC, 1
            """).ToListAsync();

        var educationLevelBreakdown = await dbContext.Database.SqlQueryRaw<SimpleCountRow>(
            """
            WITH latest AS (
              SELECT
                e.resident_id,
                e.education_level,
                ROW_NUMBER() OVER (
                  PARTITION BY e.resident_id
                  ORDER BY e.record_date DESC NULLS LAST, e.education_record_id DESC
                ) AS rn
              FROM lighthouse.education_records e
            )
            SELECT
              COALESCE(NULLIF(TRIM(l.education_level), ''), 'Unknown') AS "Label",
              COUNT(*)::int AS "Count"
            FROM latest l
            WHERE l.rn = 1
            GROUP BY 1
            ORDER BY 2 DESC, 1
            """).ToListAsync();

        var conferenceSummary = await dbContext.Database.SqlQueryRaw<ConferenceSummaryRow>(
            """
            SELECT
              COALESCE(SUM(CASE WHEN ip.case_conference_date >= CURRENT_DATE THEN 1 ELSE 0 END), 0)::int AS "Upcoming",
              COALESCE(SUM(CASE WHEN ip.case_conference_date < CURRENT_DATE THEN 1 ELSE 0 END), 0)::int AS "Past"
            FROM lighthouse.intervention_plans ip
            WHERE ip.case_conference_date IS NOT NULL
            """).FirstOrDefaultAsync();

        return Ok(new
        {
            ServiceVolumeOverTime = serviceVolume,
            SafehouseComparison = safehouseComparison,
            ResidentOutcomes = outcomes ?? new OutcomeSummaryRow(),
            Reintegration = reintegration ?? new ReintegrationRow(),
            ReintegrationBreakdown = reintegrationBreakdown,
            IncidentTypeBreakdown = incidentTypeBreakdown,
            InterventionPlanStatus = interventionPlanStatus,
            EducationLevelBreakdown = educationLevelBreakdown,
            ConferenceSummary = conferenceSummary ?? new ConferenceSummaryRow(),
        });
    }

    private sealed class ServiceVolumeRow
    {
        public string MonthKey { get; set; } = string.Empty;
        public int ProcessRecordings { get; set; }
        public int HomeVisitations { get; set; }
        public int Incidents { get; set; }
    }

    private sealed class SafehouseComparisonRow
    {
        public int SafehouseId { get; set; }
        public string SafehouseName { get; set; } = string.Empty;
        public int ActiveResidents { get; set; }
        public double AvgHealthScore { get; set; }
        public double AvgEducationProgress { get; set; }
        public int IncidentCount { get; set; }
    }

    private sealed class OutcomeSummaryRow
    {
        public double AvgHealthScore { get; set; }
        public double AvgEducationProgress { get; set; }
        public int TotalProcessRecordings { get; set; }
        public int TotalHomeVisitations { get; set; }
    }

    private sealed class ReintegrationRow
    {
        public double OverallRate { get; set; }
        public int ResidentsWithReintegrationStatus { get; set; }
    }

    private sealed class SimpleCountRow
    {
        public string Label { get; set; } = string.Empty;
        public int Count { get; set; }
    }

    private sealed class ConferenceSummaryRow
    {
        public int Upcoming { get; set; }
        public int Past { get; set; }
    }
}

