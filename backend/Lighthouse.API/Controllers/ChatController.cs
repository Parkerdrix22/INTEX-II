using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Lighthouse.API.Data;
using Lighthouse.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Lighthouse.API.Controllers;

// =============================================================================
// ChatController
//
// Anthropic-powered help chat. Authenticated users only.
//
// Per-donor isolation: when the logged-in user has a supporter_id claim
// (set by AuthController on login), the controller queries Postgres for THAT
// donor's giving history and passes it to the chat service as ChatDonorContext.
// supporter_id comes from the cookie claim, NEVER from the request body, so
// Donor B can never see Donor A's data even if they edit the request.
//
// Heavy lifting (Anthropic API call, system prompt, model fallback) lives in
// IWebsiteChatService — this controller is just orchestration.
// =============================================================================

[ApiController]
[Route("api/chat")]
[Authorize]
public class ChatController(IWebsiteChatService chatService) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Ask(
        [FromBody] ChatRequest request,
        [FromServices] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var message = (request.Message ?? string.Empty).Trim();
        if (message.Length is < 1 or > 2000)
        {
            return BadRequest(new { message = "Message must be between 1 and 2000 characters." });
        }

        try
        {
            // ---- Identity from cookie claims (NOT from request body) ----
            var displayName = User.FindFirst(ClaimTypes.Name)?.Value ?? "Friend";
            var role = User.FindFirst(ClaimTypes.Role)?.Value ?? "User";
            var supporterIdClaim = User.FindFirst("supporter_id")?.Value;

            // ---- Per-donor context (only if user is linked to a supporter) ----
            ChatDonorContext? donorContext = null;
            if (!string.IsNullOrWhiteSpace(supporterIdClaim) && long.TryParse(supporterIdClaim, out var supporterId))
            {
                donorContext = await BuildDonorContext(supporterId, dbContext, cancellationToken);
            }

            var answer = await chatService.AskAsync(
                userMessage: message,
                userDisplayName: displayName,
                userRole: role,
                donorContext: donorContext,
                cancellationToken: cancellationToken);

            return Ok(new { answer });
        }
        catch (InvalidOperationException ex)
        {
            // Surfaces config / API errors with their original message (useful for debugging)
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = ex.Message });
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ChatController] {ex.GetType().Name}: {ex.Message}");
            return StatusCode(StatusCodes.Status500InternalServerError, new
            {
                message = "Sorry — I couldn't answer that right now. Please try again in a moment."
            });
        }
    }

    // -------------------------------------------------------------------------
    // Donor context — pulls THIS donor's giving history (and ONLY this donor's)
    // -------------------------------------------------------------------------
    private static async Task<ChatDonorContext?> BuildDonorContext(
        long supporterId,
        AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var connectionString = dbContext.Database.GetConnectionString()!;
        await using var conn = new NpgsqlConnection(connectionString);
        await conn.OpenAsync(cancellationToken);

        string displayName = "";
        string supporterType = "";
        string country = "";

        await using (var cmd = new NpgsqlCommand(
            "SELECT display_name, supporter_type, country FROM lighthouse.supporters WHERE supporter_id = @id", conn))
        {
            cmd.Parameters.AddWithValue("id", supporterId);
            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                displayName = reader.IsDBNull(0) ? "" : reader.GetString(0);
                supporterType = reader.IsDBNull(1) ? "" : reader.GetString(1);
                country = reader.IsDBNull(2) ? "" : reader.GetString(2);
            }
            else
            {
                return null;  // Supporter doesn't exist
            }
        }

        int donationCount = 0;
        double totalDonated = 0;
        string? firstDonation = null;
        string? lastDonation = null;

        await using (var cmd = new NpgsqlCommand(@"
            SELECT
                COUNT(*)::int                              AS donation_count,
                COALESCE(SUM(estimated_value), 0)::float8  AS total_donated,
                MIN(donation_date)                          AS first_date,
                MAX(donation_date)                          AS last_date
            FROM lighthouse.donations
            WHERE supporter_id = @id", conn))
        {
            cmd.Parameters.AddWithValue("id", supporterId);
            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                donationCount = reader.GetInt32(0);
                totalDonated = Math.Round(reader.GetDouble(1), 2);
                firstDonation = reader.IsDBNull(2) ? null : reader.GetDateTime(2).ToString("yyyy-MM-dd");
                lastDonation = reader.IsDBNull(3) ? null : reader.GetDateTime(3).ToString("yyyy-MM-dd");
            }
        }

        var programAreas = new List<(string, double)>();
        await using (var cmd = new NpgsqlCommand(@"
            SELECT da.program_area, COALESCE(SUM(da.amount_allocated), 0)::float8 AS amount
            FROM lighthouse.donation_allocations da
            JOIN lighthouse.donations d ON d.donation_id = da.donation_id
            WHERE d.supporter_id = @id
            GROUP BY da.program_area
            ORDER BY amount DESC", conn))
        {
            cmd.Parameters.AddWithValue("id", supporterId);
            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                programAreas.Add((
                    reader.IsDBNull(0) ? "Unknown" : reader.GetString(0),
                    Math.Round(reader.GetDouble(1), 2)
                ));
            }
        }

        var safehouses = new List<string>();
        await using (var cmd = new NpgsqlCommand(@"
            SELECT DISTINCT s.name, s.city, s.country
            FROM lighthouse.donation_allocations da
            JOIN lighthouse.donations d ON d.donation_id = da.donation_id
            JOIN lighthouse.safehouses s ON s.safehouse_id = da.safehouse_id
            WHERE d.supporter_id = @id", conn))
        {
            cmd.Parameters.AddWithValue("id", supporterId);
            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var name = reader.IsDBNull(0) ? "" : reader.GetString(0);
                var city = reader.IsDBNull(1) ? "" : reader.GetString(1);
                var ctry = reader.IsDBNull(2) ? "" : reader.GetString(2);
                safehouses.Add($"{name} ({city}, {ctry})");
            }
        }

        return new ChatDonorContext
        {
            DisplayName = displayName,
            SupporterType = supporterType,
            Country = country,
            DonationCount = donationCount,
            TotalDonated = totalDonated,
            FirstDonation = firstDonation,
            LastDonation = lastDonation,
            ProgramAreas = programAreas,
            Safehouses = safehouses,
        };
    }
}

public sealed class ChatRequest
{
    [Required]
    public string Message { get; set; } = string.Empty;
}
