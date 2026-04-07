using Lighthouse.API.Data;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Lighthouse.API.Controllers;

// =============================================================================
// DonorImpactController
//
// Pipeline 5: Donation Impact Attribution
//
// Endpoints are designed to be middleware-agnostic — donor identity is always
// passed as a route parameter, never inferred from cookies. Whatever auth
// middleware your team chooses can map session → supporterId in its own layer
// and call these endpoints accordingly.
//
//   GET  /api/donor-impact/donors                  → list of all donors with brief stats
//   GET  /api/donor-impact/{supporterId}           → personalized impact report
//   GET  /api/donor-impact/research-context        → OLS coefficient findings (cached)
//   GET  /api/donor-impact/model-info              → pipeline metadata
// =============================================================================

[ApiController]
[Route("api/donor-impact")]
[Authorize]
public class DonorImpactController : ControllerBase
{
    private static readonly DateTime ReferenceDate = new(2026, 3, 1);

    // Program-area keyword mapping → donation buckets (mirrors Python pipeline)
    private static readonly Dictionary<string, string[]> ProgramAreaMap = new()
    {
        ["Health"] = ["Health", "Wellbeing"],
        ["Education"] = ["Education"],
        ["Counseling"] = ["Counsel", "Case"],
        ["Operations"] = ["Operation", "Admin"],
    };

