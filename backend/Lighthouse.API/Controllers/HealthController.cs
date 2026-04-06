using Lighthouse.API.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lighthouse.API.Controllers;

[ApiController]
[Route("api/health")]
public class HealthController(AppDbContext dbContext) : ControllerBase
{
    [HttpGet]
    public IActionResult GetHealth() =>
        Ok(new { status = "ok", service = "Lighthouse.API", utc = DateTime.UtcNow });

    [HttpGet("db")]
    public async Task<IActionResult> GetDatabaseHealth()
    {
        try
        {
            var canConnect = await dbContext.Database.CanConnectAsync();
            return Ok(new { canConnect, provider = dbContext.Database.ProviderName });
        }
        catch (Exception ex)
        {
            return StatusCode(
                StatusCodes.Status503ServiceUnavailable,
                new { canConnect = false, error = ex.GetType().Name, message = ex.Message });
        }
    }
}
