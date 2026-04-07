using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using System.Net;

namespace Lighthouse.API.Services;

public sealed class AnthropicWebsiteChatService(IHttpClientFactory httpClientFactory, IConfiguration configuration) : IWebsiteChatService
{
    public async Task<string> AskAsync(
        string userMessage,
        string userDisplayName,
        string userRole,
        ChatDonorContext? donorContext,
        CancellationToken cancellationToken)
    {
        var apiKey =
            configuration["Anthropic:ApiKey"]
            ?? configuration["Anthropic__ApiKey"]
            ?? configuration["ANTHROPIC_API_KEY"];

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException(
                "Missing Anthropic API key. Set Anthropic__ApiKey (recommended) or ANTHROPIC_API_KEY in your environment.");
        }

        var configuredModel = configuration["Anthropic:Model"] ?? configuration["Anthropic__Model"];
        // Default to Haiku — fastest + cheapest, plenty for FAQ-style chat.
        var model = string.IsNullOrWhiteSpace(configuredModel) ? "claude-haiku-4-5" : configuredModel!;

        var client = httpClientFactory.CreateClient(nameof(AnthropicWebsiteChatService));

        var systemPrompt = BuildSystemPrompt(userDisplayName, userRole, donorContext);

        var payload = new
        {
            model,
            max_tokens = 400,
            temperature = 0.2,
            system = systemPrompt,
            messages = new object[]
            {
                new
                {
                    role = "user",
                    content = new object[]
                    {
                        new { type = "text", text = userMessage },
                    },
                },
            },
        };

        var anthropicVersion = configuration["Anthropic:Version"] ?? configuration["Anthropic__Version"] ?? "2023-06-01";

        async Task<(HttpStatusCode status, string body, string? requestId)> sendOnce(string modelId)
        {
            var bodyPayload = new
            {
                model = modelId,
                max_tokens = payload.max_tokens,
                temperature = payload.temperature,
                system = payload.system,
                messages = payload.messages,
            };

            using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages");
            request.Headers.Add("x-api-key", apiKey);
            request.Headers.Add("anthropic-version", anthropicVersion);
            request.Content = new StringContent(JsonSerializer.Serialize(bodyPayload), Encoding.UTF8, "application/json");

            using var response = await client.SendAsync(request, cancellationToken);
            var raw = await response.Content.ReadAsStringAsync(cancellationToken);
            var requestId = response.Headers.TryGetValues("request-id", out var values) ? values.FirstOrDefault() : null;
            return (response.StatusCode, raw, requestId);
        }

        var (status, raw, requestId) = await sendOnce(model);

        // If the configured/default model isn't available for this key, discover a usable one and retry once.
        if (status == HttpStatusCode.NotFound && LooksLikeModelNotFound(raw))
        {
            var fallbackModel = await DiscoverFallbackModelAsync(client, apiKey, anthropicVersion, cancellationToken);
            if (!string.IsNullOrWhiteSpace(fallbackModel))
            {
                (status, raw, requestId) = await sendOnce(fallbackModel);
            }
        }

        if (status is < HttpStatusCode.OK or >= HttpStatusCode.MultipleChoices)
        {
            var suffix = string.IsNullOrWhiteSpace(requestId) ? string.Empty : $" request-id={requestId}";
            var body = raw.Length > 1800 ? raw[..1800] + "…" : raw;
            throw new InvalidOperationException($"Anthropic request failed ({(int)status}).{suffix} Body: {body}");
        }

