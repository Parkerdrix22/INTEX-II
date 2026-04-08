using Lighthouse.API.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using System.Text.Json;

namespace Lighthouse.API.Controllers;

// =============================================================================
// DonorArchetypeController
//
// Pipeline 7: Donor Archetype Clustering (K-means, k=4)
//
// All cluster centroids, scaler params, and archetype metadata are loaded from
// is455/ml-pipelines/models/pipeline_07_donor_archetypes.json. K-means inference
// is just standardize-then-nearest-centroid, so no ONNX runtime is needed.
//
//   GET  /api/donor-archetypes/dashboard            → all donors with assigned archetype
//   GET  /api/donor-archetypes/clusters             → archetype profiles (one per cluster)
//   GET  /api/donor-archetypes/{supporterId}        → detailed donor archetype + neighbors
//   GET  /api/donor-archetypes/model-info           → pipeline metadata
// =============================================================================

[ApiController]
[Route("api/donor-archetypes")]
[Authorize(Roles = "Admin,Staff")]
public class DonorArchetypeController : ControllerBase
{
    private static readonly DateTime SnapshotDate = new(2026, 4, 7);

    // Cached parsed artifact (loaded once per process)
    private static readonly Lazy<ArtifactData> Artifact = new(LoadArtifact);

    // -------------------------------------------------------------------------
    // GET /api/donor-archetypes/dashboard
    // -------------------------------------------------------------------------
    [HttpGet("dashboard")]
    public async Task<IActionResult> GetDashboard([FromServices] AppDbContext dbContext)
    {
        try
        {
            var artifact = Artifact.Value;
            var (supporters, donationsBySupporter) = await LoadSupportersAndDonationsAsync(dbContext);

            var results = new List<DonorArchetypeDto>();

            foreach (var s in supporters)
            {
                if (!donationsBySupporter.TryGetValue(s.SupporterId, out var donations) || donations.Count == 0)
                    continue;

                var (features, freq, monTotal, monAvg, recency, tenure, hasRecurring) =
                    ComputeFeatures(donations);

                var (bestCluster, bestDist, _) = AssignCluster(features, artifact);
                var arch = artifact.Archetypes[bestCluster];

                results.Add(new DonorArchetypeDto
                {
                    SupporterId = s.SupporterId,
                    DisplayName = s.DisplayName,
                    SupporterType = s.SupporterType,
                    Country = s.Country,
                    Status = s.Status,
                    Frequency = freq,
                    MonetaryTotal = Math.Round(monTotal, 2),
                    MonetaryAvg = Math.Round(monAvg, 2),
                    RecencyDays = recency,
                    TenureDays = tenure,
                    HasRecurring = hasRecurring,
                    AssignedClusterId = bestCluster,
                    ArchetypeLabel = arch.Label,
                    ArchetypeColor = arch.Color,
                    ArchetypeTagline = arch.Tagline,
                    DistanceToCentroid = Math.Round(bestDist, 4),
                });
            }

            results = results.OrderByDescending(r => r.MonetaryTotal).ToList();
            return Ok(results);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message, type = ex.GetType().Name });
        }
    }

    // -------------------------------------------------------------------------
    // GET /api/donor-archetypes/clusters
    // -------------------------------------------------------------------------
    [HttpGet("clusters")]
    public IActionResult GetClusters()
    {
        try
        {
            var artifact = Artifact.Value;
            var profiles = artifact.Archetypes
                .OrderBy(kv => kv.Key)
                .Select(kv => new ArchetypeProfileDto
                {
                    ClusterId = kv.Key,
                    Label = kv.Value.Label,
                    Tagline = kv.Value.Tagline,
                    Color = kv.Value.Color,
                    Strategy = kv.Value.Strategy,
                    Size = kv.Value.Size,
                    Characteristics = new ArchetypeCharacteristicsDto
                    {
                        MeanFrequency = kv.Value.Characteristics.MeanFrequency,
                        MeanMonetaryTotal = kv.Value.Characteristics.MeanMonetaryTotal,
                        MeanMonetaryAvg = kv.Value.Characteristics.MeanMonetaryAvg,
                        MeanRecencyDays = kv.Value.Characteristics.MeanRecencyDays,
                        MeanTenureDays = kv.Value.Characteristics.MeanTenureDays,
                        RecurringPct = kv.Value.Characteristics.RecurringPct,
                    }
                })
                .ToList();
            return Ok(profiles);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message, type = ex.GetType().Name });
        }
    }

    // -------------------------------------------------------------------------
    // GET /api/donor-archetypes/{supporterId}
    // -------------------------------------------------------------------------
    [HttpGet("{supporterId:int}")]
    public async Task<IActionResult> GetDonorArchetype(
        int supporterId,
        [FromServices] AppDbContext dbContext)
    {
        try
        {
            var artifact = Artifact.Value;
            var connectionString = dbContext.Database.GetConnectionString()!;

            SupporterRow? supporter = null;
            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync();

            await using (var cmd = new NpgsqlCommand(
                "SELECT supporter_id, display_name, supporter_type, country, status FROM lighthouse.supporters WHERE supporter_id = @id",
                conn))
            {
                cmd.Parameters.AddWithValue("id", (long)supporterId);
                await using var reader = await cmd.ExecuteReaderAsync();
                if (await reader.ReadAsync())
                {
                    supporter = new SupporterRow
                    {
                        SupporterId = (int)reader.GetInt64(0),
                        DisplayName = reader.IsDBNull(1) ? "" : reader.GetString(1),
                        SupporterType = reader.IsDBNull(2) ? "" : reader.GetString(2),
                        Country = reader.IsDBNull(3) ? "" : reader.GetString(3),
                        Status = reader.IsDBNull(4) ? "" : reader.GetString(4),
                    };
                }
            }

            if (supporter == null)
                return NotFound(new { error = $"Supporter {supporterId} not found." });

            var donations = new List<DonationRow>();
            await using (var cmd = new NpgsqlCommand(
                "SELECT donation_date, is_recurring, COALESCE(estimated_value, 0)::float8 FROM lighthouse.donations WHERE supporter_id = @id",
                conn))
            {
                cmd.Parameters.AddWithValue("id", (long)supporterId);
                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    donations.Add(new DonationRow
                    {
                        DonationDate = reader.IsDBNull(0) ? SnapshotDate : reader.GetDateTime(0),
                        IsRecurring = !reader.IsDBNull(1) && reader.GetBoolean(1),
                        EstimatedValue = reader.IsDBNull(2) ? 0 : reader.GetDouble(2),
                    });
                }
            }

            if (donations.Count == 0)
                return NotFound(new { error = $"Supporter {supporterId} has no donations to cluster." });

            var (features, freq, monTotal, monAvg, recency, tenure, hasRecurring) =
                ComputeFeatures(donations);

            var (bestCluster, bestDist, allDistances) = AssignCluster(features, artifact);
            var arch = artifact.Archetypes[bestCluster];

            var neighbors = allDistances
                .Select(d => new NeighborClusterDto
                {
                    ClusterId = d.clusterId,
                    Label = artifact.Archetypes[d.clusterId].Label,
                    Distance = Math.Round(d.dist, 4),
                })
                .OrderBy(d => d.Distance)
                .ToList();

            var result = new DetailedDonorArchetypeDto
            {
                SupporterId = supporter.SupporterId,
                DisplayName = supporter.DisplayName,
                SupporterType = supporter.SupporterType,
                Country = supporter.Country,
                Status = supporter.Status,
                Frequency = freq,
                MonetaryTotal = Math.Round(monTotal, 2),
                MonetaryAvg = Math.Round(monAvg, 2),
                RecencyDays = recency,
                TenureDays = tenure,
                HasRecurring = hasRecurring,
                AssignedClusterId = bestCluster,
                ArchetypeLabel = arch.Label,
                ArchetypeColor = arch.Color,
                ArchetypeTagline = arch.Tagline,
                DistanceToCentroid = Math.Round(bestDist, 4),
                ArchetypeStrategy = arch.Strategy,
                DistanceToOtherCentroids = neighbors,
            };

            return Ok(result);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message, type = ex.GetType().Name });
        }
    }

    // -------------------------------------------------------------------------
    // GET /api/donor-archetypes/model-info
    // -------------------------------------------------------------------------
    [HttpGet("model-info")]
    public IActionResult GetModelInfo()
    {
        try
        {
            var artifact = Artifact.Value;
            return Ok(new
            {
                donorCount = artifact.NDonors,
                nClusters = artifact.NClusters,
                silhouette = Math.Round(artifact.Silhouette, 4),
                trainedAt = artifact.TrainedAtUtc,
                snapshotDate = artifact.SnapshotDate,
                modelName = $"K-means ({artifact.NClusters} archetypes)",
                interpretation = artifact.Interpretation,
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message, type = ex.GetType().Name });
        }
    }

    // -------------------------------------------------------------------------
    // Feature computation — must mirror the Python training script exactly
    // -------------------------------------------------------------------------
    private static (double[] features, int frequency, double monTotal, double monAvg,
        int recencyDays, int tenureDays, bool hasRecurring)
        ComputeFeatures(List<DonationRow> donations)
    {
        var frequency = donations.Count;
        var monetaryTotal = donations.Sum(d => d.EstimatedValue);
        var monetaryAvg = monetaryTotal / frequency;
        var maxDate = donations.Max(d => d.DonationDate);
        var minDate = donations.Min(d => d.DonationDate);
        var recencyDays = (int)(SnapshotDate - maxDate).TotalDays;
        var tenureDays = Math.Max((int)(SnapshotDate - minDate).TotalDays, 1);
        var hasRecurring = donations.Any(d => d.IsRecurring);

        var features = new double[6];
        features[0] = frequency;
        features[1] = Math.Log(1 + monetaryTotal);
        features[2] = Math.Log(1 + monetaryAvg);
        features[3] = recencyDays;
        features[4] = tenureDays;
        features[5] = hasRecurring ? 1.0 : 0.0;

        return (features, frequency, monetaryTotal, monetaryAvg, recencyDays, tenureDays, hasRecurring);
    }

    private static (int bestCluster, double bestDist, (int clusterId, double dist)[] allDistances)
        AssignCluster(double[] features, ArtifactData artifact)
    {
        var standardized = new double[features.Length];
        for (var i = 0; i < features.Length; i++)
            standardized[i] = (features[i] - artifact.ScalerMean[i]) / artifact.ScalerScale[i];

        var bestCluster = -1;
        var bestDist = double.MaxValue;
        var allDistances = new (int clusterId, double dist)[artifact.Centroids.Count];

        for (var c = 0; c < artifact.Centroids.Count; c++)
        {
            double sumSq = 0;
            for (var i = 0; i < standardized.Length; i++)
            {
                var d = standardized[i] - artifact.Centroids[c][i];
                sumSq += d * d;
            }

            var dist = Math.Sqrt(sumSq);
            allDistances[c] = (c, dist);
            if (dist < bestDist)
            {
                bestDist = dist;
                bestCluster = c;
            }
        }

        return (bestCluster, bestDist, allDistances);
    }

    // -------------------------------------------------------------------------
    // Data loading
    // -------------------------------------------------------------------------
    private static async Task<(List<SupporterRow> supporters, Dictionary<int, List<DonationRow>> donationsBySupporter)>
        LoadSupportersAndDonationsAsync(AppDbContext dbContext)
    {
        var connectionString = dbContext.Database.GetConnectionString()!;
        var supporters = new List<SupporterRow>();
        var donations = new List<(int supporterId, DonationRow row)>();

        await using var conn = new NpgsqlConnection(connectionString);
        await conn.OpenAsync();

        await using (var cmd = new NpgsqlCommand(
            "SELECT supporter_id, display_name, supporter_type, country, status FROM lighthouse.supporters",
            conn))
        await using (var reader = await cmd.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                supporters.Add(new SupporterRow
                {
                    SupporterId = (int)reader.GetInt64(0),
                    DisplayName = reader.IsDBNull(1) ? "" : reader.GetString(1),
                    SupporterType = reader.IsDBNull(2) ? "" : reader.GetString(2),
                    Country = reader.IsDBNull(3) ? "" : reader.GetString(3),
                    Status = reader.IsDBNull(4) ? "" : reader.GetString(4),
                });
            }
        }

        await using (var cmd = new NpgsqlCommand(
            "SELECT supporter_id, donation_date, is_recurring, COALESCE(estimated_value, 0)::float8 FROM lighthouse.donations WHERE supporter_id IS NOT NULL",
            conn))
        await using (var reader = await cmd.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                var sid = (int)reader.GetInt64(0);
                donations.Add((sid, new DonationRow
                {
                    DonationDate = reader.IsDBNull(1) ? SnapshotDate : reader.GetDateTime(1),
                    IsRecurring = !reader.IsDBNull(2) && reader.GetBoolean(2),
                    EstimatedValue = reader.IsDBNull(3) ? 0 : reader.GetDouble(3),
                }));
            }
        }

        var donationsBySupporter = donations
            .GroupBy(d => d.supporterId)
            .ToDictionary(g => g.Key, g => g.Select(x => x.row).ToList());

        return (supporters, donationsBySupporter);
    }

    // -------------------------------------------------------------------------
    // Artifact loading
    // -------------------------------------------------------------------------
    private static ArtifactData LoadArtifact()
    {
        var path = FindArtifactFile();
        var json = System.IO.File.ReadAllText(path);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        var scaler = root.GetProperty("scaler");
        var scalerMean = scaler.GetProperty("mean").EnumerateArray().Select(e => e.GetDouble()).ToArray();
        var scalerScale = scaler.GetProperty("scale").EnumerateArray().Select(e => e.GetDouble()).ToArray();

        var centroids = root.GetProperty("centroids")
            .EnumerateArray()
            .Select(row => row.EnumerateArray().Select(v => v.GetDouble()).ToArray())
            .ToList();

        var featureOrder = root.GetProperty("feature_order")
            .EnumerateArray().Select(e => e.GetString() ?? "").ToArray();

        var archetypes = new Dictionary<int, ArchetypeMeta>();
        foreach (var prop in root.GetProperty("archetypes").EnumerateObject())
        {
            var clusterId = int.Parse(prop.Name);
            var obj = prop.Value;
            var ch = obj.GetProperty("characteristics");
            archetypes[clusterId] = new ArchetypeMeta
            {
                ClusterId = clusterId,
                Label = obj.GetProperty("label").GetString() ?? "",
                Tagline = obj.GetProperty("tagline").GetString() ?? "",
                Color = obj.GetProperty("color").GetString() ?? "",
                Strategy = obj.GetProperty("strategy").GetString() ?? "",
                Size = obj.GetProperty("size").GetInt32(),
                Characteristics = new CharacteristicsMeta
                {
                    MeanFrequency = ch.GetProperty("mean_frequency").GetDouble(),
                    MeanMonetaryTotal = ch.GetProperty("mean_monetary_total").GetDouble(),
                    MeanMonetaryAvg = ch.GetProperty("mean_monetary_avg").GetDouble(),
                    MeanRecencyDays = ch.GetProperty("mean_recency_days").GetDouble(),
                    MeanTenureDays = ch.GetProperty("mean_tenure_days").GetDouble(),
                    RecurringPct = ch.GetProperty("recurring_pct").GetDouble(),
                },
            };
        }

        return new ArtifactData
        {
            FeatureOrder = featureOrder,
            ScalerMean = scalerMean,
            ScalerScale = scalerScale,
            Centroids = centroids,
            Archetypes = archetypes,
            NDonors = root.GetProperty("n_donors").GetInt32(),
            NClusters = root.GetProperty("n_clusters").GetInt32(),
            Silhouette = root.GetProperty("silhouette").GetDouble(),
            TrainedAtUtc = root.TryGetProperty("trained_at_utc", out var ta) ? ta.GetString() ?? "" : "",
            SnapshotDate = root.TryGetProperty("snapshot_date", out var sd) ? sd.GetString() ?? "" : "",
            Interpretation = root.TryGetProperty("interpretation", out var ip) ? ip.GetString() ?? "" : "",
        };
    }

    private static string FindArtifactFile()
    {
        string[] searchPaths =
        [
            Path.Combine(Directory.GetCurrentDirectory(), "..", "..", "is455", "ml-pipelines", "models",
                "pipeline_07_donor_archetypes.json"),
            Path.Combine(Directory.GetCurrentDirectory(), "is455", "ml-pipelines", "models",
                "pipeline_07_donor_archetypes.json"),
            Path.Combine(Directory.GetCurrentDirectory(), "..", "is455", "ml-pipelines", "models",
                "pipeline_07_donor_archetypes.json"),
        ];

        foreach (var p in searchPaths)
        {
            var resolved = Path.GetFullPath(p);
            if (System.IO.File.Exists(resolved)) return resolved;
        }

        throw new FileNotFoundException(
            $"Donor archetype artifact not found. Searched: {string.Join(", ", searchPaths.Select(Path.GetFullPath))}");
    }

    // -------------------------------------------------------------------------
    // Internal types
    // -------------------------------------------------------------------------
    private class SupporterRow
    {
        public int SupporterId { get; init; }
        public string DisplayName { get; init; } = "";
        public string SupporterType { get; init; } = "";
        public string Country { get; init; } = "";
        public string Status { get; init; } = "";
    }

    private class DonationRow
    {
        public DateTime DonationDate { get; init; }
        public bool IsRecurring { get; init; }
        public double EstimatedValue { get; init; }
    }

    private class ArtifactData
    {
        public string[] FeatureOrder { get; init; } = Array.Empty<string>();
        public double[] ScalerMean { get; init; } = Array.Empty<double>();
        public double[] ScalerScale { get; init; } = Array.Empty<double>();
        public List<double[]> Centroids { get; init; } = new();
        public Dictionary<int, ArchetypeMeta> Archetypes { get; init; } = new();
        public int NDonors { get; init; }
        public int NClusters { get; init; }
        public double Silhouette { get; init; }
        public string TrainedAtUtc { get; init; } = "";
        public string SnapshotDate { get; init; } = "";
        public string Interpretation { get; init; } = "";
    }

    private class ArchetypeMeta
    {
        public int ClusterId { get; init; }
        public string Label { get; init; } = "";
        public string Tagline { get; init; } = "";
        public string Color { get; init; } = "";
        public string Strategy { get; init; } = "";
        public int Size { get; init; }
        public CharacteristicsMeta Characteristics { get; init; } = new();
    }

    private class CharacteristicsMeta
    {
        public double MeanFrequency { get; init; }
        public double MeanMonetaryTotal { get; init; }
        public double MeanMonetaryAvg { get; init; }
        public double MeanRecencyDays { get; init; }
        public double MeanTenureDays { get; init; }
        public double RecurringPct { get; init; }
    }
}

