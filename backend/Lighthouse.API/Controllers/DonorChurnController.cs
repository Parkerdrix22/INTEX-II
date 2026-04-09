using Lighthouse.API.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;
using Npgsql;

namespace Lighthouse.API.Controllers;

[ApiController]
[Route("api/donor-churn")]
[Authorize(Roles = "Admin,Staff")]
public class DonorChurnController : ControllerBase
{
    private static readonly Lazy<InferenceSession> Session = new(() =>
    {
        var modelPath = FindModelFile();
        return new InferenceSession(modelPath);
    });

    private static string FindModelFile()
    {
        string[] searchPaths =
        [
            Path.Combine(Directory.GetCurrentDirectory(), "..", "..", "is455", "ml-pipelines", "models",
                "pipeline_02_donor_churn_rf.onnx"),
            Path.Combine(Directory.GetCurrentDirectory(), "is455", "ml-pipelines", "models",
                "pipeline_02_donor_churn_rf.onnx"),
            Path.Combine(Directory.GetCurrentDirectory(), "..", "is455", "ml-pipelines", "models",
                "pipeline_02_donor_churn_rf.onnx"),
        ];

        foreach (var p in searchPaths)
        {
            var resolved = Path.GetFullPath(p);
            if (System.IO.File.Exists(resolved)) return resolved;
        }

        throw new FileNotFoundException(
            $"ONNX model not found. Searched: {string.Join(", ", searchPaths.Select(Path.GetFullPath))}");
    }

    // All 38 feature names in exact ONNX input order
    private static readonly string[] FeatureNames =
    [
        "frequency", "monetary_total", "monetary_avg", "monetary_max",
        "has_recurring", "donation_types_count", "recency_days", "days_since_first",
        "donation_velocity", "recurring_rate", "has_campaign_donation",
        "unique_safehouses_funded", "pct_education", "pct_health", "pct_counseling",
        "tenure_days",
        "supporter_type_InKindDonor", "supporter_type_MonetaryDonor",
        "supporter_type_PartnerOrganization", "supporter_type_SkillsContributor",
        "supporter_type_SocialMediaAdvocate", "supporter_type_Volunteer",
        "acquisition_channel_Church", "acquisition_channel_Event",
        "acquisition_channel_PartnerReferral", "acquisition_channel_SocialMedia",
        "acquisition_channel_Website", "acquisition_channel_WordOfMouth",
        "relationship_type_International", "relationship_type_Local",
        "relationship_type_PartnerOrganization",
        "region_Luzon", "region_Mindanao", "region_Visayas",
        "country_Canada", "country_Philippines", "country_Singapore", "country_USA"
    ];

    // Snapshot date used for ML feature computation. The model was trained
    // with this date as "today" — DO NOT change it without retraining the
    // ONNX artifact, or the feature distribution will shift and predictions
    // will silently drift.
    private static readonly DateTime ReferenceDate = new(2026, 3, 1);

