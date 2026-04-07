using Lighthouse.API.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;
using Npgsql;

namespace Lighthouse.API.Controllers;

[ApiController]
[Route("api/social-media-planner")]
public class SocialMediaPlannerController : ControllerBase
{
    private static readonly Lazy<InferenceSession> Session = new(() =>
    {
        var modelPath = FindModelFile();
        return new InferenceSession(modelPath);
    });

    private static string FindModelFile()
    {
        // Search relative to the app for the ONNX model
        string[] searchPaths =
        [
            Path.Combine(Directory.GetCurrentDirectory(), "..", "..", "is455", "ml-pipelines", "models",
                "pipeline_03_social_media_gbr.onnx"),
            Path.Combine(Directory.GetCurrentDirectory(), "is455", "ml-pipelines", "models",
                "pipeline_03_social_media_gbr.onnx"),
            Path.Combine(Directory.GetCurrentDirectory(), "..", "is455", "ml-pipelines", "models",
                "pipeline_03_social_media_gbr.onnx"),
        ];

        foreach (var p in searchPaths)
        {
            var resolved = Path.GetFullPath(p);
            if (System.IO.File.Exists(resolved)) return resolved;
        }

        throw new FileNotFoundException(
            $"ONNX model not found. Searched: {string.Join(", ", searchPaths.Select(Path.GetFullPath))}");
    }

    // All 50 feature names in exact ONNX input order
    private static readonly string[] FeatureNames =
    [
        "caption_length", "num_hashtags", "mentions_count", "post_hour",
        "log_follower_count", "is_boosted", "has_call_to_action",
        "features_resident_story", "is_weekend", "has_campaign",
        "platform_Facebook", "platform_Instagram", "platform_LinkedIn",
        "platform_TikTok", "platform_Twitter", "platform_WhatsApp", "platform_YouTube",
        "post_type_Campaign", "post_type_EducationalContent", "post_type_EventPromotion",
        "post_type_FundraisingAppeal", "post_type_ImpactStory", "post_type_ThankYou",
        "media_type_Carousel", "media_type_Photo", "media_type_Reel",
        "media_type_Text", "media_type_Video",
        "content_topic_AwarenessRaising", "content_topic_CampaignLaunch",
        "content_topic_DonorImpact", "content_topic_Education", "content_topic_EventRecap",
        "content_topic_Gratitude", "content_topic_Health", "content_topic_Reintegration",
        "content_topic_SafehouseLife",
        "sentiment_tone_Celebratory", "sentiment_tone_Emotional", "sentiment_tone_Grateful",
        "sentiment_tone_Hopeful", "sentiment_tone_Informative", "sentiment_tone_Urgent",
        "day_of_week_Friday", "day_of_week_Monday", "day_of_week_Saturday",
        "day_of_week_Sunday", "day_of_week_Thursday", "day_of_week_Tuesday",
        "day_of_week_Wednesday"
    ];

