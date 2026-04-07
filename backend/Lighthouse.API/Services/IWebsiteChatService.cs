namespace Lighthouse.API.Services;

/// <summary>
/// Optional per-user context that gets injected into the chat system prompt.
/// When the caller is a logged-in donor with a linked supporter profile, this
/// is populated from Postgres so the chatbot can answer "how much have I given?"
/// type questions correctly. When null, the chatbot acts as a generic site help
/// assistant.
/// </summary>
public sealed class ChatDonorContext
{
    public string DisplayName { get; init; } = "";
    public string SupporterType { get; init; } = "";
    public string Country { get; init; } = "";
    public int DonationCount { get; init; }
    public double TotalDonated { get; init; }
    public string? FirstDonation { get; init; }
    public string? LastDonation { get; init; }
    public List<(string Area, double Amount)> ProgramAreas { get; init; } = new();
    public List<string> Safehouses { get; init; } = new();
}

public interface IWebsiteChatService
{
    Task<string> AskAsync(
        string userMessage,
        string userDisplayName,
        string userRole,
        ChatDonorContext? donorContext,
        CancellationToken cancellationToken);
}
