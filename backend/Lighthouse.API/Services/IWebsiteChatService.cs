namespace Lighthouse.API.Services;

public interface IWebsiteChatService
{
    Task<string> AskAsync(string userMessage, CancellationToken cancellationToken);
}

