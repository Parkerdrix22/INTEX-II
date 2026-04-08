using Lighthouse.API.Data;

namespace Lighthouse.API.Services;

// =============================================================================
// ThankYouDrafterService
//
// Given a supporter_id, pulls their giving history + program allocations from
// the lighthouse schema, hands everything to Claude with a structured prompt,
// and returns a {Subject, Body} ready for staff to review, edit, and send.
//
// This is a staff tool — the endpoint is [Authorize(Roles="Admin,Staff")]. The
// idea is "draft the email so the staff member only has to proofread, not
// compose from scratch." The output is never sent automatically.
// =============================================================================

public sealed class ThankYouDraft
{
    public string Subject { get; init; } = "";
    public string Body { get; init; } = "";
    public string Tone { get; init; } = "";
    public string Model { get; init; } = "";
}

public interface IThankYouDrafterService
{
    /// <summary>
    /// Draft a personalized thank-you email for the given supporter.
    /// Tone can be "warm" (default), "formal", or "playful".
    /// </summary>
    Task<ThankYouDraft> DraftAsync(
        int supporterId,
        string tone,
        AppDbContext dbContext,
        CancellationToken cancellationToken = default);
}
