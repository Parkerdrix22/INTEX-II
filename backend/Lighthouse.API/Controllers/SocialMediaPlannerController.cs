using Lighthouse.API.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;

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

public record PredictionResponse
{
    public double EngagementRate { get; init; }
    public string Rating { get; init; } = "";
    public int Percentile { get; init; }
}