// =============================================================================
// DTOs
// =============================================================================

public record DonorArchetypeDto
{
    public int SupporterId { get; init; }
    public string DisplayName { get; init; } = "";
    public string SupporterType { get; init; } = "";
    public string Country { get; init; } = "";
    public string Status { get; init; } = "";
    public int Frequency { get; init; }
    public double MonetaryTotal { get; init; }
    public double MonetaryAvg { get; init; }
    public int RecencyDays { get; init; }
    public int TenureDays { get; init; }
    public bool HasRecurring { get; init; }
    public int AssignedClusterId { get; init; }
    public string ArchetypeLabel { get; init; } = "";
    public string ArchetypeColor { get; init; } = "";
    public string ArchetypeTagline { get; init; } = "";
    public double DistanceToCentroid { get; init; }
}

public record DetailedDonorArchetypeDto : DonorArchetypeDto
{
    public string ArchetypeStrategy { get; init; } = "";
    public List<NeighborClusterDto> DistanceToOtherCentroids { get; init; } = new();
}

public record NeighborClusterDto
{
    public int ClusterId { get; init; }
    public string Label { get; init; } = "";
    public double Distance { get; init; }
}

public record ArchetypeProfileDto
{
    public int ClusterId { get; init; }
    public string Label { get; init; } = "";
    public string Tagline { get; init; } = "";
    public string Color { get; init; } = "";
    public string Strategy { get; init; } = "";
    public int Size { get; init; }
    public ArchetypeCharacteristicsDto Characteristics { get; init; } = new();
}

public record ArchetypeCharacteristicsDto
{
    public double MeanFrequency { get; init; }
    public double MeanMonetaryTotal { get; init; }
    public double MeanMonetaryAvg { get; init; }
    public double MeanRecencyDays { get; init; }
    public double MeanTenureDays { get; init; }
    public double RecurringPct { get; init; }
}
