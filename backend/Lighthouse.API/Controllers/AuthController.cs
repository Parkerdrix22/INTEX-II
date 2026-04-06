using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Lighthouse.API.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(IConfiguration configuration) : ControllerBase
{
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var adminEmail = configuration["Auth:SeedAdminEmail"] ?? "admin@lighthouse.local";
        var adminPassword = configuration["Auth:SeedAdminPassword"] ?? "ChangeMeNow123!Change";

        if (!string.Equals(request.Email, adminEmail, StringComparison.OrdinalIgnoreCase)
            || request.Password != adminPassword)
        {
            return Unauthorized(new { message = "Invalid credentials." });
        }

        var claims = new List<Claim>
        {
            new(ClaimTypes.Name, request.Email),
            new(ClaimTypes.Email, request.Email),
            new(ClaimTypes.Role, "Admin"),
        };

        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        var principal = new ClaimsPrincipal(identity);

        await HttpContext.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            principal,
            new AuthenticationProperties
            {
                IsPersistent = request.RememberMe,
                ExpiresUtc = DateTimeOffset.UtcNow.AddDays(7),
            });

        return Ok(new { message = "Login successful." });
    }

    [HttpPost("logout")]
    [Authorize]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return Ok(new { message = "Logout successful." });
    }

    [HttpGet("me")]
    [AllowAnonymous]
    public IActionResult Me()
    {
        if (User.Identity?.IsAuthenticated != true)
        {
            return Ok(new { isAuthenticated = false, email = (string?)null, roles = Array.Empty<string>() });
        }

        return Ok(
            new
            {
                isAuthenticated = true,
                email = User.FindFirstValue(ClaimTypes.Email),
                roles = User.FindAll(ClaimTypes.Role).Select(claim => claim.Value).ToArray(),
            });
    }
}

public class LoginRequest
{
    [Required]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required]
    public string Password { get; set; } = string.Empty;

    public bool RememberMe { get; set; }
}
