using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Lighthouse.API.Data;
using Lighthouse.API.Data.Entities;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;

namespace Lighthouse.API.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(
    AppDbContext dbContext,
    UserManager<AppUser> userManager,
    SignInManager<AppUser> signInManager,
    IConfiguration configuration) : ControllerBase
{
    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        var firstName = request.FirstName.Trim();
        var lastName = request.LastName.Trim();
        var username = BuildUsername(firstName, lastName, request.Email);
        var selectedRole = request.Role.Trim();
        if (!string.Equals(selectedRole, UserRoles.Resident, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(selectedRole, UserRoles.Donor, StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { message = "Public registration only supports Resident or Donor." });
        }

        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var normalizedUsername = username.ToLowerInvariant();

        if (await userManager.Users.AnyAsync(user => user.Email != null && user.Email.ToLower() == normalizedEmail))
        {
            return Conflict(new { message = "An account with this email already exists." });
        }

        var role = selectedRole.Equals(UserRoles.Resident, StringComparison.OrdinalIgnoreCase)
            ? UserRoles.Resident
            : UserRoles.Donor;

        int? residentId = null;
        int? supporterId = null;

        if (role == UserRoles.Resident)
        {
            var resident = new Resident
            {
                CaseControlNo = $"CASE-{DateTime.UtcNow:yyyyMMddHHmmss}",
                CaseStatus = "New",
                DateAdmitted = DateTime.UtcNow.Date,
            };
            dbContext.Residents.Add(resident);
            await dbContext.SaveChangesAsync();
            residentId = resident.Id;
        }
        else
        {
            var supporter = new Supporter
            {
                SupporterType = "MonetaryDonor",
                DisplayName = $"{firstName} {lastName}".Trim(),
                Email = request.Email.Trim(),
                Status = "Active",
                CreatedAt = DateTime.UtcNow,
            };
            dbContext.Supporters.Add(supporter);
            await dbContext.SaveChangesAsync();
            supporterId = supporter.Id;
        }

        var user = CreateUser(
            username: username,
            firstName: firstName,
            lastName: lastName,
            email: request.Email.Trim(),
            role: role,
            residentId: residentId,
            supporterId: supporterId);
        var createResult = await userManager.CreateAsync(user, request.Password);
        if (!createResult.Succeeded)
        {
            return BadRequest(new { message = string.Join(" ", createResult.Errors.Select(error => error.Description)) });
        }

        return Ok(new { message = "Account created successfully." });
    }

    [HttpPost("register-staff")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> RegisterStaff([FromBody] RegisterStaffRequest request)
    {
        var firstName = request.FirstName.Trim();
        var lastName = request.LastName.Trim();
        var username = BuildUsername(firstName, lastName, request.Email);
        var selectedRole = request.Role.Trim();
        if (!string.Equals(selectedRole, UserRoles.Admin, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(selectedRole, UserRoles.Staff, StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { message = "Staff registration only supports Admin or Staff." });
        }

        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var normalizedUsername = username.ToLowerInvariant();
        if (await userManager.Users.AnyAsync(user => user.Email != null && user.Email.ToLower() == normalizedEmail))
        {
            return Conflict(new { message = "An account with this email already exists." });
        }

        var role = selectedRole.Equals(UserRoles.Admin, StringComparison.OrdinalIgnoreCase)
            ? UserRoles.Admin
            : UserRoles.Staff;

        var staffMember = new StaffMember
        {
            FullName = $"{firstName} {lastName}".Trim(),
            Email = request.Email.Trim(),
            Title = role == UserRoles.Admin ? "Administrator" : "Staff",
            CreatedAt = DateTime.UtcNow,
        };
        dbContext.StaffMembers.Add(staffMember);
        await dbContext.SaveChangesAsync();

        var user = CreateUser(
            username: username,
            firstName: firstName,
            lastName: lastName,
            email: request.Email.Trim(),
            role: role,
            staffMemberId: staffMember.Id);
        var createResult = await userManager.CreateAsync(user, request.Password);
        if (!createResult.Succeeded)
        {
            return BadRequest(new { message = string.Join(" ", createResult.Errors.Select(error => error.Description)) });
        }

        return Ok(new { message = $"{role} account created successfully." });
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var normalizedLogin = request.Login.Trim().ToLowerInvariant();
        var user = await userManager.Users
            .FirstOrDefaultAsync(candidate =>
                (candidate.UserName != null && candidate.UserName.ToLower() == normalizedLogin)
                || (candidate.Email != null && candidate.Email.ToLower() == normalizedLogin));

        if (user is null || !user.IsActive)
        {
            return Unauthorized(new { message = "Invalid credentials." });
        }

        var passwordResult = await signInManager.CheckPasswordSignInAsync(user, request.Password, lockoutOnFailure: false);
        if (!passwordResult.Succeeded)
        {
            return Unauthorized(new { message = "Invalid credentials." });
        }

        await SignInWithAppCookieAsync(user, request.RememberMe);

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
    public async Task<IActionResult> Me()
    {
        if (User.Identity?.IsAuthenticated != true)
        {
            return Ok(new { isAuthenticated = false, email = (string?)null, roles = Array.Empty<string>() });
        }

        string? phone = null;
        var userId = User.FindFirstValue("user_id");
        if (!string.IsNullOrWhiteSpace(userId))
        {
            var user = await userManager.FindByIdAsync(userId);
            phone = user?.PhoneNumber;
        }

        return Ok(
            new
            {
                isAuthenticated = true,
                username = User.FindFirstValue(ClaimTypes.Name),
                firstName = User.FindFirstValue(ClaimTypes.GivenName),
                lastName = User.FindFirstValue(ClaimTypes.Surname),
                email = User.FindFirstValue(ClaimTypes.Email),
                phone,
                roles = User.FindAll(ClaimTypes.Role).Select(claim => claim.Value).ToArray(),
                residentId = User.FindFirstValue("resident_id"),
                supporterId = User.FindFirstValue("supporter_id"),
                staffMemberId = User.FindFirstValue("staff_member_id"),
            });
    }

    [HttpGet("providers")]
    [AllowAnonymous]
    public IActionResult GetExternalProviders()
    {
        var providers = new List<object>();
        if (IsGoogleConfigured())
        {
            providers.Add(new { name = GoogleDefaults.AuthenticationScheme, displayName = "Google" });
        }

        return Ok(providers);
    }

    [HttpGet("external-login")]
    [AllowAnonymous]
    public IActionResult ExternalLogin([FromQuery] string provider, [FromQuery] string? returnPath = null, [FromQuery] string? flow = null)
    {
        if (!string.Equals(provider, GoogleDefaults.AuthenticationScheme, StringComparison.OrdinalIgnoreCase) || !IsGoogleConfigured())
        {
            return BadRequest(new { message = "The requested external login provider is not available." });
        }

        var normalizedFlow = NormalizeExternalFlow(flow);
        var callbackUrl = Url.Action(nameof(ExternalLoginCallback), new { returnPath = NormalizeReturnPath(returnPath), flow = normalizedFlow });
        if (string.IsNullOrWhiteSpace(callbackUrl))
        {
            return Problem("Unable to create the external login callback URL.");
        }

        var properties = signInManager.ConfigureExternalAuthenticationProperties(provider, callbackUrl);
        return Challenge(properties, provider);
    }

    [HttpGet("external-callback")]
    [AllowAnonymous]
    public async Task<IActionResult> ExternalLoginCallback([FromQuery] string? returnPath = null, [FromQuery] string? flow = null, [FromQuery] string? remoteError = null)
    {
        var normalizedFlow = NormalizeExternalFlow(flow);
        if (!string.IsNullOrWhiteSpace(remoteError))
        {
            return Redirect(BuildFrontendErrorUrl("External login failed."));
        }

        var info = await signInManager.GetExternalLoginInfoAsync();
        if (info is null)
        {
            return Redirect(BuildFrontendErrorUrl("External login information was unavailable."));
        }

        var linkedUser = await userManager.FindByLoginAsync(info.LoginProvider, info.ProviderKey);
        if (linkedUser is not null)
        {
            await TryBackfillNamesFromExternalInfoAsync(linkedUser, info);
            await SignInWithAppCookieAsync(linkedUser, false);
            return Redirect(BuildFrontendSuccessUrl(returnPath));
        }

        var email = info.Principal.FindFirstValue(ClaimTypes.Email) ?? info.Principal.FindFirstValue("email");
        if (string.IsNullOrWhiteSpace(email))
        {
            return Redirect(BuildFrontendErrorUrl("The external provider did not return an email address."));
        }

        var user = await userManager.FindByEmailAsync(email);
        if (user is null)
        {
            if (normalizedFlow == "login")
            {
                return Redirect(BuildFrontendErrorUrl("No account found for this Google user. Please create an account first."));
            }

            var (firstName, lastName) = ExtractNamesFromExternalInfo(info);
            user = CreateUser(email, firstName, lastName, email, UserRoles.Donor);
            user.EmailConfirmed = true;
            var createResult = await userManager.CreateAsync(user, GenerateExternalPlaceholderPassword());
            if (!createResult.Succeeded)
            {
                return Redirect(BuildFrontendErrorUrl("Unable to create a local account for the external login."));
            }
        }
        else
        {
            await TryBackfillNamesFromExternalInfoAsync(user, info);
        }

        var addLoginResult = await userManager.AddLoginAsync(user, info);
        if (!addLoginResult.Succeeded && addLoginResult.Errors.All(e => !e.Code.Contains("Duplicate", StringComparison.OrdinalIgnoreCase)))
        {
            return Redirect(BuildFrontendErrorUrl("Unable to associate the external login with the local account."));
        }

        await SignInWithAppCookieAsync(user, false);
        return Redirect(BuildFrontendSuccessUrl(returnPath));
    }

    private AppUser CreateUser(
        string username,
        string firstName,
        string lastName,
        string email,
        string role,
        int? residentId = null,
        int? supporterId = null,
        int? staffMemberId = null)
    {
        var user = new AppUser
        {
            Username = username,
            FirstName = firstName,
            LastName = lastName,
            Email = email,
            Role = role,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            ResidentId = residentId,
            SupporterId = supporterId,
            StaffMemberId = staffMemberId,
        };
        return user;
    }

    private bool IsGoogleConfigured()
    {
        return !string.IsNullOrWhiteSpace(configuration["Authentication:Google:ClientId"]) &&
               !string.IsNullOrWhiteSpace(configuration["Authentication:Google:ClientSecret"]);
    }

    private static string NormalizeReturnPath(string? returnPath)
    {
        if (string.IsNullOrWhiteSpace(returnPath) || !returnPath.StartsWith('/'))
        {
            return "/";
        }

        return returnPath;
    }

    private static string BuildUsername(string firstName, string lastName, string email)
    {
        var full = $"{firstName} {lastName}".Trim();
        if (!string.IsNullOrWhiteSpace(full))
        {
            return full;
        }

        return email.Trim();
    }

    private static string NormalizeExternalFlow(string? flow)
    {
        return string.Equals(flow, "signup", StringComparison.OrdinalIgnoreCase) ? "signup" : "login";
    }

    private static string GenerateExternalPlaceholderPassword()
    {
        // Legacy schema requires password_hash NOT NULL, even for external-only accounts.
        // We generate a strong random placeholder that satisfies Identity policy.
        return $"A#External{Guid.NewGuid():N}";
    }

    private async Task SignInWithAppCookieAsync(AppUser user, bool rememberMe)
    {
        var displayName = $"{user.FirstName} {user.LastName}".Trim();
        if (string.IsNullOrWhiteSpace(displayName))
        {
            displayName = user.Username;
        }
        if (string.IsNullOrWhiteSpace(displayName) || displayName.Contains('@'))
        {
            displayName = "Friend";
        }
        var claims = new List<Claim>
        {
            new(ClaimTypes.Name, displayName),
            new(ClaimTypes.GivenName, user.FirstName),
            new(ClaimTypes.Surname, user.LastName),
            new(ClaimTypes.Email, user.Email ?? string.Empty),
            new(ClaimTypes.Role, string.IsNullOrWhiteSpace(user.Role) ? UserRoles.Donor : user.Role),
            new("user_id", user.Id.ToString()),
        };

        if (user.ResidentId.HasValue)
        {
            claims.Add(new("resident_id", user.ResidentId.Value.ToString()));
        }

        if (user.SupporterId.HasValue)
        {
            claims.Add(new("supporter_id", user.SupporterId.Value.ToString()));
        }

        if (user.StaffMemberId.HasValue)
        {
            claims.Add(new("staff_member_id", user.StaffMemberId.Value.ToString()));
        }

        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        var principal = new ClaimsPrincipal(identity);
        await HttpContext.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            principal,
            new AuthenticationProperties
            {
                IsPersistent = rememberMe,
                ExpiresUtc = DateTimeOffset.UtcNow.AddDays(7),
            });
    }

    private static (string firstName, string lastName) ExtractNamesFromExternalInfo(ExternalLoginInfo info)
    {
        var firstName = info.Principal.FindFirstValue(ClaimTypes.GivenName)
            ?? info.Principal.FindFirstValue("given_name")
            ?? string.Empty;
        var lastName = info.Principal.FindFirstValue(ClaimTypes.Surname)
            ?? info.Principal.FindFirstValue("family_name")
            ?? string.Empty;

        if (string.IsNullOrWhiteSpace(firstName) && string.IsNullOrWhiteSpace(lastName))
        {
            var fullName = info.Principal.FindFirstValue(ClaimTypes.Name)
                ?? info.Principal.FindFirstValue("name")
                ?? string.Empty;
            if (!string.IsNullOrWhiteSpace(fullName))
            {
                var parts = fullName.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                if (parts.Length > 0)
                {
                    firstName = parts[0];
                    lastName = parts.Length > 1 ? string.Join(' ', parts.Skip(1)) : string.Empty;
                }
            }
        }

        if (string.IsNullOrWhiteSpace(firstName))
        {
            firstName = "Google";
        }
        if (string.IsNullOrWhiteSpace(lastName))
        {
            lastName = "User";
        }

        return (firstName, lastName);
    }

    private async Task TryBackfillNamesFromExternalInfoAsync(AppUser user, ExternalLoginInfo info)
    {
        var (firstName, lastName) = ExtractNamesFromExternalInfo(info);
        var changed = false;

        if (string.IsNullOrWhiteSpace(user.FirstName) && !string.IsNullOrWhiteSpace(firstName))
        {
            user.FirstName = firstName;
            changed = true;
        }

        if (string.IsNullOrWhiteSpace(user.LastName) && !string.IsNullOrWhiteSpace(lastName))
        {
            user.LastName = lastName;
            changed = true;
        }

        if (changed)
        {
            await userManager.UpdateAsync(user);
        }
    }

    private string BuildFrontendSuccessUrl(string? returnPath)
    {
        var frontendUrl = configuration["FrontendUrl"] ?? "http://localhost:5173";
        return $"{frontendUrl.TrimEnd('/')}{NormalizeReturnPath(returnPath)}";
    }

    private string BuildFrontendErrorUrl(string errorMessage)
    {
        var frontendUrl = configuration["FrontendUrl"] ?? "http://localhost:5173";
        var loginUrl = $"{frontendUrl.TrimEnd('/')}/login";
        return QueryHelpers.AddQueryString(loginUrl, "externalError", errorMessage);
    }
}

public class LoginRequest
{
    [Required]
    public string Login { get; set; } = string.Empty;

    [Required]
    public string Password { get; set; } = string.Empty;

    public bool RememberMe { get; set; }
}

public class RegisterRequest
{
    [Required]
    [MinLength(1)]
    [MaxLength(80)]
    [RegularExpression(@"^[a-zA-Z\- ]+$", ErrorMessage = "First name contains unsupported characters.")]
    public string FirstName { get; set; } = string.Empty;

    [Required]
    [MinLength(1)]
    [MaxLength(80)]
    [RegularExpression(@"^[a-zA-Z\- ]+$", ErrorMessage = "Last name contains unsupported characters.")]
    public string LastName { get; set; } = string.Empty;

    [Required]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required]
    [MinLength(14)]
    [RegularExpression(@"^(?=.*[A-Z])(?=.*[^a-zA-Z0-9]).{14,}$", ErrorMessage = "Password must be at least 14 characters and include an uppercase and special character.")]
    public string Password { get; set; } = string.Empty;

    [Required]
    public string Role { get; set; } = UserRoles.Resident;
}

public class RegisterStaffRequest
{
    [Required]
    [MinLength(1)]
    [MaxLength(80)]
    [RegularExpression(@"^[a-zA-Z\- ]+$", ErrorMessage = "First name contains unsupported characters.")]
    public string FirstName { get; set; } = string.Empty;

    [Required]
    [MinLength(1)]
    [MaxLength(80)]
    [RegularExpression(@"^[a-zA-Z\- ]+$", ErrorMessage = "Last name contains unsupported characters.")]
    public string LastName { get; set; } = string.Empty;

    [Required]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required]
    [MinLength(14)]
    [RegularExpression(@"^(?=.*[A-Z])(?=.*[^a-zA-Z0-9]).{14,}$", ErrorMessage = "Password must be at least 14 characters and include an uppercase and special character.")]
    public string Password { get; set; } = string.Empty;

    [Required]
    public string Role { get; set; } = UserRoles.Staff;
}
