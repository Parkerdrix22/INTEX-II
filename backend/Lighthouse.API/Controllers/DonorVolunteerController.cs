using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Lighthouse.API.Data.Entities;
using Lighthouse.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace Lighthouse.API.Controllers;

[ApiController]
[Route("api/donor")]
[Authorize]
public class DonorVolunteerController(
    UserManager<AppUser> userManager,
    IStaffNotificationEmailService staffNotificationEmail) : ControllerBase
{
    [HttpPost("volunteer-interest")]
    public async Task<IActionResult> SubmitVolunteerInterest([FromBody] VolunteerInterestRequest request)
    {
        var userId = User.FindFirstValue("user_id");
        AppUser? user = null;
        if (!string.IsNullOrWhiteSpace(userId))
            user = await userManager.FindByIdAsync(userId);

        var first = user?.FirstName?.Trim() ?? User.FindFirstValue(ClaimTypes.GivenName)?.Trim() ?? string.Empty;
        var last = user?.LastName?.Trim() ?? User.FindFirstValue(ClaimTypes.Surname)?.Trim() ?? string.Empty;
        var full = $"{first} {last}".Trim();
        if (string.IsNullOrWhiteSpace(full))
            full = "user";

        var email = user?.Email?.Trim() ?? User.FindFirstValue(ClaimTypes.Email) ?? string.Empty;
        var phone = user?.PhoneNumber?.Trim();

        var days = request.Days ?? [];
        var times = request.TimesOfDay ?? [];
        var focuses = request.FocusAreas ?? [];

        await staffNotificationEmail.SendVolunteerInterestNotificationAsync(
            full,
            email,
            phone,
            request.FlexibleOnDays,
            days,
            times,
            focuses,
            request.Notes);

        await staffNotificationEmail.SendVolunteerConfirmationAsync(
            full,
            email,
            request.FlexibleOnDays,
            days,
            times,
            focuses,
            request.Notes);

        return Ok(new { message = "Thank you — your volunteer interest was submitted." });
    }
}

public sealed class VolunteerInterestRequest
{
    public bool FlexibleOnDays { get; set; }
    public List<string>? Days { get; set; }
    public List<string>? TimesOfDay { get; set; }
    public List<string>? FocusAreas { get; set; }
    [StringLength(4000)]
    public string? Notes { get; set; }
}
