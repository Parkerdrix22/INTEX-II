using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Lighthouse.API.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Lighthouse.API.Controllers;

// =============================================================================
// ChatController
//
// Help chatbot powered by Anthropic's Claude API. Authenticated users only.
//
// If the logged-in user is linked to a supporter (Donor role with SupporterId),
// the controller pulls their *personal* giving history out of Postgres and
// passes it as system-prompt context — so they can ask "how much have I given?"
// or "which safehouses have I funded?" and get accurate answers about THEIR
// donations only. Donor B never sees Donor A's data because the supporter_id
// is read from the auth cookie's claims, not the request body.
//
// API key lives in the ANTHROPIC_API_KEY env var (set on Azure App Service,
// not in source control).
// =============================================================================

[ApiController]
[Route("api/chat")]
[Authorize]
public class ChatController : ControllerBase
{
    private const string AnthropicEndpoint = "https://api.anthropic.com/v1/messages";
    private const string AnthropicVersion = "2023-06-01";
    private const string ModelId = "claude-haiku-4-5";

    // Single shared HttpClient — recommended pattern to avoid socket exhaustion
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(30) };

    [HttpPost]
    public async Task<IActionResult> Chat(
        [FromBody] ChatRequest request,
        [FromServices] AppDbContext dbContext)
    {
        if (string.IsNullOrWhiteSpace(request.Message))
        {
            return BadRequest(new { answer = "Please type a question." });
        }

        var apiKey = Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY");
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return StatusCode(503, new
            {
                answer = "The chat service is not configured yet. (Missing ANTHROPIC_API_KEY.)"
            });
        }

        try
        {
            // ---- Read identity from cookie claims (not request body!) ----
            var displayName = User.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value ?? "Friend";
            var role = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value ?? "User";
            var supporterIdClaim = User.FindFirst("supporter_id")?.Value;

            // ---- Fetch donor context if applicable ----
            DonorContext? donorContext = null;
            if (!string.IsNullOrWhiteSpace(supporterIdClaim) && long.TryParse(supporterIdClaim, out var supporterId))
            {
                donorContext = await BuildDonorContext(supporterId, dbContext);
            }

            // ---- Build system prompt + call Anthropic ----
            var systemPrompt = BuildSystemPrompt(displayName, role, donorContext);
            var answer = await CallAnthropic(apiKey, systemPrompt, request.Message);

            return Ok(new { answer });
        }
        catch (Exception ex)
        {
            // Don't surface internal error details to users — but log them server-side
            Console.Error.WriteLine($"[ChatController] Error: {ex.GetType().Name}: {ex.Message}");
            return StatusCode(500, new
            {
                answer = "Sorry — I couldn't answer that right now. Please try again in a moment."
            });
        }
    }

    // -------------------------------------------------------------------------
    // Donor context — pulls THIS donor's giving history (and ONLY this donor's)
    // -------------------------------------------------------------------------
    private static async Task<DonorContext?> BuildDonorContext(long supporterId, AppDbContext dbContext)
    {
        var connectionString = dbContext.Database.GetConnectionString()!;
        await using var conn = new NpgsqlConnection(connectionString);
        await conn.OpenAsync();

        var ctx = new DonorContext { SupporterId = supporterId };

        // Supporter info
        await using (var cmd = new NpgsqlCommand(
            "SELECT display_name, supporter_type, country FROM lighthouse.supporters WHERE supporter_id = @id", conn))
        {
            cmd.Parameters.AddWithValue("id", supporterId);
            await using var reader = await cmd.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                ctx.DisplayName = reader.IsDBNull(0) ? "" : reader.GetString(0);
                ctx.SupporterType = reader.IsDBNull(1) ? "" : reader.GetString(1);
                ctx.Country = reader.IsDBNull(2) ? "" : reader.GetString(2);
            }
            else
            {
                return null;  // supporter doesn't exist; chat works without context
            }
        }

        // Donation summary
        await using (var cmd = new NpgsqlCommand(@"
            SELECT
                COUNT(*)::int                                    AS donation_count,
                COALESCE(SUM(estimated_value), 0)::float8        AS total_donated,
                MIN(donation_date)                                AS first_date,
                MAX(donation_date)                                AS last_date
            FROM lighthouse.donations
            WHERE supporter_id = @id", conn))
        {
            cmd.Parameters.AddWithValue("id", supporterId);
            await using var reader = await cmd.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                ctx.DonationCount = reader.GetInt32(0);
                ctx.TotalDonated = Math.Round(reader.GetDouble(1), 2);
                ctx.FirstDonation = reader.IsDBNull(2) ? null : reader.GetDateTime(2).ToString("yyyy-MM-dd");
                ctx.LastDonation = reader.IsDBNull(3) ? null : reader.GetDateTime(3).ToString("yyyy-MM-dd");
            }
        }

        // Program area breakdown
        await using (var cmd = new NpgsqlCommand(@"
            SELECT da.program_area, COALESCE(SUM(da.amount_allocated), 0)::float8 AS amount
            FROM lighthouse.donation_allocations da
            JOIN lighthouse.donations d ON d.donation_id = da.donation_id
            WHERE d.supporter_id = @id
            GROUP BY da.program_area
            ORDER BY amount DESC", conn))
        {
            cmd.Parameters.AddWithValue("id", supporterId);
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                ctx.ProgramAreas.Add((
                    Area: reader.IsDBNull(0) ? "Unknown" : reader.GetString(0),
                    Amount: Math.Round(reader.GetDouble(1), 2)
                ));
            }
        }

        // Safehouses funded
        await using (var cmd = new NpgsqlCommand(@"
            SELECT DISTINCT s.name, s.city, s.country
            FROM lighthouse.donation_allocations da
            JOIN lighthouse.donations d ON d.donation_id = da.donation_id
            JOIN lighthouse.safehouses s ON s.safehouse_id = da.safehouse_id
            WHERE d.supporter_id = @id", conn))
        {
            cmd.Parameters.AddWithValue("id", supporterId);
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                var name = reader.IsDBNull(0) ? "" : reader.GetString(0);
                var city = reader.IsDBNull(1) ? "" : reader.GetString(1);
                var country = reader.IsDBNull(2) ? "" : reader.GetString(2);
                ctx.Safehouses.Add($"{name} ({city}, {country})");
            }
        }

        return ctx;
    }

    // -------------------------------------------------------------------------
    // System prompt construction
    // -------------------------------------------------------------------------
    private static string BuildSystemPrompt(string displayName, string role, DonorContext? donor)
    {
        var sb = new StringBuilder();
        sb.AppendLine("You are a warm, concise help assistant for the Kateri website — a nonprofit");
        sb.AppendLine("inspired by Lighthouse Sanctuary that protects Native American women and girls");
        sb.AppendLine("from sexual abuse and trafficking. The site has these main pages:");
        sb.AppendLine("- Home: mission and overview");
        sb.AppendLine("- Our Impact: public-facing impact statistics and stories");
        sb.AppendLine("- Donor Portal / Donor Dashboard: gift history, volunteer signup, donation forms");
        sb.AppendLine("- Donor Impact: personalized 'where your dollars went' breakdown for each donor");
        sb.AppendLine("- Resident Risk Triage (staff only): ML-based prioritization of residents needing attention");
        sb.AppendLine("- Case Resolution (staff only): predicts which residents are ready for case closure");
        sb.AppendLine("- Donor Retention (staff only): churn-risk dashboard");
        sb.AppendLine("- Donor Archetypes (staff only): K-means donor segmentation");
        sb.AppendLine("- Post Planner (staff only): predicts engagement for social media posts");
        sb.AppendLine();
        sb.AppendLine($"CURRENT USER: {displayName} (role: {role})");
        sb.AppendLine();

        if (donor != null)
        {
            sb.AppendLine("DONOR DATA — this is the CURRENT USER's personal giving history. Use these");
            sb.AppendLine("numbers exactly when answering personal questions; do not invent figures.");
            sb.AppendLine($"- Display name:    {donor.DisplayName}");
            sb.AppendLine($"- Supporter type:  {donor.SupporterType}");
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
            sb.AppendLine("you can only see giving history for accounts linked to a supporter profile,");
            sb.AppendLine("and they should contact staff if their account isn't connected.");
        }

        sb.AppendLine();
        sb.AppendLine("GUIDELINES:");
        sb.AppendLine("- Be warm, encouraging, and HUMAN. You're talking to people who care about");
        sb.AppendLine("  the mission.");
        sb.AppendLine("- For donor-specific questions, use ONLY the data above. Never invent numbers.");
        sb.AppendLine("- Never share information about other donors. Each user only sees their own.");
        sb.AppendLine("- For navigation questions, point users to the right page by name.");
        sb.AppendLine("- Keep responses to 2-4 sentences unless detail is requested.");
        sb.AppendLine("- If you don't know something, say so honestly. Don't guess.");

        return sb.ToString();
    }

    // -------------------------------------------------------------------------
    // Anthropic API call (raw HttpClient — no SDK dependency)
    // -------------------------------------------------------------------------
    private static async Task<string> CallAnthropic(string apiKey, string systemPrompt, string userMessage)
    {
        var payload = new
        {
            model = ModelId,
            max_tokens = 512,
            system = systemPrompt,
            messages = new[]
            {
                new { role = "user", content = userMessage }
            }
        };

        using var req = new HttpRequestMessage(HttpMethod.Post, AnthropicEndpoint);
        req.Headers.Add("x-api-key", apiKey);
        req.Headers.Add("anthropic-version", AnthropicVersion);
        req.Content = new StringContent(
            JsonSerializer.Serialize(payload),
            Encoding.UTF8,
            "application/json");

        using var resp = await Http.SendAsync(req);
        var body = await resp.Content.ReadAsStringAsync();

        if (!resp.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Anthropic API returned {(int)resp.StatusCode}: {body}");
        }

        // Response shape: { content: [{ type: "text", text: "..." }], ... }
        using var doc = JsonDocument.Parse(body);
        if (doc.RootElement.TryGetProperty("content", out var content) && content.ValueKind == JsonValueKind.Array)
        {
            foreach (var block in content.EnumerateArray())
            {
                if (block.TryGetProperty("type", out var t) && t.GetString() == "text"
                    && block.TryGetProperty("text", out var text))
                {
                    return text.GetString() ?? "";
                }
            }
        }

        return "I'm not sure how to answer that. Could you rephrase?";
    }
}

// =============================================================================
// DTOs
// =============================================================================

public record ChatRequest
{
    public string Message { get; init; } = "";
}

internal class DonorContext
{
    public long SupporterId { get; set; }
    public string DisplayName { get; set; } = "";
    public string SupporterType { get; set; } = "";
    public string Country { get; set; } = "";
    public int DonationCount { get; set; }
    public double TotalDonated { get; set; }
    public string? FirstDonation { get; set; }
    public string? LastDonation { get; set; }
    public List<(string Area, double Amount)> ProgramAreas { get; } = new();
    public List<string> Safehouses { get; } = new();
}
