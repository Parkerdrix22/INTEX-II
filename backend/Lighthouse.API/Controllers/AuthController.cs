using System.ComponentModel.DataAnnotations;
using System.Collections.Concurrent;
using System.Linq;
using System.Security.Claims;
using Lighthouse.API.Data;
using Lighthouse.API.Data.Entities;
using Lighthouse.API.Infrastructure;
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
    private static readonly ConcurrentDictionary<string, TwoFactorChallengeState> TwoFactorChallenges = new();
    private static readonly TimeSpan TwoFactorChallengeTtl = TimeSpan.FromMinutes(5);

    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        var firstName = request.FirstName.Trim();
        var lastName = request.LastName.Trim();
        var username = UserAccountIdentityHelper.ResolveIdentityUserName(null, firstName, lastName, request.Email, out var usernameError);
        if (usernameError is not null || string.IsNullOrWhiteSpace(username))
        {
            return BadRequest(new { message = usernameError ?? "Unable to assign a login id." });
        }

        var selectedRole = request.Role.Trim();
        if (!string.Equals(selectedRole, UserRoles.Resident, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(selectedRole, UserRoles.Donor, StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { message = "Public registration only supports Resident or Donor." });
        }

        var normalizedEmail = request.Email.Trim().ToLowerInvariant();

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

        var user = UserAccountIdentityHelper.BuildAppUser(
            username,
            firstName,
            lastName,
            request.Email.Trim(),
            role,
            residentId,
            supporterId);
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
        var username = UserAccountIdentityHelper.ResolveIdentityUserName(request.Username, firstName, lastName, request.Email, out var usernameError);
        if (usernameError is not null || string.IsNullOrWhiteSpace(username))
        {
            return BadRequest(new { message = usernameError ?? "Unable to assign a login id." });
        }

        if (!string.Equals(request.Role.Trim(), UserRoles.Staff, StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { message = "Only Staff accounts can be created here. Promote a donor to grant Admin." });
        }

        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        if (await userManager.Users.AnyAsync(user => user.Email != null && user.Email.ToLower() == normalizedEmail))
        {
            return Conflict(new { message = "An account with this email already exists." });
        }

        if (await userManager.FindByNameAsync(username) is not null)
        {
            return Conflict(new { message = "An account with this login id already exists." });
        }

        const string role = UserRoles.Staff;

        var staffMember = new StaffMember
        {
            FullName = $"{firstName} {lastName}".Trim(),
            Email = request.Email.Trim(),
            Title = "Staff",
            CreatedAt = DateTime.UtcNow,
        };
        dbContext.StaffMembers.Add(staffMember);
        await dbContext.SaveChangesAsync();

        var user = UserAccountIdentityHelper.BuildAppUser(
            username,
            firstName,
            lastName,
            request.Email.Trim(),
            role,
            staffMemberId: staffMember.Id);
        var createResult = await userManager.CreateAsync(user, request.Password);
        if (!createResult.Succeeded)
        {
            return BadRequest(new { message = string.Join(" ", createResult.Errors.Select(error => error.Description)) });
        }

        return Ok(new { message = "Staff account created successfully." });
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

        var isAdminOrStaff = string.Equals(user.Role, UserRoles.Admin, StringComparison.OrdinalIgnoreCase)
            || string.Equals(user.Role, UserRoles.Staff, StringComparison.OrdinalIgnoreCase);

        if (isAdminOrStaff && !user.TwoFactorEnabled)
        {
            // Must issue a session so they can open Profile and complete setup (otherwise lockout).
            await SignInWithAppCookieAsync(user, request.RememberMe);
            return Ok(new
            {
                requiresTwoFactorSetup = true,
                message = "Two-factor authentication is required for Admin and Staff accounts. Complete setup in your profile."
            });
        }

        if (user.TwoFactorEnabled)
        {
            var challengeToken = CreateTwoFactorChallengeToken(user.Id, request.RememberMe);
            return Ok(new
            {
                requiresTwoFactor = true,
                challengeToken,
                message = "Enter the 2FA code from your authenticator app."
            });
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

        var user = await ResolveCurrentAppUserAsync();
        if (user is null || !user.IsActive)
        {
            return Ok(new { isAuthenticated = false, email = (string?)null, roles = Array.Empty<string>() });
        }

        var recoveryCount = await userManager.CountRecoveryCodesAsync(user);
        var role = string.IsNullOrWhiteSpace(user.Role) ? UserRoles.Donor : user.Role;
        var phone = user.PhoneNumber;
        return Ok(
            new
            {
                isAuthenticated = true,
                username = user.UserName ?? user.Email,
                firstName = user.FirstName,
                lastName = user.LastName,
                email = user.Email,
                phone,
                roles = new[] { role },
                twoFactorEnabled = user.TwoFactorEnabled,
                recoveryCodesLeft = recoveryCount,
                residentId = user.ResidentId?.ToString(),
                supporterId = user.SupporterId?.ToString(),
                staffMemberId = user.StaffMemberId?.ToString(),
            });
    }

    [HttpPost("change-email")]
    [Authorize]
    public async Task<IActionResult> ChangeEmail([FromBody] ChangeEmailRequest request)
    {
        var user = await GetCurrentUserAsync();
        if (user is null)
        {
            return Unauthorized(new { message = "User session is invalid." });
        }

        var newEmail = request.NewEmail.Trim();

        var passwordCheck = await signInManager.CheckPasswordSignInAsync(user, request.CurrentPassword, lockoutOnFailure: false);
        if (!passwordCheck.Succeeded)
        {
            return BadRequest(new { message = "Current password is incorrect." });
        }

        var normalizedNew = newEmail.ToLowerInvariant();
        var duplicate = await userManager.Users.AnyAsync(u => u.Id != user.Id && u.Email != null && u.Email.ToLower() == normalizedNew);
        if (duplicate)
        {
            return Conflict(new { message = "Another account already uses this email address." });
        }

        // If the login id (UserName) was set to the old email, update it to match.
        var oldEmail = user.Email ?? string.Empty;
        if (string.Equals(user.UserName, oldEmail, StringComparison.OrdinalIgnoreCase))
        {
            user.UserName = newEmail;
        }

        user.Email = newEmail;

        // Sync linked profile rows.
        if (user.SupporterId.HasValue)
        {
            var supporter = await dbContext.Supporters.FindAsync(user.SupporterId.Value);
            if (supporter is not null)
            {
                supporter.Email = newEmail;
            }
        }

        if (user.StaffMemberId.HasValue)
        {
            var staffMember = await dbContext.StaffMembers.FindAsync(user.StaffMemberId.Value);
            if (staffMember is not null)
            {
                staffMember.Email = newEmail;
            }
        }

        await dbContext.SaveChangesAsync();

        UserAccountIdentityHelper.EnsureIdentityStamps(user);
        var updateResult = await userManager.UpdateAsync(user);
        if (!updateResult.Succeeded)
        {
            return BadRequest(new { message = string.Join(" ", updateResult.Errors.Select(e => e.Description)) });
        }

        // Re-issue the cookie so the email claim is immediately up to date.
        var auth = await HttpContext.AuthenticateAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        var persistent = auth.Properties?.IsPersistent == true;
        await SignInWithAppCookieAsync(user, persistent);

        return Ok(new { message = "Email updated successfully.", email = newEmail });
    }

    /// <summary>Re-issues the auth cookie from the database so role and 2FA claims match current user rows.</summary>
    [HttpPost("reissue-session")]
    [Authorize]
    public async Task<IActionResult> ReissueSession()
    {
        var auth = await HttpContext.AuthenticateAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        if (!auth.Succeeded)
        {
            return Unauthorized();
        }

        var user = await ResolveCurrentAppUserAsync();
        if (user is null || !user.IsActive)
        {
            return Unauthorized();
        }

        var persistent = auth.Properties?.IsPersistent == true;
        await SignInWithAppCookieAsync(user, persistent);
        return Ok(new { message = "Session refreshed." });
    }

    /// <summary>
    /// Identity's GetUserAsync expects <see cref="ClaimTypes.NameIdentifier"/>; older cookies only had <c>user_id</c>.
    /// </summary>
    private async Task<AppUser?> ResolveCurrentAppUserAsync()
    {
        var user = await userManager.GetUserAsync(User);
        if (user is not null)
        {
            return user;
        }

        var legacyId = User.FindFirst("user_id")?.Value;
        if (int.TryParse(legacyId, out var id))
        {
            return await userManager.FindByIdAsync(id.ToString());
        }

        return null;
    }

    [HttpPost("2fa/challenge")]
    [AllowAnonymous]
    public async Task<IActionResult> CompleteTwoFactorChallenge([FromBody] TwoFactorChallengeRequest request)
    {
        var token = request.ChallengeToken?.Trim();
        if (string.IsNullOrWhiteSpace(token) || !TryGetTwoFactorChallenge(token, out var state))
        {
            return Unauthorized(new { message = "Two-factor challenge is invalid or expired. Please sign in again." });
        }

        var user = await userManager.FindByIdAsync(state.UserId.ToString());
        if (user is null || !user.IsActive || !user.TwoFactorEnabled)
        {
            InvalidateTwoFactorChallenge(token);
            return Unauthorized(new { message = "Two-factor challenge could not be completed." });
        }

        // TOTP is 6 digits. Recovery codes are stored as "XXXXX-XXXXX" (hyphen required by Identity).
        // Do not strip hyphens for recovery redemption or the code will never match.
        var rawCode = request.Code?.Trim() ?? string.Empty;
        var totpCode = NormalizeTotpCode(rawCode);
        var authenticatorValid = totpCode.Length == 6
            && await userManager.VerifyTwoFactorTokenAsync(
                user,
                TokenOptions.DefaultAuthenticatorProvider,
                totpCode);

        var usedRecoveryCode = false;
        if (!authenticatorValid)
        {
            var recoveryCode = NormalizeRecoveryCodeForIdentity(rawCode);
            if (string.IsNullOrEmpty(recoveryCode))
            {
                return Unauthorized(new { message = "Invalid two-factor or recovery code." });
            }

            var recoveryResult = await userManager.RedeemTwoFactorRecoveryCodeAsync(user, recoveryCode);
            usedRecoveryCode = recoveryResult.Succeeded;
            if (!usedRecoveryCode)
            {
                return Unauthorized(new { message = "Invalid two-factor or recovery code." });
            }
        }

        await SignInWithAppCookieAsync(user, state.RememberMe);
        InvalidateTwoFactorChallenge(token);
        return Ok(new
        {
            message = usedRecoveryCode ? "Signed in with recovery code." : "Two-factor verification successful."
        });
    }

    [HttpPost("2fa/setup/start")]
    [Authorize]
    public async Task<IActionResult> StartTwoFactorSetup()
    {
        var user = await GetCurrentUserAsync();
        if (user is null)
        {
            return Unauthorized(new { message = "User session is invalid." });
        }

        var key = await userManager.GetAuthenticatorKeyAsync(user);
        if (string.IsNullOrWhiteSpace(key))
        {
            await userManager.ResetAuthenticatorKeyAsync(user);
            key = await userManager.GetAuthenticatorKeyAsync(user);
        }

        if (string.IsNullOrWhiteSpace(key))
        {
            return Problem("Unable to generate authenticator key.");
        }

        var appName = "Kateri";
        var accountName = string.IsNullOrWhiteSpace(user.Email) ? user.UserName ?? $"user-{user.Id}" : user.Email;
        var encodedApp = Uri.EscapeDataString(appName);
        var encodedAccount = Uri.EscapeDataString(accountName ?? $"user-{user.Id}");
        var encodedSecret = Uri.EscapeDataString(key);
        var otpauthUri = $"otpauth://totp/{encodedApp}:{encodedAccount}?secret={encodedSecret}&issuer={encodedApp}&digits=6";

        return Ok(new
        {
            sharedKey = FormatKey(key),
            otpauthUri
        });
    }

    [HttpPost("2fa/setup/verify")]
    [Authorize]
    public async Task<IActionResult> VerifyTwoFactorSetup([FromBody] TwoFactorSetupVerifyRequest request)
    {
        var user = await GetCurrentUserAsync();
        if (user is null)
        {
            return Unauthorized(new { message = "User session is invalid." });
        }

        var code = NormalizeAuthenticatorCode(request.Code);
        var valid = await userManager.VerifyTwoFactorTokenAsync(
            user,
            TokenOptions.DefaultAuthenticatorProvider,
            code);

        if (!valid)
        {
            return BadRequest(new { message = "Invalid authenticator code." });
        }

        var enableResult = await userManager.SetTwoFactorEnabledAsync(user, true);
        if (!enableResult.Succeeded)
        {
            return BadRequest(new { message = "Unable to enable two-factor authentication." });
        }

        var recoveryCodes = (await userManager.GenerateNewTwoFactorRecoveryCodesAsync(user, 10) ?? Array.Empty<string>()).ToArray();
        return Ok(new
        {
            message = "Two-factor authentication enabled.",
            recoveryCodes
        });
    }

    [HttpPost("2fa/disable")]
    [Authorize]
    public async Task<IActionResult> DisableTwoFactor()
    {
        var user = await GetCurrentUserAsync();
        if (user is null)
        {
            return Unauthorized(new { message = "User session is invalid." });
        }

        var disableResult = await userManager.SetTwoFactorEnabledAsync(user, false);
        if (!disableResult.Succeeded)
        {
            return BadRequest(new { message = "Unable to disable two-factor authentication." });
        }

        return Ok(new { message = "Two-factor authentication disabled." });
    }

    [HttpPost("2fa/recovery-codes/regenerate")]
    [Authorize]
    public async Task<IActionResult> RegenerateRecoveryCodes()
    {
        var user = await GetCurrentUserAsync();
        if (user is null)
        {
            return Unauthorized(new { message = "User session is invalid." });
        }

        if (!user.TwoFactorEnabled)
        {
            return BadRequest(new { message = "Enable two-factor authentication before generating recovery codes." });
        }

        var recoveryCodes = (await userManager.GenerateNewTwoFactorRecoveryCodesAsync(user, 10) ?? Array.Empty<string>()).ToArray();
        return Ok(new
        {
            message = "Recovery codes regenerated.",
            recoveryCodes
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
            return await CompleteLoginOrStartTwoFactorAsync(linkedUser, rememberMe: false, returnPath);
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
            user = UserAccountIdentityHelper.BuildAppUser(email, firstName, lastName, email, UserRoles.Donor);
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

        return await CompleteLoginOrStartTwoFactorAsync(user, rememberMe: false, returnPath);
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

    private async Task<IActionResult> CompleteLoginOrStartTwoFactorAsync(AppUser user, bool rememberMe, string? returnPath)
    {
        var isAdminOrStaff = string.Equals(user.Role, UserRoles.Admin, StringComparison.OrdinalIgnoreCase)
            || string.Equals(user.Role, UserRoles.Staff, StringComparison.OrdinalIgnoreCase);

        if (isAdminOrStaff && !user.TwoFactorEnabled)
        {
            await SignInWithAppCookieAsync(user, rememberMe);
            return Redirect(BuildFrontendProfileUrl(
                "Two-factor authentication is required for Admin/Staff accounts. Complete setup below."));
        }

        if (user.TwoFactorEnabled)
        {
            var challengeToken = CreateTwoFactorChallengeToken(user.Id, rememberMe);
            return Redirect(BuildFrontendLoginUrl(
                "Enter the 6-digit code from your authenticator app to finish signing in.",
                challengeToken: challengeToken));
        }

        await SignInWithAppCookieAsync(user, rememberMe);
        return Redirect(BuildFrontendSuccessUrl(returnPath));
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
            // Required for UserManager.GetUserAsync(User) used by /me and reissue-session.
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
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
        claims.Add(new("two_factor_enabled", user.TwoFactorEnabled.ToString()));

        var recoveryCount = await userManager.CountRecoveryCodesAsync(user);
        claims.Add(new("recovery_codes_left", recoveryCount.ToString()));

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

    private static string CreateTwoFactorChallengeToken(int userId, bool rememberMe)
    {
        CleanupExpiredTwoFactorChallenges();
        var token = Convert.ToBase64String(Guid.NewGuid().ToByteArray())
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');
        TwoFactorChallenges[token] = new TwoFactorChallengeState(
            userId,
            rememberMe,
            DateTimeOffset.UtcNow.Add(TwoFactorChallengeTtl));
        return token;
    }

    private static bool TryGetTwoFactorChallenge(string token, out TwoFactorChallengeState state)
    {
        CleanupExpiredTwoFactorChallenges();
        if (TwoFactorChallenges.TryGetValue(token, out state))
        {
            return state.ExpiresAt >= DateTimeOffset.UtcNow;
        }

        state = default;
        return false;
    }

    private static void InvalidateTwoFactorChallenge(string token)
    {
        if (!string.IsNullOrWhiteSpace(token))
        {
            TwoFactorChallenges.TryRemove(token, out _);
        }
    }

    private static void CleanupExpiredTwoFactorChallenges()
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var entry in TwoFactorChallenges)
        {
            if (entry.Value.ExpiresAt < now)
            {
                TwoFactorChallenges.TryRemove(entry.Key, out _);
            }
        }
    }

    private async Task<AppUser?> GetCurrentUserAsync()
    {
        var userIdClaim = User.FindFirstValue("user_id");
        if (string.IsNullOrWhiteSpace(userIdClaim))
        {
            return null;
        }

        return await userManager.FindByIdAsync(userIdClaim);
    }

    private static string NormalizeAuthenticatorCode(string code)
    {
        return (code ?? string.Empty).Replace(" ", string.Empty).Replace("-", string.Empty).Trim();
    }

    /// <summary>
    /// Returns six digits only, or empty if the input is not a 6-digit authenticator code.
    /// </summary>
    private static string NormalizeTotpCode(string code)
    {
        var digits = string.Concat((code ?? string.Empty).Where(char.IsDigit));
        return digits.Length == 6 ? digits : string.Empty;
    }

    /// <summary>
    /// Normalizes user input to the recovery code format Identity stores: "XXXXX-XXXXX".
    /// </summary>
    private static string NormalizeRecoveryCodeForIdentity(string code)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            return string.Empty;
        }

        var compact = new string(code.Trim().Where(c => !char.IsWhiteSpace(c)).ToArray()).ToUpperInvariant();
        if (compact.Length == 11 && compact[5] == '-')
        {
            return compact;
        }

        var noDash = compact.Replace("-", string.Empty).Replace("_", string.Empty);
        if (noDash.Length == 10)
        {
            return noDash.Substring(0, 5) + "-" + noDash.Substring(5);
        }

        return compact;
    }

    private static string FormatKey(string unformattedKey)
    {
        return string.Join(' ', Enumerable.Range(0, (unformattedKey.Length + 3) / 4)
            .Select(i =>
            {
                var start = i * 4;
                var length = Math.Min(4, unformattedKey.Length - start);
                return unformattedKey.Substring(start, length).ToLowerInvariant();
            }));
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

    private string BuildFrontendLoginUrl(string? message = null, bool requiresTwoFactorSetup = false, string? challengeToken = null)
    {
        var frontendUrl = configuration["FrontendUrl"] ?? "http://localhost:5173";
        var loginUrl = $"{frontendUrl.TrimEnd('/')}/login";
        var parameters = new Dictionary<string, string>();

        if (!string.IsNullOrWhiteSpace(message))
        {
            parameters["message"] = message;
        }

        if (requiresTwoFactorSetup)
        {
            parameters["requiresTwoFactorSetup"] = "true";
        }

        if (!string.IsNullOrWhiteSpace(challengeToken))
        {
            parameters["challengeToken"] = challengeToken;
        }

        return parameters.Count == 0 ? loginUrl : QueryHelpers.AddQueryString(loginUrl, parameters);
    }

    private string BuildFrontendProfileUrl(string? message = null)
    {
        var frontendUrl = configuration["FrontendUrl"] ?? "http://localhost:5173";
        var profileUrl = $"{frontendUrl.TrimEnd('/')}/profile";
        var parameters = new Dictionary<string, string> { ["requiresTwoFactorSetup"] = "true" };
        if (!string.IsNullOrWhiteSpace(message))
        {
            parameters["message"] = message;
        }

        return QueryHelpers.AddQueryString(profileUrl, parameters);
    }
}

public readonly record struct TwoFactorChallengeState(int UserId, bool RememberMe, DateTimeOffset ExpiresAt);

public class ChangeEmailRequest
{
    [Required]
    [EmailAddress]
    public string NewEmail { get; set; } = string.Empty;

    [Required]
    public string CurrentPassword { get; set; } = string.Empty;
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

    /// <summary>Optional login id. If omitted, the user's email is used (recommended).</summary>
    [MaxLength(256)]
    public string? Username { get; set; }

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

public class TwoFactorChallengeRequest
{
    [Required]
    public string ChallengeToken { get; set; } = string.Empty;

    [Required]
    public string Code { get; set; } = string.Empty;
}

public class TwoFactorSetupVerifyRequest
{
    [Required]
    public string Code { get; set; } = string.Empty;
}