    [HttpPost("predict")]
    public IActionResult Predict([FromBody] PostPlanRequest request)
    {
        try
        {
            var features = BuildFeatureVector(request);

            // Each feature is a named input tensor of shape [1, 1]
            var inputs = new List<NamedOnnxValue>();
            for (var i = 0; i < FeatureNames.Length; i++)
            {
                var tensor = new DenseTensor<float>(new[] { features[i] }, new[] { 1, 1 });
                inputs.Add(NamedOnnxValue.CreateFromTensor(FeatureNames[i], tensor));
            }

            using var results = Session.Value.Run(inputs);
            var output = results.First(r => r.Name == "variable");
            var prediction = output.AsTensor<float>().First();

            // Clamp to reasonable range
            var engagementRate = Math.Max(0, Math.Min(prediction, 1.0f));

            return Ok(new PredictionResponse
            {
                EngagementRate = Math.Round(engagementRate * 100, 2),
                Rating = engagementRate switch
                {
                    >= 0.08f => "Excellent",
                    >= 0.05f => "Strong",
                    >= 0.03f => "Average",
                    >= 0.015f => "Below Average",
                    _ => "Low"
                },
                Percentile = EstimatePercentile(engagementRate),
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }

    [HttpGet("options")]
    public IActionResult GetOptions()
    {
        return Ok(new
        {
            platforms = new[] { "Facebook", "Instagram", "LinkedIn", "TikTok", "Twitter", "WhatsApp", "YouTube" },
            postTypes = new[] { "Campaign", "EducationalContent", "EventPromotion", "FundraisingAppeal", "ImpactStory", "ThankYou" },
            mediaTypes = new[] { "Carousel", "Photo", "Reel", "Text", "Video" },
            contentTopics = new[] { "AwarenessRaising", "CampaignLaunch", "DonorImpact", "Education", "EventRecap", "Gratitude", "Health", "Reintegration", "SafehouseLife" },
            sentimentTones = new[] { "Celebratory", "Emotional", "Grateful", "Hopeful", "Informative", "Urgent" },
            daysOfWeek = new[] { "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday" },
        });
    }

    [HttpGet("model-info")]
    public async Task<IActionResult> GetModelInfo(
        [FromServices] AppDbContext dbContext)
    {
        // Live count from the database
        var postCount = await dbContext.Database
            .SqlQueryRaw<int>("SELECT COUNT(*)::int AS \"Value\" FROM lighthouse.social_media_posts")
            .FirstAsync();

        // Read latest training metrics from the JSON file
        double r2 = 0.76;
        string? trainedAt = null;
        try
        {
            var metricsPath = Path.Combine(
                FindModelFile().Replace("pipeline_03_social_media_gbr.onnx", ""),
                "training_metrics.json");
            if (System.IO.File.Exists(metricsPath))
            {
                var json = await System.IO.File.ReadAllTextAsync(metricsPath);
                var doc = System.Text.Json.JsonDocument.Parse(json);
                if (doc.RootElement.TryGetProperty("pipeline_03_social_media", out var p3))
                {
                    if (p3.TryGetProperty("metrics", out var metrics) &&
                        metrics.TryGetProperty("r2", out var r2Val))
                        r2 = r2Val.GetDouble();
                    if (p3.TryGetProperty("trained_at", out var ta))
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
            postCount,
            r2 = Math.Round(r2, 4),
            trainedAt,
            modelName = "Gradient Boosting Regressor",
        });
    }

    // -------------------------------------------------------------------------
    // GET /api/social-media-planner/attribution
    //
    // Closes the loop on Pipeline 3: instead of just predicting engagement,
    // show which posts actually DROVE DONATIONS via the donations.referral_post_id
    // foreign key. Answers the client's #1 question: "do likes turn into dollars?"
    //
    // Returns:
    //   - Headline KPIs (total attributed revenue, donation count, coverage %)
    //   - Revenue rollups by post_type, content_topic, platform
    //   - Top 10 individual revenue-generating posts
    //   - Engagement-vs-revenue scatter (only posts with attributed donations)
    // -------------------------------------------------------------------------
    [HttpGet("attribution")]
    public async Task<IActionResult> GetAttribution([FromServices] AppDbContext dbContext)
    {
        try
        {
            var connectionString = dbContext.Database.GetConnectionString()!;
            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync();

            // ---- Headline numbers --------------------------------------------------
            int totalDonations = 0;
            int attributedDonations = 0;
            double attributedRevenue = 0;
            await using (var cmd = new NpgsqlCommand(@"
                SELECT
                    COUNT(*)::int                                     AS total_donations,
                    COUNT(referral_post_id)::int                      AS attributed_donations,
                    COALESCE(SUM(estimated_value) FILTER
                        (WHERE referral_post_id IS NOT NULL), 0)::float8 AS attributed_revenue
                FROM lighthouse.donations", conn))
            await using (var reader = await cmd.ExecuteReaderAsync())
            {
                if (await reader.ReadAsync())
                {
                    totalDonations = reader.GetInt32(0);
                    attributedDonations = reader.GetInt32(1);
                    attributedRevenue = reader.GetDouble(2);
                }
            }

            // ---- Rollup helper -----------------------------------------------------
            async Task<List<AttributionGroupDto>> Rollup(string column)
            {
                var sql = $@"
                    SELECT
                        smp.{column}                                   AS category,
                        COUNT(DISTINCT smp.post_id)::bigint            AS post_count,
                        COUNT(d.donation_id)::bigint                   AS donation_count,
                        COALESCE(SUM(d.estimated_value), 0)::float8    AS revenue,
                        COALESCE(AVG(d.estimated_value), 0)::float8    AS avg_donation,
                        COALESCE(AVG(smp.engagement_rate), 0)::float8  AS avg_engagement
                    FROM lighthouse.social_media_posts smp
                    LEFT JOIN lighthouse.donations d
                        ON d.referral_post_id = smp.post_id
                    WHERE smp.{column} IS NOT NULL
                    GROUP BY smp.{column}
                    ORDER BY revenue DESC";

                var rows = new List<AttributionGroupDto>();
                await using var cmd = new NpgsqlCommand(sql, conn);
                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    var posts = (int)reader.GetInt64(1);
                    var revenue = reader.GetDouble(3);
                    rows.Add(new AttributionGroupDto
                    {
                        Category = reader.IsDBNull(0) ? "" : reader.GetString(0),
                        PostCount = posts,
                        DonationCount = (int)reader.GetInt64(2),
                        Revenue = Math.Round(revenue, 2),
                        AvgDonation = Math.Round(reader.GetDouble(4), 2),
                        AvgEngagementRate = Math.Round(reader.GetDouble(5), 4),
                        RevenuePerPost = Math.Round(posts > 0 ? revenue / posts : 0, 2),
                    });
                }
                return rows;
            }

            var byPostType = await Rollup("post_type");
            var byContentTopic = await Rollup("content_topic");
            var byPlatform = await Rollup("platform");

            // ---- Top revenue-generating posts --------------------------------------
            var topPosts = new List<TopPostDto>();
            await using (var cmd = new NpgsqlCommand(@"
                SELECT
                    smp.post_id,
                    smp.post_type,
                    smp.content_topic,
                    smp.platform,
                    smp.sentiment_tone,
                    COALESCE(smp.engagement_rate, 0)::float8       AS engagement_rate,
                    COUNT(d.donation_id)::bigint                   AS donation_count,
                    COALESCE(SUM(d.estimated_value), 0)::float8    AS revenue,
                    smp.created_at
                FROM lighthouse.social_media_posts smp
                INNER JOIN lighthouse.donations d
                    ON d.referral_post_id = smp.post_id
                GROUP BY smp.post_id, smp.post_type, smp.content_topic, smp.platform,
                         smp.sentiment_tone, smp.engagement_rate, smp.created_at
                ORDER BY revenue DESC
                LIMIT 10", conn))
            await using (var reader = await cmd.ExecuteReaderAsync())
            {
                while (await reader.ReadAsync())
                {
                    topPosts.Add(new TopPostDto
                    {
                        PostId = reader.GetInt64(0),
                        PostType = reader.IsDBNull(1) ? "" : reader.GetString(1),
                        ContentTopic = reader.IsDBNull(2) ? "" : reader.GetString(2),
                        Platform = reader.IsDBNull(3) ? "" : reader.GetString(3),
                        SentimentTone = reader.IsDBNull(4) ? "" : reader.GetString(4),
                        EngagementRate = Math.Round(reader.GetDouble(5), 4),
                        DonationCount = (int)reader.GetInt64(6),
                        Revenue = Math.Round(reader.GetDouble(7), 2),
                        CreatedAt = reader.IsDBNull(8) ? null : reader.GetDateTime(8).ToString("yyyy-MM-dd"),
                    });
                }
            }

            // ---- Engagement vs revenue scatter (per-post points with attribution) --
            var scatter = new List<ScatterPointDto>();
            await using (var cmd = new NpgsqlCommand(@"
                SELECT
                    smp.post_id,
                    smp.post_type,
                    COALESCE(smp.engagement_rate, 0)::float8     AS engagement_rate,
                    COALESCE(SUM(d.estimated_value), 0)::float8  AS revenue
                FROM lighthouse.social_media_posts smp
                INNER JOIN lighthouse.donations d
                    ON d.referral_post_id = smp.post_id
                WHERE smp.engagement_rate IS NOT NULL
                GROUP BY smp.post_id, smp.post_type, smp.engagement_rate", conn))
            await using (var reader = await cmd.ExecuteReaderAsync())
            {
                while (await reader.ReadAsync())
                {
                    scatter.Add(new ScatterPointDto
                    {
                        PostId = reader.GetInt64(0),
                        PostType = reader.IsDBNull(1) ? "" : reader.GetString(1),
                        EngagementRate = Math.Round(reader.GetDouble(2), 4),
                        Revenue = Math.Round(reader.GetDouble(3), 2),
                    });
                }
            }

            return Ok(new AttributionResponse
            {
                TotalDonations = totalDonations,
                AttributedDonations = attributedDonations,
                AttributedRevenue = Math.Round(attributedRevenue, 2),
                AttributionCoveragePct = totalDonations > 0
                    ? Math.Round(100.0 * attributedDonations / totalDonations, 2)
                    : 0,
                ByPostType = byPostType,
                ByContentTopic = byContentTopic,
                ByPlatform = byPlatform,
                TopPosts = topPosts,
                EngagementVsRevenue = scatter,
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message, type = ex.GetType().Name });
        }
    }

    private static float[] BuildFeatureVector(PostPlanRequest r)
    {
        var f = new float[50];

        // Numeric features
        f[0] = r.CaptionLength;
        f[1] = r.NumHashtags;
        f[2] = r.MentionsCount;
        f[3] = r.PostHour;
        f[4] = MathF.Log(1 + r.FollowerCount); // log1p
        f[5] = r.IsBoosted ? 1f : 0f;
        f[6] = r.HasCallToAction ? 1f : 0f;
        f[7] = r.FeaturesResidentStory ? 1f : 0f;
        f[8] = r.DayOfWeek is "Saturday" or "Sunday" ? 1f : 0f;
        f[9] = r.HasCampaign ? 1f : 0f;

        // One-hot: platform (indices 10-16)
        SetOneHot(f, 10, ["Facebook", "Instagram", "LinkedIn", "TikTok", "Twitter", "WhatsApp", "YouTube"],
            r.Platform);

        // One-hot: post type (indices 17-22)
        SetOneHot(f, 17,
            ["Campaign", "EducationalContent", "EventPromotion", "FundraisingAppeal", "ImpactStory", "ThankYou"],
            r.PostType);

        // One-hot: media type (indices 23-27)
        SetOneHot(f, 23, ["Carousel", "Photo", "Reel", "Text", "Video"], r.MediaType);

        // One-hot: content topic (indices 28-36)
        SetOneHot(f, 28,
        [
            "AwarenessRaising", "CampaignLaunch", "DonorImpact", "Education", "EventRecap", "Gratitude",
            "Health", "Reintegration", "SafehouseLife"
        ], r.ContentTopic);

        // One-hot: sentiment tone (indices 37-42)
        SetOneHot(f, 37, ["Celebratory", "Emotional", "Grateful", "Hopeful", "Informative", "Urgent"],
            r.SentimentTone);

        // One-hot: day of week (indices 43-49)
        SetOneHot(f, 43, ["Friday", "Monday", "Saturday", "Sunday", "Thursday", "Tuesday", "Wednesday"],
            r.DayOfWeek);

        return f;
    }

    private static void SetOneHot(float[] features, int startIdx, string[] categories, string value)
    {
        for (var i = 0; i < categories.Length; i++)
            features[startIdx + i] = string.Equals(categories[i], value, StringComparison.OrdinalIgnoreCase)
                ? 1f
                : 0f;
    }

    private static int EstimatePercentile(float rate)
    {
        // Based on training data distribution (approximate)
        return rate switch
        {
            >= 0.10f => 95,
            >= 0.08f => 85,
            >= 0.06f => 70,
            >= 0.05f => 55,
            >= 0.04f => 40,
            >= 0.03f => 25,
            >= 0.02f => 15,
            _ => 5
        };
    }
}

public record PostPlanRequest
{
    public string Platform { get; init; } = "Instagram";
    public string PostType { get; init; } = "ImpactStory";
    public string MediaType { get; init; } = "Photo";
    public string ContentTopic { get; init; } = "DonorImpact";
    public string SentimentTone { get; init; } = "Hopeful";
    public string DayOfWeek { get; init; } = "Tuesday";
    public int CaptionLength { get; init; } = 150;
    public int NumHashtags { get; init; } = 5;
    public int MentionsCount { get; init; } = 1;
    public int PostHour { get; init; } = 10;
    public int FollowerCount { get; init; } = 5000;
    public bool IsBoosted { get; init; }
    public bool HasCallToAction { get; init; } = true;
    public bool FeaturesResidentStory { get; init; }
    public bool HasCampaign { get; init; }
}

// =============================================================================
// Attribution endpoint DTOs
// =============================================================================

public record AttributionResponse
{
    public int TotalDonations { get; init; }
    public int AttributedDonations { get; init; }
    public double AttributedRevenue { get; init; }
    public double AttributionCoveragePct { get; init; }
    public List<AttributionGroupDto> ByPostType { get; init; } = new();
    public List<AttributionGroupDto> ByContentTopic { get; init; } = new();
    public List<AttributionGroupDto> ByPlatform { get; init; } = new();
    public List<TopPostDto> TopPosts { get; init; } = new();
    public List<ScatterPointDto> EngagementVsRevenue { get; init; } = new();
}

public record AttributionGroupDto
{
    public string Category { get; init; } = "";
    public int PostCount { get; init; }
    public int DonationCount { get; init; }
    public double Revenue { get; init; }
    public double AvgDonation { get; init; }
    public double AvgEngagementRate { get; init; }
    public double RevenuePerPost { get; init; }
}

public record TopPostDto
{
    public long PostId { get; init; }
    public string PostType { get; init; } = "";
    public string ContentTopic { get; init; } = "";
    public string Platform { get; init; } = "";
    public string SentimentTone { get; init; } = "";
    public double EngagementRate { get; init; }
    public int DonationCount { get; init; }
    public double Revenue { get; init; }
    public string? CreatedAt { get; init; }
}

public record ScatterPointDto
{
    public long PostId { get; init; }
    public string PostType { get; init; } = "";
    public double EngagementRate { get; init; }
    public double Revenue { get; init; }
}

public record PredictionResponse
{
    public double EngagementRate { get; init; }
    public string Rating { get; init; } = "";
    public int Percentile { get; init; }
}
