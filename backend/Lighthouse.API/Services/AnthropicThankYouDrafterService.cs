using System.Net;
using System.Text;
using System.Text.Json;
using Lighthouse.API.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Npgsql;

namespace Lighthouse.API.Services;

public sealed class AnthropicThankYouDrafterService(
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration) : IThankYouDrafterService
{
    public async Task<ThankYouDraft> DraftAsync(
        int supporterId,
        string tone,
        AppDbContext dbContext,
        CancellationToken cancellationToken = default)
    {
        var apiKey =
            configuration["Anthropic:ApiKey"]
            ?? configuration["Anthropic__ApiKey"]
            ?? configuration["ANTHROPIC_API_KEY"]
            ?? throw new InvalidOperationException(
                "Missing Anthropic API key. Set Anthropic__ApiKey or ANTHROPIC_API_KEY.");

        var normalizedTone = NormalizeTone(tone);
        var profile = await LoadDonorProfileAsync(supporterId, dbContext, cancellationToken);
        if (profile is null)
            throw new InvalidOperationException($"Supporter {supporterId} not found or has no donations yet.");

        var systemPrompt = BuildSystemPrompt(normalizedTone);
        var userPrompt = BuildUserPrompt(profile);

        var configuredModel = configuration["Anthropic:Model"] ?? configuration["Anthropic__Model"];
        var model = string.IsNullOrWhiteSpace(configuredModel) ? "claude-haiku-4-5" : configuredModel!;
        var anthropicVersion = configuration["Anthropic:Version"] ?? configuration["Anthropic__Version"] ?? "2023-06-01";
        var client = httpClientFactory.CreateClient(nameof(AnthropicThankYouDrafterService));

        var payload = new
        {
            model,
            max_tokens = 800,
            temperature = 0.7, // higher than the chat service — we want some warmth/variety
            system = systemPrompt,
            messages = new object[]
            {
                new
                {
                    role = "user",
                    content = new object[]
                    {
                        new { type = "text", text = userPrompt },
                    },
                },
            },
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages");
        request.Headers.Add("x-api-key", apiKey);
        request.Headers.Add("anthropic-version", anthropicVersion);
        request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        using var response = await client.SendAsync(request, cancellationToken);
        var raw = await response.Content.ReadAsStringAsync(cancellationToken);

        if (response.StatusCode is < HttpStatusCode.OK or >= HttpStatusCode.MultipleChoices)
        {
            var body = raw.Length > 1800 ? raw[..1800] + "…" : raw;
            throw new InvalidOperationException($"Anthropic request failed ({(int)response.StatusCode}): {body}");
        }

        var text = ExtractTextFromAnthropicJson(raw)
            ?? throw new InvalidOperationException("Claude returned no text content for thank-you draft.");

        var (subject, bodyText) = ParseDraftJson(text);

        return new ThankYouDraft
        {
            Subject = subject,
            Body = bodyText,
            Tone = normalizedTone,
            Model = model,
        };
    }

    // -------------------------------------------------------------------------
    // Data loading — pull everything Claude needs to personalize the email
    // -------------------------------------------------------------------------
    private static async Task<DonorProfile?> LoadDonorProfileAsync(
        int supporterId,
        AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var connectionString = dbContext.Database.GetConnectionString()!;
        await using var conn = new NpgsqlConnection(connectionString);
        await conn.OpenAsync(cancellationToken);

        // ── Supporter metadata ────────────────────────────────────────────
        DonorProfile? profile = null;
        await using (var cmd = new NpgsqlCommand(
            """
            SELECT display_name, supporter_type, country, region, status, relationship_type
            FROM lighthouse.supporters
            WHERE supporter_id = @id
            """, conn))
        {
            cmd.Parameters.AddWithValue("id", (long)supporterId);
            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                profile = new DonorProfile
                {
                    SupporterId = supporterId,
                    DisplayName = reader.IsDBNull(0) ? "" : reader.GetString(0),
                    SupporterType = reader.IsDBNull(1) ? "" : reader.GetString(1),
                    Country = reader.IsDBNull(2) ? "" : reader.GetString(2),
                    Region = reader.IsDBNull(3) ? "" : reader.GetString(3),
                    Status = reader.IsDBNull(4) ? "" : reader.GetString(4),
                    RelationshipType = reader.IsDBNull(5) ? "" : reader.GetString(5),
                };
            }
        }

        if (profile is null) return null;

        // ── Donation history summary ──────────────────────────────────────
        await using (var cmd = new NpgsqlCommand(
            """
            SELECT
                COUNT(*)::int                                         AS donation_count,
                COALESCE(SUM(estimated_value), 0)::float8             AS total_value,
                COALESCE(MIN(donation_date), NOW()::date)             AS first_date,
                COALESCE(MAX(donation_date), NOW()::date)             AS last_date,
                BOOL_OR(COALESCE(is_recurring, false))                AS has_recurring,
                ARRAY_AGG(DISTINCT donation_type)                     AS donation_types
            FROM lighthouse.donations
            WHERE supporter_id = @id
            """, conn))
        {
            cmd.Parameters.AddWithValue("id", (long)supporterId);
            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                profile.DonationCount = reader.GetInt32(0);
                profile.TotalValue = (decimal)reader.GetDouble(1);
                profile.FirstDonation = reader.GetDateTime(2);
                profile.LastDonation = reader.GetDateTime(3);
                profile.HasRecurring = !reader.IsDBNull(4) && reader.GetBoolean(4);
                if (!reader.IsDBNull(5))
                {
                    var types = (string[])reader.GetValue(5);
                    profile.DonationTypes = types.Where(t => !string.IsNullOrWhiteSpace(t)).ToList();
                }
            }
        }

        // ── Program area + safehouse allocations ──────────────────────────
        await using (var cmd = new NpgsqlCommand(
            """
            SELECT
                da.program_area,
                SUM(da.amount_allocated)::float8 AS allocated
            FROM lighthouse.donation_allocations da
            JOIN lighthouse.donations d ON d.donation_id = da.donation_id
            WHERE d.supporter_id = @id AND da.program_area IS NOT NULL
            GROUP BY da.program_area
            ORDER BY allocated DESC
            """, conn))
        {
            cmd.Parameters.AddWithValue("id", (long)supporterId);
            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                profile.ProgramAreaBreakdown.Add(
                    (reader.GetString(0), (decimal)reader.GetDouble(1)));
            }
        }

        await using (var cmd = new NpgsqlCommand(
            """
            SELECT DISTINCT s.name
            FROM lighthouse.donation_allocations da
            JOIN lighthouse.donations d ON d.donation_id = da.donation_id
            JOIN lighthouse.safehouses s ON s.safehouse_id = da.safehouse_id
            WHERE d.supporter_id = @id
            ORDER BY s.name
            """, conn))
        {
            cmd.Parameters.AddWithValue("id", (long)supporterId);
            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                profile.Safehouses.Add(reader.GetString(0));
            }
        }

        return profile;
    }

    // -------------------------------------------------------------------------
    // Prompt construction
    // -------------------------------------------------------------------------
    private static string BuildSystemPrompt(string tone)
    {
        var toneGuidance = tone switch
        {
            "formal" => "Use a formal, professional tone — suitable for a major-gift donor or corporate sponsor. "
                        + "Full names, complete sentences, minimal exclamation marks.",
            "playful" => "Use a warm, slightly playful tone — genuine and personal but with a light touch. "
                         + "First names OK, occasional (appropriate) warmth.",
            _ => "Use a warm, sincere, grateful tone — human and personal, never saccharine. "
                 + "Write like a real person thanking a real friend of the organization.",
        };

        return $$"""
You are drafting a thank-you email on behalf of Kateri, a nonprofit inspired
by Lighthouse Sanctuary that protects Native American women and girls who
have survived sexual abuse and trafficking. The recipient is a donor, and
a staff member will review and send the email.

{{toneGuidance}}

STRICT RULES:
- Use ONLY the donor data provided in the user message. Never invent facts,
  dollar amounts, safehouses, or program areas.
- Reference at least one specific detail from their giving history
  (e.g., the program area they've funded the most, a safehouse their
  gifts have supported, or the length of their giving relationship).
- Keep the email to 3-5 short paragraphs. No walls of text.
- Do NOT ask for another donation. This is a gratitude email, not a pitch.
- Do NOT include placeholders like [NAME] — fill everything in from the data.
- Do NOT mention you are an AI. You are writing on behalf of Kateri staff.

RESPONSE FORMAT:
Return ONLY a raw JSON object with exactly two string keys: "subject" and "body".
The body should include a greeting, 2-4 short paragraphs, and a sign-off from
"The Kateri Team". No markdown in the JSON output.

Example (illustrative only — adapt to the real donor data):
{"subject":"Thank you for standing with Kateri","body":"Dear Sara,\n\nThank you...\n\n...\n\nWith gratitude,\nThe Kateri Team"}
""";
    }

    private static string BuildUserPrompt(DonorProfile donor)
    {
        var sb = new StringBuilder();
        sb.AppendLine("Please draft a thank-you email for this donor:");
        sb.AppendLine();
        sb.AppendLine($"Display name: {donor.DisplayName}");
        if (!string.IsNullOrWhiteSpace(donor.SupporterType))
            sb.AppendLine($"Supporter type: {donor.SupporterType}");
        if (!string.IsNullOrWhiteSpace(donor.RelationshipType))
            sb.AppendLine($"Relationship: {donor.RelationshipType}");
        if (!string.IsNullOrWhiteSpace(donor.Country))
            sb.AppendLine($"Country: {donor.Country}{(string.IsNullOrWhiteSpace(donor.Region) ? "" : ", " + donor.Region)}");
        sb.AppendLine($"Status: {donor.Status}");
        sb.AppendLine();
        sb.AppendLine($"Total contributed: ${donor.TotalValue:N2} (estimated USD value)");
        sb.AppendLine($"Number of gifts: {donor.DonationCount}");
        sb.AppendLine($"First donation: {donor.FirstDonation:MMMM yyyy}");
        sb.AppendLine($"Most recent gift: {donor.LastDonation:MMMM d, yyyy}");
        sb.AppendLine($"Recurring donor: {(donor.HasRecurring ? "Yes" : "No")}");
        if (donor.DonationTypes.Count > 0)
            sb.AppendLine($"Gift types: {string.Join(", ", donor.DonationTypes)}");

        if (donor.ProgramAreaBreakdown.Count > 0)
        {
            sb.AppendLine();
            sb.AppendLine("Program areas funded (by dollar amount):");
            foreach (var (area, amount) in donor.ProgramAreaBreakdown.Take(5))
                sb.AppendLine($"  - {area}: ${amount:N2}");
        }

        if (donor.Safehouses.Count > 0)
        {
            sb.AppendLine();
            sb.AppendLine($"Safehouses their gifts have helped sustain: {string.Join(", ", donor.Safehouses)}");
        }

        sb.AppendLine();
        sb.AppendLine("Draft the email now, returning ONLY a JSON object with \"subject\" and \"body\".");
        return sb.ToString();
    }

    // -------------------------------------------------------------------------
    // Response parsing
    // -------------------------------------------------------------------------
    private static (string subject, string body) ParseDraftJson(string text)
    {
        // Claude often wraps JSON in ```json fences despite instructions. Strip them.
        var cleaned = text.Trim();
        if (cleaned.StartsWith("```"))
        {
            var firstNewline = cleaned.IndexOf('\n');
            if (firstNewline >= 0) cleaned = cleaned[(firstNewline + 1)..];
            if (cleaned.EndsWith("```"))
                cleaned = cleaned[..^3];
            cleaned = cleaned.Trim();
        }

        // Sometimes Claude prefixes with text like "Here is the email:" — grab
        // the first {...} block only.
        var firstBrace = cleaned.IndexOf('{');
        var lastBrace = cleaned.LastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace)
            cleaned = cleaned[firstBrace..(lastBrace + 1)];

        try
        {
            using var doc = JsonDocument.Parse(cleaned);
            var root = doc.RootElement;
            var subject = root.TryGetProperty("subject", out var s) && s.ValueKind == JsonValueKind.String
                ? s.GetString() ?? ""
                : "";
            var body = root.TryGetProperty("body", out var b) && b.ValueKind == JsonValueKind.String
                ? b.GetString() ?? ""
                : "";

            if (string.IsNullOrWhiteSpace(subject) || string.IsNullOrWhiteSpace(body))
                throw new InvalidOperationException("Claude returned JSON without subject/body fields.");

            return (subject.Trim(), body.Trim());
        }
        catch (JsonException)
        {
            throw new InvalidOperationException(
                $"Claude did not return valid JSON. Raw response: {text[..Math.Min(400, text.Length)]}");
        }
    }

    private static string? ExtractTextFromAnthropicJson(string rawJson)
    {
        try
        {
            using var doc = JsonDocument.Parse(rawJson);
            if (!doc.RootElement.TryGetProperty("content", out var content) || content.ValueKind != JsonValueKind.Array)
                return null;

            var sb = new StringBuilder();
            foreach (var part in content.EnumerateArray())
            {
                if (part.TryGetProperty("type", out var typeEl)
                    && typeEl.ValueKind == JsonValueKind.String
                    && typeEl.GetString() == "text"
                    && part.TryGetProperty("text", out var textEl)
                    && textEl.ValueKind == JsonValueKind.String)
                {
                    sb.Append(textEl.GetString());
                }
            }
            return sb.Length == 0 ? null : sb.ToString();
        }
        catch
        {
            return null;
        }
    }

    private static string NormalizeTone(string? tone) => tone?.Trim().ToLowerInvariant() switch
    {
        "formal" => "formal",
        "playful" => "playful",
        _ => "warm",
    };

    // -------------------------------------------------------------------------
    // Internal profile type passed from the loader to the prompt builder.
    // -------------------------------------------------------------------------
    private sealed class DonorProfile
    {
        public int SupporterId { get; set; }
        public string DisplayName { get; set; } = "";
        public string SupporterType { get; set; } = "";
        public string Country { get; set; } = "";
        public string Region { get; set; } = "";
        public string Status { get; set; } = "";
        public string RelationshipType { get; set; } = "";
        public int DonationCount { get; set; }
        public decimal TotalValue { get; set; }
        public DateTime FirstDonation { get; set; }
        public DateTime LastDonation { get; set; }
        public bool HasRecurring { get; set; }
        public List<string> DonationTypes { get; set; } = new();
        public List<(string Area, decimal Amount)> ProgramAreaBreakdown { get; } = new();
        public List<string> Safehouses { get; } = new();
    }
}