        return ExtractTextFromAnthropicMessagesJson(raw) ?? "Sorry — I couldn’t generate a response.";
    }

    private static string BuildSystemPrompt(string userDisplayName, string userRole, ChatDonorContext? donor)
    {
        var sb = new StringBuilder();
        sb.AppendLine("You are a warm, concise help assistant for the Kateri website — a nonprofit");
        sb.AppendLine("inspired by Lighthouse Sanctuary that protects Native American women and girls");
        sb.AppendLine("from sexual abuse and trafficking. The site has these main pages:");
        sb.AppendLine();
        sb.AppendLine("Public pages:");
        sb.AppendLine("- Home (/) — mission and overview");
        sb.AppendLine("- Our Impact (/impact) — public stats and stories");
        sb.AppendLine("- Login (/login) and Sign up (/signup)");
        sb.AppendLine();
        sb.AppendLine("For donors (Donor/Admin/Staff):");
        sb.AppendLine("- Donor Portal (/donor-dashboard) — gift history, donation form, volunteer signup");
        sb.AppendLine("- Donor Impact (/donor-impact) — personalized 'where your dollars went' breakdown");
        sb.AppendLine();
        sb.AppendLine("For staff (Admin/Staff only):");
        sb.AppendLine("- Admin Dashboard (/admin-dashboard)");
        sb.AppendLine("- Donors & Contributions (/donors-contributions)");
        sb.AppendLine("- Caseload Inventory (/caseload-inventory)");
        sb.AppendLine("- Resident Risk Triage (/resident-risk-triage) — ML model flagging at-risk residents");
        sb.AppendLine("- Case Resolution (/case-resolution) — predicts who's ready for case closure");
        sb.AppendLine("- Donor Retention (/donor-churn) — churn-risk dashboard");
        sb.AppendLine("- Donor Archetypes (/donor-archetypes) — K-means donor segmentation");
        sb.AppendLine("- Post Planner (/post-planner) — predicts engagement for social media posts");
        sb.AppendLine("- Process Recording (/process-recording) and Home Visitation (/home-visitation)");
        sb.AppendLine("- Reports & Analytics (/reports-analytics)");
        sb.AppendLine();
        sb.AppendLine($"CURRENT USER: {userDisplayName} (role: {userRole})");
        sb.AppendLine();

        if (donor != null)
        {
            sb.AppendLine("DONOR DATA — this is the CURRENT USER's personal giving history. Use these");
            sb.AppendLine("numbers exactly when answering personal questions; never invent figures.");
            sb.AppendLine($"- Display name:    {donor.DisplayName}");
            if (!string.IsNullOrEmpty(donor.SupporterType))
                sb.AppendLine($"- Supporter type:  {donor.SupporterType}");
            if (!string.IsNullOrEmpty(donor.Country))
                sb.AppendLine($"- Country:         {donor.Country}");
            sb.AppendLine($"- Total donated:   ${donor.TotalDonated:N2}");
            sb.AppendLine($"- # of donations:  {donor.DonationCount}");
            if (!string.IsNullOrEmpty(donor.FirstDonation))
                sb.AppendLine($"- First donation:  {donor.FirstDonation}");
            if (!string.IsNullOrEmpty(donor.LastDonation))
                sb.AppendLine($"- Last donation:   {donor.LastDonation}");

            if (donor.ProgramAreas.Count > 0)
            {
                sb.AppendLine("- Program areas funded:");
                foreach (var (area, amount) in donor.ProgramAreas)
                    sb.AppendLine($"    • {area}: ${amount:N2}");
            }
            if (donor.Safehouses.Count > 0)
            {
                sb.AppendLine("- Safehouses supported:");
                foreach (var sh in donor.Safehouses)
                    sb.AppendLine($"    • {sh}");
            }
        }
        else
        {
            sb.AppendLine("This user is NOT linked to a donor record, so you don't have personal");
            sb.AppendLine("giving data for them. If they ask about 'their' donations, kindly explain");
            sb.AppendLine("you only have personal giving data for accounts linked to a supporter");
            sb.AppendLine("profile, and they should contact staff if their account isn't connected.");
        }

        sb.AppendLine();
        sb.AppendLine("GUIDELINES:");
        sb.AppendLine("- Be warm, encouraging, and human. You're talking to people who care.");
        sb.AppendLine("- For donor-specific questions, use ONLY the data above. Never invent numbers.");
        sb.AppendLine("- Never share information about other donors. Each user only sees their own.");
        sb.AppendLine("- For navigation questions, mention the route by name (e.g. /donor-impact).");
        sb.AppendLine("- Keep responses to 2-4 sentences unless the user asks for more detail.");
        sb.AppendLine("- If you don't know something, say so honestly. Don't guess.");

        return sb.ToString();
    }

    private static bool LooksLikeModelNotFound(string rawJson)
    {
        try
        {
            using var doc = JsonDocument.Parse(rawJson);
            var root = doc.RootElement;
            if (!root.TryGetProperty("error", out var error)) return false;
            if (!error.TryGetProperty("type", out var typeEl)) return false;
            return typeEl.ValueKind == JsonValueKind.String && typeEl.GetString() == "not_found_error";
        }
        catch
        {
            return false;
        }
    }

    private static async Task<string?> DiscoverFallbackModelAsync(
        HttpClient client,
        string apiKey,
        string anthropicVersion,
        CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "https://api.anthropic.com/v1/models?limit=50");
        request.Headers.Add("x-api-key", apiKey);
        request.Headers.Add("anthropic-version", anthropicVersion);

        using var response = await client.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
            return null;

        var raw = await response.Content.ReadAsStringAsync(cancellationToken);
        try
        {
            using var doc = JsonDocument.Parse(raw);
            var root = doc.RootElement;
            if (!root.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array)
                return null;

            // Prefer latest Sonnet if present; else just take the newest model returned.
            string? first = null;
            foreach (var item in data.EnumerateArray())
            {
                if (!item.TryGetProperty("id", out var idEl) || idEl.ValueKind != JsonValueKind.String)
                    continue;

                var id = idEl.GetString();
                if (string.IsNullOrWhiteSpace(id))
                    continue;

                first ??= id;

                if (id.Contains("sonnet", StringComparison.OrdinalIgnoreCase))
                    return id;
            }

            return first;
        }
        catch
        {
            return null;
        }
    }

    private static string? ExtractTextFromAnthropicMessagesJson(string rawJson)
    {
        try
        {
            using var doc = JsonDocument.Parse(rawJson);
            var root = doc.RootElement;

            if (!root.TryGetProperty("content", out var content) || content.ValueKind != JsonValueKind.Array)
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
                    var text = textEl.GetString();
                    if (!string.IsNullOrWhiteSpace(text))
                    {
                        if (sb.Length > 0) sb.Append("\n");
                        sb.Append(text.Trim());
                    }
                }
            }

            return sb.Length == 0 ? null : sb.ToString();
        }
        catch
        {
            return null;
        }
    }
}