    // -------------------------------------------------------------------------
    // GET /api/donor-impact/donors
    // Returns a brief list of all donors who have at least one donation,
    // ordered by total contribution descending. Powers the donor selector UI.
    // -------------------------------------------------------------------------
    [HttpGet("donors")]
    [Authorize(Roles = "Admin,Staff")]
    public async Task<IActionResult> ListDonors([FromServices] AppDbContext dbContext)
    {
        try
        {
            var connectionString = dbContext.Database.GetConnectionString()!;
            var donors = new List<DonorBriefDto>();

            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync();

            const string sql = @"
                SELECT
                    s.supporter_id,
                    s.display_name,
                    s.supporter_type,
                    s.country,
                    COUNT(d.donation_id)::bigint AS donation_count,
                    COALESCE(SUM(d.estimated_value), 0)::float8 AS total_contributed,
                    MAX(d.donation_date) AS last_donation_date
                FROM lighthouse.supporters s
                LEFT JOIN lighthouse.donations d ON s.supporter_id = d.supporter_id
                GROUP BY s.supporter_id, s.display_name, s.supporter_type, s.country
                HAVING COUNT(d.donation_id) > 0
                ORDER BY total_contributed DESC";

            await using var cmd = new NpgsqlCommand(sql, conn);
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                donors.Add(new DonorBriefDto
                {
                    SupporterId = (int)reader.GetInt64(0),
                    DisplayName = reader.IsDBNull(1) ? "" : reader.GetString(1),
                    SupporterType = reader.IsDBNull(2) ? "" : reader.GetString(2),
                    Country = reader.IsDBNull(3) ? "" : reader.GetString(3),
                    DonationCount = (int)reader.GetInt64(4),
                    TotalContributed = Math.Round(reader.GetDouble(5), 2),
                    LastDonationDate = reader.IsDBNull(6) ? null : reader.GetDateTime(6).ToString("yyyy-MM-dd"),
                });
            }

            return Ok(donors);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message, type = ex.GetType().Name });
        }
    }

    // -------------------------------------------------------------------------
    // GET /api/donor-impact/{supporterId}
    // Personalized impact report for one donor. Mirrors generate_donor_impact_report()
    // from the Python pipeline. No ML inference — pure SQL aggregation.
    // -------------------------------------------------------------------------
    // -------------------------------------------------------------------------
    // GET /api/donor-impact/me
    // Convenience endpoint that returns the impact report for the currently
    // logged-in user (reads supporter_id from the cookie claim, never from
    // the request). Returns 404 if the user is logged in but not linked to
    // a supporter (e.g. an admin without a donor profile).
    // -------------------------------------------------------------------------
    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> GetMyImpact([FromServices] AppDbContext dbContext)
    {
        var email = User.FindFirstValue(ClaimTypes.Email);
        if (!string.IsNullOrWhiteSpace(email))
        {
            var connectionString = dbContext.Database.GetConnectionString()!;
            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync();
            await using var cmd = new NpgsqlCommand(
                "SELECT supporter_id FROM lighthouse.supporters WHERE LOWER(email) = LOWER(@email) LIMIT 1", conn);
            cmd.Parameters.AddWithValue("email", email);
            var result = await cmd.ExecuteScalarAsync();
            if (result is long lighthouseId)
            {
                return await GetDonorImpact((int)lighthouseId, dbContext);
            }
        }

        return NotFound(new
        {
            error = "Your account isn't linked to a donor profile yet. Contact staff to connect them."
        });
    }

    [HttpGet("{supporterId:int}")]
    [Authorize(Roles = "Admin,Staff,Donor")]
    public async Task<IActionResult> GetDonorImpact(
        int supporterId,
        [FromServices] AppDbContext dbContext)
    {
        if (!CanAccessSupporter(supporterId))
        {
            return Forbid();
        }
        try
        {
            var connectionString = dbContext.Database.GetConnectionString()!;
            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync();

            // ---- Step 1: Supporter info ---------------------------------------
            DonorImpactReport? report = null;
            await using (var cmd = new NpgsqlCommand(@"
                SELECT supporter_id, display_name, supporter_type, country, region
                FROM lighthouse.supporters
                WHERE supporter_id = @id", conn))
            {
                cmd.Parameters.AddWithValue("id", (long)supporterId);
                await using var reader = await cmd.ExecuteReaderAsync();
                if (await reader.ReadAsync())
                {
                    report = new DonorImpactReport
                    {
                        SupporterId = (int)reader.GetInt64(0),
                        DisplayName = reader.IsDBNull(1) ? "" : reader.GetString(1),
                        SupporterType = reader.IsDBNull(2) ? "" : reader.GetString(2),
                        Country = reader.IsDBNull(3) ? "" : reader.GetString(3),
                        Region = reader.IsDBNull(4) ? "" : reader.GetString(4),
                    };
                }
            }

            if (report == null)
            {
                return NotFound(new { error = $"Supporter {supporterId} not found." });
            }

            // ---- Step 2: All donations by this supporter ----------------------
            var donations = new List<(long donationId, DateTime date, double amount)>();
            await using (var cmd = new NpgsqlCommand(@"
                SELECT donation_id, donation_date, COALESCE(estimated_value, 0)::float8
                FROM lighthouse.donations
                WHERE supporter_id = @id", conn))
            {
                cmd.Parameters.AddWithValue("id", (long)supporterId);
                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    donations.Add((
                        reader.GetInt64(0),
                        reader.IsDBNull(1) ? ReferenceDate : reader.GetDateTime(1),
                        reader.IsDBNull(2) ? 0 : reader.GetDouble(2)
                    ));
                }
            }

            if (donations.Count == 0)
            {
                report.TotalContributed = 0;
                report.DonationCount = 0;
                report.Message = "No donations on record yet.";
                return Ok(report);
            }

            report.TotalContributed = Math.Round(donations.Sum(d => d.amount), 2);
            report.DonationCount = donations.Count;
            report.FirstDonationDate = donations.Min(d => d.date).ToString("yyyy-MM-dd");
            report.LastDonationDate = donations.Max(d => d.date).ToString("yyyy-MM-dd");

            // ---- Step 3: Allocations linked to those donations ---------------
            var donationIds = donations.Select(d => d.donationId).ToArray();

            var allocations = new List<(long safehouseId, string programArea, double amount)>();
            await using (var cmd = new NpgsqlCommand(@"
                SELECT safehouse_id, program_area, COALESCE(amount_allocated, 0)::float8
                FROM lighthouse.donation_allocations
                WHERE donation_id = ANY(@ids)", conn))
            {
                cmd.Parameters.AddWithValue("ids", donationIds);
                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    allocations.Add((
                        reader.IsDBNull(0) ? 0L : reader.GetInt64(0),
                        reader.IsDBNull(1) ? "" : reader.GetString(1),
                        reader.IsDBNull(2) ? 0 : reader.GetDouble(2)
                    ));
                }
            }

        var totalAllocated = allocations.Sum(a => a.amount);
        report.TotalAllocated = Math.Round(totalAllocated, 2);

        // ---- Step 4: Program-area breakdown (% allocated to each bucket) -
        var programAreaBreakdown = new List<ProgramAreaSlice>();
        if (totalAllocated > 0)
        {
            foreach (var (bucket, keywords) in ProgramAreaMap)
            {
                var bucketTotal = allocations
                    .Where(a => keywords.Any(k =>
                        a.programArea.Contains(k, StringComparison.OrdinalIgnoreCase)))
                    .Sum(a => a.amount);

                if (bucketTotal > 0)
                {
                    programAreaBreakdown.Add(new ProgramAreaSlice
                    {
                        Name = bucket,
                        Amount = Math.Round(bucketTotal, 2),
                        Percent = Math.Round(bucketTotal / totalAllocated * 100, 1),
                    });
                }
            }
        }
        report.ProgramAreaBreakdown = programAreaBreakdown;

            // ---- Step 5: Safehouses funded ------------------------------------
            var fundedSafehouseIds = allocations
                .Where(a => a.safehouseId > 0)
                .Select(a => a.safehouseId)
                .Distinct()
                .ToArray();

            var safehouses = new List<SafehouseSummary>();
            if (fundedSafehouseIds.Length > 0)
            {
                await using var cmd = new NpgsqlCommand(@"
                    SELECT safehouse_id, name, city, province, country
                    FROM lighthouse.safehouses
                    WHERE safehouse_id = ANY(@ids)", conn);
                cmd.Parameters.AddWithValue("ids", fundedSafehouseIds);
                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    var sid = reader.GetInt64(0);
                    var sumForSh = allocations.Where(a => a.safehouseId == sid).Sum(a => a.amount);
                    safehouses.Add(new SafehouseSummary
                    {
                        SafehouseId = (int)sid,
                        Name = reader.IsDBNull(1) ? "" : reader.GetString(1),
                        City = reader.IsDBNull(2) ? "" : reader.GetString(2),
                        Province = reader.IsDBNull(3) ? "" : reader.GetString(3),
                        Country = reader.IsDBNull(4) ? "" : reader.GetString(4),
                        AmountAllocated = Math.Round(sumForSh, 2),
                    });
                }
            }
            report.SafehousesSupported = safehouses.OrderByDescending(s => s.AmountAllocated).ToList();

            // ---- Step 6: Outcome metrics at funded safehouses during support period
            if (fundedSafehouseIds.Length > 0 && donations.Count > 0)
            {
                var firstDate = donations.Min(d => d.date);
                var lastDate = donations.Max(d => d.date).AddMonths(1);

                await using var cmd = new NpgsqlCommand(@"
                    SELECT
                        AVG(avg_health_score)::float8 AS avg_health,
                        AVG(avg_education_progress)::float8 AS avg_edu,
                        AVG(active_residents)::float8 AS avg_residents
                    FROM lighthouse.safehouse_monthly_metrics
                    WHERE safehouse_id = ANY(@ids)
                      AND month_start >= @start
                      AND month_start <= @end", conn);
                cmd.Parameters.AddWithValue("ids", fundedSafehouseIds);
                cmd.Parameters.AddWithValue("start", DateOnly.FromDateTime(firstDate));
                cmd.Parameters.AddWithValue("end", DateOnly.FromDateTime(lastDate));

                await using var reader = await cmd.ExecuteReaderAsync();
                if (await reader.ReadAsync())
                {
                    report.AvgHealthScore = reader.IsDBNull(0) ? null : Math.Round(reader.GetDouble(0), 2);
                    report.AvgEducationProgress = reader.IsDBNull(1) ? null : Math.Round(reader.GetDouble(1), 2);
                    report.AvgActiveResidents = reader.IsDBNull(2) ? null : Math.Round(reader.GetDouble(2), 1);
                }
            }

            // ---- Step 7: Monthly contribution timeline (for chart) -----------
            report.MonthlyTimeline = donations
                .GroupBy(d => new DateTime(d.date.Year, d.date.Month, 1))
                .OrderBy(g => g.Key)
                .Select(g => new MonthlyContribution
                {
                    Month = g.Key.ToString("yyyy-MM"),
                    Amount = Math.Round(g.Sum(d => d.amount), 2),
                    Count = g.Count(),
                })
                .ToList();

            return Ok(report);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message, type = ex.GetType().Name });
        }
    }

    // -------------------------------------------------------------------------
    // GET /api/donor-impact/research-context
    // Returns the OLS coefficient findings from the latest training run.
    // Cached at process startup so it's free to call repeatedly.
    // -------------------------------------------------------------------------
    [HttpGet("research-context")]
    [Authorize(Roles = "Admin,Staff")]
    public IActionResult GetResearchContext()
    {
        try
        {
            var jsonPath = FindCoefficientsFile();
            if (!System.IO.File.Exists(jsonPath))
            {
                return Ok(new { available = false, message = "Research context not yet trained." });
            }

            var json = System.IO.File.ReadAllText(jsonPath);
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            return Content(json, "application/json");
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }

    // -------------------------------------------------------------------------
    // GET /api/donor-impact/model-info
    // -------------------------------------------------------------------------
    [HttpGet("model-info")]
    [Authorize(Roles = "Admin,Staff")]
    public async Task<IActionResult> GetModelInfo([FromServices] AppDbContext dbContext)
    {
        var donorCount = await dbContext.Database
            .SqlQueryRaw<int>("SELECT COUNT(DISTINCT supporter_id)::int AS \"Value\" FROM lighthouse.donations")
            .FirstAsync();

        double healthR2 = 0;
        double eduR2 = 0;
        int nObs = 0;
        string? trainedAt = null;

        try
        {
            var metricsPath = Path.Combine(FindCoefficientsFile().Replace("pipeline_05_ols_coefficients.json", ""),
                "training_metrics.json");
            if (System.IO.File.Exists(metricsPath))
            {
                var json = await System.IO.File.ReadAllTextAsync(metricsPath);
                using var doc = System.Text.Json.JsonDocument.Parse(json);
                if (doc.RootElement.TryGetProperty("pipeline_05_impact_attribution", out var p5))
                {
                    if (p5.TryGetProperty("metrics", out var metrics))
                    {
                        if (metrics.TryGetProperty("ols_health_r2", out var hr2)) healthR2 = hr2.GetDouble();
                        if (metrics.TryGetProperty("ols_edu_r2", out var er2)) eduR2 = er2.GetDouble();
                        if (metrics.TryGetProperty("ols_health_n_obs", out var n)) nObs = n.GetInt32();
                    }
                    if (p5.TryGetProperty("trained_at", out var ta)) trainedAt = ta.GetString();
                }
            }
        }
        catch
        {
            // Fall back to defaults
        }

        return Ok(new
        {
            donorCount,
            healthR2 = Math.Round(healthR2, 4),
            educationR2 = Math.Round(eduR2, 4),
            nObservations = nObs,
            trainedAt,
            modelName = "OLS (statsmodels) with safehouse fixed effects",
        });
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------
    private static string FindCoefficientsFile()
    {
        string[] searchPaths =
        [
            Path.Combine(Directory.GetCurrentDirectory(), "..", "..", "is455", "ml-pipelines", "models",
                "pipeline_05_ols_coefficients.json"),
            Path.Combine(Directory.GetCurrentDirectory(), "is455", "ml-pipelines", "models",
                "pipeline_05_ols_coefficients.json"),
            Path.Combine(Directory.GetCurrentDirectory(), "..", "is455", "ml-pipelines", "models",
                "pipeline_05_ols_coefficients.json"),
        ];

        foreach (var p in searchPaths)
        {
            var resolved = Path.GetFullPath(p);
            if (System.IO.File.Exists(resolved)) return resolved;
        }

        // Return the first path as a fallback (used to derive sibling paths even when missing)
        return Path.GetFullPath(searchPaths[0]);
    }

    private bool CanAccessSupporter(int supporterId)
    {
        if (User.IsInRole("Admin") || User.IsInRole("Staff"))
        {
            return true;
        }

        if (!User.IsInRole("Donor"))
        {
            return false;
        }

        return int.TryParse(User.FindFirstValue("supporter_id"), out var claimedSupporterId) &&
               claimedSupporterId == supporterId;
    }
}

// =============================================================================
// DTOs
// =============================================================================

public record DonorBriefDto
{
    public int SupporterId { get; init; }
    public string DisplayName { get; init; } = "";
    public string SupporterType { get; init; } = "";
    public string Country { get; init; } = "";
    public int DonationCount { get; init; }
    public double TotalContributed { get; init; }
    public string? LastDonationDate { get; init; }
}

public record DonorImpactReport
{
    public int SupporterId { get; init; }
    public string DisplayName { get; set; } = "";
    public string SupporterType { get; set; } = "";
    public string Country { get; set; } = "";
    public string Region { get; set; } = "";

    public double TotalContributed { get; set; }
    public double TotalAllocated { get; set; }
    public int DonationCount { get; set; }
    public string? FirstDonationDate { get; set; }
    public string? LastDonationDate { get; set; }

    public List<ProgramAreaSlice> ProgramAreaBreakdown { get; set; } = [];
    public List<SafehouseSummary> SafehousesSupported { get; set; } = [];
    public List<MonthlyContribution> MonthlyTimeline { get; set; } = [];

    public double? AvgHealthScore { get; set; }
    public double? AvgEducationProgress { get; set; }
    public double? AvgActiveResidents { get; set; }

    public string? Message { get; set; }
}

public record ProgramAreaSlice
{
    public string Name { get; init; } = "";
    public double Amount { get; init; }
    public double Percent { get; init; }
}

public record SafehouseSummary
{
    public int SafehouseId { get; init; }
    public string Name { get; init; } = "";
    public string City { get; init; } = "";
    public string Province { get; init; } = "";
    public string Country { get; init; } = "";
    public double AmountAllocated { get; init; }
}

public record MonthlyContribution
{
    public string Month { get; init; } = "";
    public double Amount { get; init; }
    public int Count { get; init; }
}