    [HttpGet("dashboard")]
    public async Task<IActionResult> GetDashboard([FromServices] AppDbContext dbContext)
    {
        try
        {
            var connectionString = dbContext.Database.GetConnectionString()!;

            // Load all data in parallel using raw SQL
            List<SupporterRow> supporters;
            List<DonationRow> donations;
            List<AllocationRow> allocations;

            await using (var conn = new NpgsqlConnection(connectionString))
            {
                await conn.OpenAsync();

                // Load supporters
                supporters = new List<SupporterRow>();
                await using (var cmd = new NpgsqlCommand(
                    "SELECT supporter_id, supporter_type, display_name, relationship_type, region, country, status, created_at, acquisition_channel FROM lighthouse.supporters", conn))
                await using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (await reader.ReadAsync())
                    {
                        supporters.Add(new SupporterRow
                        {
                            SupporterId = (int)reader.GetInt64(0),
                            SupporterType = reader.IsDBNull(1) ? "" : reader.GetString(1),
                            DisplayName = reader.IsDBNull(2) ? "" : reader.GetString(2),
                            RelationshipType = reader.IsDBNull(3) ? "" : reader.GetString(3),
                            Region = reader.IsDBNull(4) ? "" : reader.GetString(4),
                            Country = reader.IsDBNull(5) ? "" : reader.GetString(5),
                            Status = reader.IsDBNull(6) ? "" : reader.GetString(6),
                            CreatedAt = reader.IsDBNull(7) ? ReferenceDate : reader.GetDateTime(7),
                            AcquisitionChannel = reader.IsDBNull(8) ? "" : reader.GetString(8),
                        });
                    }
                }

                // Load donations
                donations = new List<DonationRow>();
                await using (var cmd = new NpgsqlCommand(
                    "SELECT donation_id, supporter_id, donation_type, donation_date, is_recurring, campaign_name, estimated_value FROM lighthouse.donations WHERE supporter_id IS NOT NULL", conn))
                await using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (await reader.ReadAsync())
                    {
                        donations.Add(new DonationRow
                        {
                            DonationId = (int)reader.GetInt64(0),
                            SupporterId = (int)reader.GetInt64(1),
                            DonationType = reader.IsDBNull(2) ? "" : reader.GetString(2),
                            DonationDate = reader.IsDBNull(3) ? ReferenceDate : reader.GetDateTime(3),
                            IsRecurring = !reader.IsDBNull(4) && reader.GetBoolean(4),
                            CampaignName = reader.IsDBNull(5) ? null : reader.GetString(5),
                            EstimatedValue = reader.IsDBNull(6) ? 0 : reader.GetDouble(6),
                        });
                    }
                }

                // Load allocations
                allocations = new List<AllocationRow>();
                await using (var cmd = new NpgsqlCommand(
                    "SELECT da.donation_id, d.supporter_id, da.safehouse_id, da.program_area, da.amount_allocated FROM lighthouse.donation_allocations da JOIN lighthouse.donations d ON da.donation_id = d.donation_id WHERE d.supporter_id IS NOT NULL", conn))
                await using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (await reader.ReadAsync())
                    {
                        allocations.Add(new AllocationRow
                        {
                            DonationId = (int)reader.GetInt64(0),
                            SupporterId = (int)reader.GetInt64(1),
                            SafehouseId = reader.IsDBNull(2) ? 0 : (int)reader.GetInt64(2),
                            ProgramArea = reader.IsDBNull(3) ? "" : reader.GetString(3),
                            AmountAllocated = reader.IsDBNull(4) ? 0 : reader.GetDouble(4),
                        });
                    }
                }
            }

            // Group donations and allocations by supporter
            var donationsBySupporter = donations.GroupBy(d => d.SupporterId)
                .ToDictionary(g => g.Key, g => g.ToList());
            var allocationsBySupporter = allocations.GroupBy(a => a.SupporterId)
                .ToDictionary(g => g.Key, g => g.ToList());

            var results = new List<DonorChurnResult>();

            foreach (var s in supporters)
            {
                var features = BuildFeatureVector(s,
                    donationsBySupporter.GetValueOrDefault(s.SupporterId),
                    allocationsBySupporter.GetValueOrDefault(s.SupporterId));

                // Create named inputs for ONNX
                var inputs = new List<NamedOnnxValue>();
                for (var i = 0; i < FeatureNames.Length; i++)
                {
                    var tensor = new DenseTensor<float>(new[] { features[i] }, new[] { 1, 1 });
                    inputs.Add(NamedOnnxValue.CreateFromTensor(FeatureNames[i], tensor));
                }

                using var onnxResults = Session.Value.Run(inputs);

                // Extract churn probability from seq(map(int64, float))
                var probResult = onnxResults.First(r => r.Name == "output_probability");
                var probMaps = probResult.AsEnumerable<DisposableNamedOnnxValue>().ToList();
                var map = probMaps[0].AsEnumerable<KeyValuePair<long, float>>()
                    .ToDictionary(kv => kv.Key, kv => kv.Value);
                float churnProb = map[1];

                var supporterDonations = donationsBySupporter.GetValueOrDefault(s.SupporterId);
                var lastDonationDate = supporterDonations?.Max(d => d.DonationDate);
                var totalDonated = supporterDonations?.Sum(d => d.EstimatedValue) ?? 0;
                var donationCount = supporterDonations?.Count ?? 0;
                var isRecurring = supporterDonations?.Any(d => d.IsRecurring) ?? false;
                // Human-facing "days since last donation" uses real calendar time,
                // NOT the ML snapshot date — otherwise a gift given today still
                // shows as ~39 days old because the training snapshot is 2026-03-01.
                // A brand-new donation clamps to 0 instead of going negative.
                var today = DateTime.UtcNow.Date;
                var daysSinceLastDonation = lastDonationDate.HasValue
                    ? Math.Max(0, (int)(today - lastDonationDate.Value.Date).TotalDays)
                    : Math.Max(0, (int)(today - s.CreatedAt.Date).TotalDays);

                results.Add(new DonorChurnResult
                {
                    SupporterId = s.SupporterId,
                    DisplayName = s.DisplayName,
                    SupporterType = s.SupporterType,
                    AcquisitionChannel = s.AcquisitionChannel,
                    Status = s.Status,
                    ChurnProbability = Math.Round(churnProb, 4),
                    ChurnRisk = churnProb >= 0.6f ? "High" : churnProb >= 0.3f ? "Medium" : "Low",
                    LastDonationDate = lastDonationDate?.ToString("yyyy-MM-dd"),
                    TotalDonated = Math.Round(totalDonated, 2),
                    DonationCount = donationCount,
                    IsRecurring = isRecurring,
                    DaysSinceLastDonation = daysSinceLastDonation,
                });
            }

            // Sort by churn probability descending
            results = results.OrderByDescending(r => r.ChurnProbability).ToList();

            return Ok(results);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }

    [HttpGet("model-info")]
    public async Task<IActionResult> GetModelInfo([FromServices] AppDbContext dbContext)
    {
        var supporterCount = await dbContext.Database
            .SqlQueryRaw<int>("SELECT COUNT(*)::int AS \"Value\" FROM lighthouse.supporters")
            .FirstAsync();

        double r2 = 0;
        string? trainedAt = null;
        double? churnRate = null;

        try
        {
            var metricsPath = Path.Combine(
                FindModelFile().Replace("pipeline_02_donor_churn_rf.onnx", ""),
                "training_metrics.json");
            if (System.IO.File.Exists(metricsPath))
            {
                var json = await System.IO.File.ReadAllTextAsync(metricsPath);
                var doc = System.Text.Json.JsonDocument.Parse(json);
                if (doc.RootElement.TryGetProperty("pipeline_02_donor_churn", out var p2))
                {
                    if (p2.TryGetProperty("metrics", out var metrics))
                    {
                        if (metrics.TryGetProperty("r2", out var r2Val))
                            r2 = r2Val.GetDouble();
                        if (metrics.TryGetProperty("churn_rate", out var crVal))
                            churnRate = crVal.GetDouble();
                    }

                    if (p2.TryGetProperty("trained_at", out var ta))
                        trainedAt = ta.GetString();
                }
            }
        }
        catch
        {
            // Fall back to defaults
        }

        return Ok(new
        {
            supporterCount,
            r2 = Math.Round(r2, 4),
            trainedAt,
            modelName = "Random Forest Classifier",
            churnRate,
        });
    }

    private static float[] BuildFeatureVector(SupporterRow supporter,
        List<DonationRow>? donations, List<AllocationRow>? allocations)
    {
        var f = new float[38];

        // RFM features (indices 0-10)
        if (donations != null && donations.Count > 0)
        {
            var frequency = donations.Count;
            var monetaryTotal = donations.Sum(d => d.EstimatedValue);
            var monetaryAvg = monetaryTotal / frequency;
            var monetaryMax = donations.Max(d => d.EstimatedValue);
            var hasRecurring = donations.Any(d => d.IsRecurring) ? 1f : 0f;
            var donationTypesCount = donations.Select(d => d.DonationType).Distinct().Count();
            var maxDate = donations.Max(d => d.DonationDate);
            var minDate = donations.Min(d => d.DonationDate);
            var recencyDays = (float)(ReferenceDate - maxDate).TotalDays;
            var daysSinceFirst = (float)(ReferenceDate - minDate).TotalDays;
            var donationVelocity = daysSinceFirst > 0 ? frequency / daysSinceFirst : 0f;
            var recurringRate = (float)donations.Count(d => d.IsRecurring) / frequency;
            var hasCampaignDonation = donations.Any(d => d.CampaignName != null) ? 1f : 0f;

            f[0] = frequency;
            f[1] = (float)monetaryTotal;
            f[2] = (float)monetaryAvg;
            f[3] = (float)monetaryMax;
            f[4] = hasRecurring;
            f[5] = donationTypesCount;
            f[6] = recencyDays;
            f[7] = daysSinceFirst;
            f[8] = donationVelocity;
            f[9] = recurringRate;
            f[10] = hasCampaignDonation;
        }
        // else all remain 0

        // Allocation features (indices 11-14)
        if (allocations != null && allocations.Count > 0)
        {
            var uniqueSafehouses = allocations.Where(a => a.SafehouseId != 0)
                .Select(a => a.SafehouseId).Distinct().Count();
            var totalAllocated = allocations.Sum(a => a.AmountAllocated);

            float pctEducation = 0, pctHealth = 0, pctCounseling = 0;
            if (totalAllocated > 0)
            {
                pctEducation = (float)(allocations
                    .Where(a => a.ProgramArea.Contains("Education", StringComparison.OrdinalIgnoreCase))
                    .Sum(a => a.AmountAllocated) / totalAllocated);
                pctHealth = (float)(allocations
                    .Where(a => a.ProgramArea.Contains("Health", StringComparison.OrdinalIgnoreCase) ||
                                a.ProgramArea.Contains("Wellbeing", StringComparison.OrdinalIgnoreCase))
                    .Sum(a => a.AmountAllocated) / totalAllocated);
                pctCounseling = (float)(allocations
                    .Where(a => a.ProgramArea.Contains("Counsel", StringComparison.OrdinalIgnoreCase) ||
                                a.ProgramArea.Contains("Case", StringComparison.OrdinalIgnoreCase))
                    .Sum(a => a.AmountAllocated) / totalAllocated);
            }

            f[11] = uniqueSafehouses;
            f[12] = pctEducation;
            f[13] = pctHealth;
            f[14] = pctCounseling;
        }

        // Tenure (index 15)
        f[15] = (float)(ReferenceDate - supporter.CreatedAt).TotalDays;

        // One-hot: supporter_type (indices 16-21)
        SetOneHot(f, 16,
            ["InKindDonor", "MonetaryDonor", "PartnerOrganization", "SkillsContributor", "SocialMediaAdvocate", "Volunteer"],
            supporter.SupporterType);

        // One-hot: acquisition_channel (indices 22-27)
        SetOneHot(f, 22,
            ["Church", "Event", "PartnerReferral", "SocialMedia", "Website", "WordOfMouth"],
            supporter.AcquisitionChannel);

        // One-hot: relationship_type (indices 28-30)
        SetOneHot(f, 28,
            ["International", "Local", "PartnerOrganization"],
            supporter.RelationshipType);

        // One-hot: region (indices 31-33)
        SetOneHot(f, 31, ["Luzon", "Mindanao", "Visayas"], supporter.Region);

        // One-hot: country (indices 34-37)
        SetOneHot(f, 34, ["Canada", "Philippines", "Singapore", "USA"], supporter.Country);

        return f;
    }

    private static void SetOneHot(float[] features, int startIdx, string[] categories, string value)
    {
        for (var i = 0; i < categories.Length; i++)
            features[startIdx + i] = string.Equals(categories[i], value, StringComparison.OrdinalIgnoreCase)
                ? 1f
                : 0f;
    }

    // Internal row types for raw SQL results
    private class SupporterRow
    {
        public int SupporterId { get; init; }
        public string SupporterType { get; init; } = "";
        public string DisplayName { get; init; } = "";
        public string RelationshipType { get; init; } = "";
        public string Region { get; init; } = "";
        public string Country { get; init; } = "";
        public string Status { get; init; } = "";
        public DateTime CreatedAt { get; init; }
        public string AcquisitionChannel { get; init; } = "";
    }

    private class DonationRow
    {
        public int DonationId { get; init; }
        public int SupporterId { get; init; }
        public string DonationType { get; init; } = "";
        public DateTime DonationDate { get; init; }
        public bool IsRecurring { get; init; }
        public string? CampaignName { get; init; }
        public double EstimatedValue { get; init; }
    }

    private class AllocationRow
    {
        public int DonationId { get; init; }
        public int SupporterId { get; init; }
        public int SafehouseId { get; init; }
        public string ProgramArea { get; init; } = "";
        public double AmountAllocated { get; init; }
    }
}

public record DonorChurnResult
{
    public int SupporterId { get; init; }
    public string DisplayName { get; init; } = "";
    public string SupporterType { get; init; } = "";
    public string AcquisitionChannel { get; init; } = "";
    public string Status { get; init; } = "";
    public double ChurnProbability { get; init; }
    public string ChurnRisk { get; init; } = "";
    public string? LastDonationDate { get; init; }
    public double TotalDonated { get; init; }
    public int DonationCount { get; init; }
    public bool IsRecurring { get; init; }
    public int DaysSinceLastDonation { get; init; }
}
