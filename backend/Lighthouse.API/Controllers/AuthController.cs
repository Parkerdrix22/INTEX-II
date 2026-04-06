using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Lighthouse.API.Data;
using Lighthouse.API.Data.Entities;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lighthouse.API.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(
    AppDbContext dbContext,
    IPasswordHasher<AppUser> passwordHasher) : ControllerBase
{
    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        var selectedRole = request.Role.Trim();
        if (!string.Equals(selectedRole, UserRoles.Resident, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(selectedRole, UserRoles.Donor, StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { message = "Public registration only supports Resident or Donor." });
        }

        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var normalizedUsername = request.Username.Trim().ToLowerInvariant();

        if (request.Password.Length < 8)
        {
            return BadRequest(new { message = "Password must be at least 8 characters." });
        }

        if (await dbContext.Users.AnyAsync(user => user.Email.ToLower() == normalizedEmail))
        {
            return Conflict(new { message = "An account with this email already exists." });
        }

        if (await dbContext.Users.AnyAsync(user => user.Username.ToLower() == normalizedUsername))
        {
            return Conflict(new { message = "This username is already taken." });
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
                DisplayName = request.Username.Trim(),
                Email = request.Email.Trim(),
                Status = "Active",
                CreatedAt = DateTime.UtcNow,
            };
            dbContext.Supporters.Add(supporter);
            await dbContext.SaveChangesAsync();
            supporterId = supporter.Id;
        }

        var user = CreateUser(
            username: request.Username.Trim(),
            email: request.Email.Trim(),
            password: request.Password,
            role: role,
            residentId: residentId,
            supporterId: supporterId);

        dbContext.Users.Add(user);
        await dbContext.SaveChangesAsync();

        return Ok(new { message = "Account created successfully." });
    }

    [HttpPost("register-staff")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> RegisterStaff([FromBody] RegisterStaffRequest request)
    {
        var selectedRole = request.Role.Trim();
        if (!string.Equals(selectedRole, UserRoles.Admin, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(selectedRole, UserRoles.Staff, StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { message = "Staff registration only supports Admin or Staff." });
        }

        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var normalizedUsername = request.Username.Trim().ToLowerInvariant();

        if (request.Password.Length < 8)
        {
            return BadRequest(new { message = "Password must be at least 8 characters." });
        }

        if (await dbContext.Users.AnyAsync(user => user.Email.ToLower() == normalizedEmail))
        {
            return Conflict(new { message = "An account with this email already exists." });
        }

        if (await dbContext.Users.AnyAsync(user => user.Username.ToLower() == normalizedUsername))
        {
            return Conflict(new { message = "This username is already taken." });
        }

        var role = selectedRole.Equals(UserRoles.Admin, StringComparison.OrdinalIgnoreCase)
            ? UserRoles.Admin
            : UserRoles.Staff;

        var staffMember = new StaffMember
        {
            FullName = request.Username.Trim(),
            Email = request.Email.Trim(),
            Title = role == UserRoles.Admin ? "Administrator" : "Staff",
            CreatedAt = DateTime.UtcNow,
        };
        dbContext.StaffMembers.Add(staffMember);
        await dbContext.SaveChangesAsync();

        var user = CreateUser(
            username: request.Username.Trim(),
            email: request.Email.Trim(),
            password: request.Password,
            role: role,
            staffMemberId: staffMember.Id);

        dbContext.Users.Add(user);
        await dbContext.SaveChangesAsync();

        return Ok(new { message = $"{role} account created successfully." });
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var normalizedLogin = request.Login.Trim().ToLowerInvariant();
        var user = await dbContext.Users
            .FirstOrDefaultAsync(candidate =>
                candidate.Username.ToLower() == normalizedLogin
                || candidate.Email.ToLower() == normalizedLogin);

        if (user is null || !user.IsActive)
        {
            return Unauthorized(new { message = "Invalid credentials." });
        }

        var passwordResult = passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
        if (passwordResult == PasswordVerificationResult.Failed)
        {
            return Unauthorized(new { message = "Invalid credentials." });
        }

        var claims = new List<Claim>
        {
            new(ClaimTypes.Name, user.Username),
            new(ClaimTypes.Email, user.Email),
            new(ClaimTypes.Role, user.Role),
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
                username = User.FindFirstValue(ClaimTypes.Name),
                email = User.FindFirstValue(ClaimTypes.Email),
                roles = User.FindAll(ClaimTypes.Role).Select(claim => claim.Value).ToArray(),
                residentId = User.FindFirstValue("resident_id"),
                supporterId = User.FindFirstValue("supporter_id"),
                staffMemberId = User.FindFirstValue("staff_member_id"),
            });
    }

    private AppUser CreateUser(
        string username,
        string email,
        string password,
        string role,
        int? residentId = null,
        int? supporterId = null,
        int? staffMemberId = null)
    {
        var user = new AppUser
        {
            Username = username,
            Email = email,
            Role = role,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            ResidentId = residentId,
            SupporterId = supporterId,
            StaffMemberId = staffMemberId,
        };
        user.PasswordHash = passwordHasher.HashPassword(user, password);
        return user;
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
    [MinLength(2)]
    public string Username { get; set; } = string.Empty;

    [Required]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required]
    public string Password { get; set; } = string.Empty;

    [Required]
    public string Role { get; set; } = UserRoles.Resident;
}

public class RegisterStaffRequest
{
    [Required]
    [MinLength(2)]
    public string Username { get; set; } = string.Empty;

    [Required]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required]
    public string Password { get; set; } = string.Empty;

    [Required]
    public string Role { get; set; } = UserRoles.Staff;
}
