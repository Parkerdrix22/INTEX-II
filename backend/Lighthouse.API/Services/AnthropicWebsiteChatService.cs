using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using System.Net;

namespace Lighthouse.API.Services;

public sealed class AnthropicWebsiteChatService(IHttpClientFactory httpClientFactory, IConfiguration configuration) : IWebsiteChatService
{
    public async Task<string> AskAsync(string userMessage, CancellationToken cancellationToken)
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
        var model = string.IsNullOrWhiteSpace(configuredModel) ? "claude-3-5-sonnet-latest" : configuredModel!;

        var client = httpClientFactory.CreateClient(nameof(AnthropicWebsiteChatService));

        var systemPrompt = """
You are the helpful assistant for the "Kateri" Lighthouse website.

Your job is to answer questions about what the website does and how to use it.
If the user asks something unrelated to the website, politely say you can only help with questions about this site.

What the site contains (high level):
- Public pages: Home (/), Login (/login), Sign up (/signup), Our Impact (/impact)
- Donor portal: /donor-dashboard (Donor/Admin/Staff)
- Resident dashboard: /resident-dashboard (Resident)
- Staff/Admin tools (Admin/Staff): Admin dashboard (/admin-dashboard), Donors & Contributions (/donors-contributions),
  Caseload Inventory (/caseload-inventory), Process Recording (/process-recording), Home Visitation (/home-visitation),
  Reports & Analytics (/reports-analytics), Post Planner (/post-planner)

Behavior rules:
- Be concise and actionable.
- When relevant, mention the correct route name (URL path) and what role can access it.
- Do not invent features that are not listed above.
""";

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

