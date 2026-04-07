using System.ComponentModel.DataAnnotations;
using Lighthouse.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Lighthouse.API.Controllers;

[ApiController]
[Route("api/chat")]
public class ChatController(IWebsiteChatService chatService) : ControllerBase
{
    [HttpPost]
    [AllowAnonymous]
    public async Task<IActionResult> Ask([FromBody] ChatRequest request, CancellationToken cancellationToken)
    {
        var message = request.Message.Trim();
        if (message.Length is < 1 or > 2000)
        {
            return BadRequest(new { message = "Message must be between 1 and 2000 characters." });
        }

        try
        {
            var answer = await chatService.AskAsync(message, cancellationToken);
            return Ok(new { answer });
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = ex.Message });
        }
        catch
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = "Chat service failed." });
        }
    }
}

public sealed class ChatRequest
{
    [Required]
    public string Message { get; set; } = string.Empty;
}

