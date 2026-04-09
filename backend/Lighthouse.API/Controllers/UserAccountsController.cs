using System.ComponentModel.DataAnnotations;
using System.Linq;
using Lighthouse.API.Data;
using Lighthouse.API.Data.Entities;
using Lighthouse.API.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lighthouse.API.Controllers;

[ApiController]
[Route("api/user-accounts")]
[Authorize(Roles = "Admin")]
public class UserAccountsController(AppDbContext dbContext, UserManager<AppUser> userManager) : ControllerBase
{
    public sealed record DonorAccountRow(int Id, string? Email, string FirstName, string LastName, string? LoginId, int? SupporterId);

    public sealed record AdminAccountRow(int Id, string? Email, string FirstName, string LastName, string? LoginId, int? StaffMemberId);

    public sealed record ManageableUserRow(
        int Id,
        string? Email,
        string FirstName,
        string LastName,
        string? LoginId,
        string Role,
        int? ResidentId,
        int? SupporterId,
        int? StaffMemberId);

    public sealed class AdminCreateUserRequest
    {
        [Required]
        public string FirstName { get; set; } = string.Empty;

        [Required]
        public string LastName { get; set; } = string.Empty;

        [Required]
        [EmailAddress]
        public string Email { get; set; } = string.Empty;

        [Required]
        [MinLength(14)]
        public string Password { get; set; } = string.Empty;

        [Required]
        public string Role { get; set; } = UserRoles.Donor;
    }

    public sealed class AdminUpdateUserRequest
    {
        [Required]
        public string FirstName { get; set; } = string.Empty;

        [Required]
        public string LastName { get; set; } = string.Empty;

        [Required]
        [EmailAddress]
        public string Email { get; set; } = string.Empty;

        [Required]
        public string Role { get; set; } = UserRoles.Donor;
    }

    public sealed class DemoteAdminRequest
    {
        /// <summary>Staff or Donor</summary>
        [Required]
        public string TargetRole { get; set; } = UserRoles.Staff;
    }

    private int? CallerUserId()
    {
        var v = User.FindFirst("user_id")?.Value;
        return int.TryParse(v, out var id) ? id : null;
    }

    [HttpGet("donors")]
    public async Task<IActionResult> ListDonorAccounts()
    {
        var rows = await userManager.Users.AsNoTracking()
            .Where(user => user.Role == UserRoles.Donor)
            .OrderBy(user => user.LastName)
            .ThenBy(user => user.FirstName)
            .Select(user => new DonorAccountRow(
                user.Id,
                user.Email,
                user.FirstName,
                user.LastName,
                user.UserName,
                user.SupporterId))
            .ToListAsync();

        return Ok(rows);
    }

    [HttpGet("admins")]
    public async Task<IActionResult> ListAdmins()
    {
        var rows = await userManager.Users.AsNoTracking()
            .Where(u => u.Role == UserRoles.Admin)
            .OrderBy(u => u.LastName)
            .ThenBy(u => u.FirstName)
            .Select(u => new AdminAccountRow(
                u.Id,
                u.Email,
                u.FirstName,
                u.LastName,
                u.UserName,
                u.StaffMemberId))
            .ToListAsync();

        return Ok(rows);
    }

    [HttpGet("manageable")]
    public async Task<IActionResult> ListManageableUsers()
    {
        var rows = await userManager.Users.AsNoTracking()
            .Where(u => u.Role != UserRoles.Admin)
            .OrderBy(u => u.LastName)
            .ThenBy(u => u.FirstName)
            .Select(u => new ManageableUserRow(
                u.Id,
                u.Email,
                u.FirstName,
                u.LastName,
                u.UserName,
                u.Role,
                u.ResidentId,
                u.SupporterId,
                u.StaffMemberId))
            .ToListAsync();

        return Ok(rows);
    }

    [HttpPost]
    public async Task<IActionResult> AdminCreateUser([FromBody] AdminCreateUserRequest request)
    {
        var firstName = request.FirstName.Trim();
        var lastName = request.LastName.Trim();
        var emailTrim = request.Email.Trim();
        var roleNorm = request.Role.Trim();
        if (!IsResidentDonorOrStaff(roleNorm, out var role))
        {
            return BadRequest(new { message = "Role must be Resident, Donor, or Staff." });
        }

        var username = UserAccountIdentityHelper.ResolveIdentityUserName(null, firstName, lastName, emailTrim, out var usernameError);
        if (usernameError is not null || string.IsNullOrWhiteSpace(username))
        {
            return BadRequest(new { message = usernameError ?? "Unable to assign a login id." });
        }

        var normalizedEmail = emailTrim.ToLowerInvariant();
        if (await userManager.Users.AnyAsync(u => u.Email != null && u.Email.ToLower() == normalizedEmail))
        {
            return Conflict(new { message = "An account with this email already exists." });
        }

        if (await userManager.FindByNameAsync(username) is not null)
        {
            return Conflict(new { message = "An account with this login id already exists." });
        }

        int? residentId = null;
        int? supporterId = null;
        int? staffMemberId = null;

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
        else if (role == UserRoles.Donor)
        {
            var supporter = new Supporter
            {
                SupporterType = "MonetaryDonor",
                DisplayName = $"{firstName} {lastName}".Trim(),
                Email = emailTrim,
                Status = "Active",
                CreatedAt = DateTime.UtcNow,
            };
            dbContext.Supporters.Add(supporter);
            await dbContext.SaveChangesAsync();
            supporterId = supporter.Id;
        }
        else
        {
            var staffMember = new StaffMember
            {
                FullName = $"{firstName} {lastName}".Trim(),
                Email = emailTrim,
                Title = "Staff",
                CreatedAt = DateTime.UtcNow,
            };
            dbContext.StaffMembers.Add(staffMember);
            await dbContext.SaveChangesAsync();
            staffMemberId = staffMember.Id;
        }

        var user = UserAccountIdentityHelper.BuildAppUser(
            username,
            firstName,
            lastName,
            emailTrim,
            role,
            residentId,
            supporterId,
            staffMemberId);

        var createResult = await userManager.CreateAsync(user, request.Password);
        if (!createResult.Succeeded)
        {
            return BadRequest(new { message = string.Join(" ", createResult.Errors.Select(e => e.Description)) });
        }

        return Ok(new { message = "Account created successfully." });
    }

    [HttpPut("{userId:int}")]
    public async Task<IActionResult> AdminUpdateUser(int userId, [FromBody] AdminUpdateUserRequest request)
    {
        var user = await userManager.FindByIdAsync(userId.ToString());
        if (user is null)
        {
            return NotFound(new { message = "User not found." });
        }

        if (string.Equals(user.Role, UserRoles.Admin, StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { message = "Administrators cannot be edited in this table. Use demote first if needed." });
        }

        var firstName = request.FirstName.Trim();
        var lastName = request.LastName.Trim();
        var emailTrim = request.Email.Trim();
        if (!IsResidentDonorOrStaff(request.Role.Trim(), out var newRole))
        {
            return BadRequest(new { message = "Role must be Resident, Donor, or Staff." });
        }

        var normalizedEmail = emailTrim.ToLowerInvariant();
        if (await userManager.Users.AnyAsync(u => u.Id != userId && u.Email != null && u.Email.ToLower() == normalizedEmail))
        {
            return Conflict(new { message = "Another account already uses this email." });
        }

        var loginId = UserAccountIdentityHelper.ResolveIdentityUserName(null, firstName, lastName, emailTrim, out var loginErr);
        if (loginErr is not null || string.IsNullOrWhiteSpace(loginId))
        {
            return BadRequest(new { message = loginErr ?? "Unable to assign a login id." });
        }

        var normalizedLogin = userManager.NormalizeName(loginId);
        if (!string.IsNullOrEmpty(normalizedLogin))
        {
            var dupLogin = await userManager.Users.FirstOrDefaultAsync(u =>
                u.NormalizedUserName == normalizedLogin && u.Id != userId);
            if (dupLogin is not null)
            {
                return Conflict(new { message = "Another account already uses this sign-in id." });
            }
        }

        var oldRole = user.Role;
        if (!string.Equals(oldRole, newRole, StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                var transition = await TryTransitionRoleAsync(user, oldRole, newRole);
                if (transition is not null)
                {
                    return BadRequest(new { message = transition });
                }
            }
            catch (Exception ex)
            {
                return BadRequest(new
                {
                    message = $"Role transition failed: {ex.Message}",
                });
            }
        }

        user.FirstName = firstName;
        user.LastName = lastName;
        user.Email = emailTrim;
        user.UserName = loginId;
        user.Role = newRole;

        await SyncLinkedProfilesAsync(user, firstName, lastName, emailTrim);

        UserAccountIdentityHelper.EnsureIdentityStamps(user);
        var updateResult = await userManager.UpdateAsync(user);
        if (!updateResult.Succeeded)
        {
            return BadRequest(new { message = string.Join(" ", updateResult.Errors.Select(e => e.Description)) });
        }

        return Ok(new { message = "User updated." });
    }

    [HttpDelete("{userId:int}")]
    public async Task<IActionResult> AdminDeleteUser(int userId)
    {
        var caller = CallerUserId();
        if (caller is null)
        {
            return Unauthorized();
        }

        if (userId == caller.Value)
        {
            return BadRequest(new { message = "You cannot delete your own account." });
        }

        var target = await userManager.FindByIdAsync(userId.ToString());
        if (target is null)
        {
            return NotFound(new { message = "User not found." });
        }

        if (string.Equals(target.Role, UserRoles.Admin, StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { message = "Delete administrators from the administrators table after demoting them." });
        }

        var deleteResult = await userManager.DeleteAsync(target);
        if (!deleteResult.Succeeded)
        {
            return BadRequest(new { message = string.Join(" ", deleteResult.Errors.Select(e => e.Description)) });
        }

        return Ok(new { message = "User deleted." });
    }

    [HttpPost("{userId:int}/promote-to-admin")]
    public async Task<IActionResult> PromoteToAdmin(int userId)
    {
        var callerId = CallerUserId();
        if (callerId is null)
        {
            return Unauthorized();
        }

        if (userId == callerId.Value)
        {
            return BadRequest(new { message = "You cannot promote your own account this way." });
        }

        var target = await userManager.FindByIdAsync(userId.ToString());
        if (target is null)
        {
            return NotFound(new { message = "User not found." });
        }

        if (string.Equals(target.Role, UserRoles.Admin, StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { message = "This user is already an administrator." });
        }

        var canPromote = string.Equals(target.Role, UserRoles.Donor, StringComparison.OrdinalIgnoreCase)
            || string.Equals(target.Role, UserRoles.Staff, StringComparison.OrdinalIgnoreCase)
            || string.Equals(target.Role, UserRoles.Resident, StringComparison.OrdinalIgnoreCase);
        if (!canPromote)
        {
            return BadRequest(new { message = "This account cannot be promoted to administrator." });
        }

        var displayName = $"{target.FirstName} {target.LastName}".Trim();
        if (string.IsNullOrEmpty(displayName) && !string.IsNullOrWhiteSpace(target.Email))
        {
            displayName = target.Email.Trim();
        }

        StaffMember? staffRow = null;
        if (target.StaffMemberId.HasValue)
        {
            staffRow = await dbContext.StaffMembers.FindAsync(target.StaffMemberId.Value);
        }

        if (staffRow is null)
        {
            staffRow = new StaffMember
            {
                FullName = displayName,
                Email = target.Email?.Trim() ?? string.Empty,
                Title = "Administrator",
                CreatedAt = DateTime.UtcNow,
            };
            dbContext.StaffMembers.Add(staffRow);
            await dbContext.SaveChangesAsync();
            target.StaffMemberId = staffRow.Id;
        }
        else
        {
            staffRow.Title = "Administrator";
            if (!string.IsNullOrEmpty(displayName))
            {
                staffRow.FullName = displayName;
            }

            if (!string.IsNullOrWhiteSpace(target.Email))
            {
                staffRow.Email = target.Email.Trim();
            }

            await dbContext.SaveChangesAsync();
        }

        target.Role = UserRoles.Admin;

        UserAccountIdentityHelper.EnsureIdentityStamps(target);
        var updateResult = await userManager.UpdateAsync(target);
        if (!updateResult.Succeeded)
        {
            return BadRequest(new
            {
                message = string.Join(" ", updateResult.Errors.Select(error => error.Description)),
            });
        }

        return Ok(new
        {
            message =
                "This user is now an administrator. They should refresh the site or sign out and back in if pages still show their old role.",
        });
    }

    [HttpPost("{userId:int}/demote-from-admin")]
    public async Task<IActionResult> DemoteFromAdmin(int userId, [FromBody] DemoteAdminRequest request)
    {
        var callerId = CallerUserId();
        if (callerId is null)
        {
            return Unauthorized();
        }

        if (userId == callerId.Value)
        {
            return BadRequest(new { message = "You cannot demote yourself." });
        }

        var adminCount = await userManager.Users.CountAsync(u => u.Role == UserRoles.Admin);
        if (adminCount <= 1)
        {
            return BadRequest(new { message = "Cannot demote the last administrator." });
        }

        var target = await userManager.FindByIdAsync(userId.ToString());
        if (target is null)
        {
            return NotFound(new { message = "User not found." });
        }

        if (!string.Equals(target.Role, UserRoles.Admin, StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { message = "User is not an administrator." });
        }

        var targetRole = request.TargetRole.Trim();
        if (!string.Equals(targetRole, UserRoles.Staff, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(targetRole, UserRoles.Donor, StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { message = "Target role must be Staff or Donor." });
        }

        if (target.StaffMemberId.HasValue)
        {
            var sm = await dbContext.StaffMembers.FindAsync(target.StaffMemberId.Value);
            if (sm is not null)
            {
                dbContext.StaffMembers.Remove(sm);
            }

            target.StaffMemberId = null;
        }

        if (string.Equals(targetRole, UserRoles.Staff, StringComparison.OrdinalIgnoreCase))
        {
            var newSm = new StaffMember
            {
                FullName = $"{target.FirstName} {target.LastName}".Trim(),
                Email = target.Email?.Trim() ?? string.Empty,
                Title = "Staff",
                CreatedAt = DateTime.UtcNow,
            };
            dbContext.StaffMembers.Add(newSm);
            await dbContext.SaveChangesAsync();
            target.StaffMemberId = newSm.Id;
            target.Role = UserRoles.Staff;
        }
        else
        {
            if (!target.SupporterId.HasValue)
            {
                var supporter = new Supporter
                {
                    SupporterType = "MonetaryDonor",
                    DisplayName = $"{target.FirstName} {target.LastName}".Trim(),
                    Email = target.Email?.Trim(),
                    Status = "Active",
                    CreatedAt = DateTime.UtcNow,
                };
                dbContext.Supporters.Add(supporter);
                await dbContext.SaveChangesAsync();
                target.SupporterId = supporter.Id;
            }

            target.Role = UserRoles.Donor;
        }

        await dbContext.SaveChangesAsync();

        UserAccountIdentityHelper.EnsureIdentityStamps(target);
        var updateResult = await userManager.UpdateAsync(target);
        if (!updateResult.Succeeded)
        {
            return BadRequest(new { message = string.Join(" ", updateResult.Errors.Select(e => e.Description)) });
        }

        return Ok(new
        {
            message = $"User is now {target.Role}. They should refresh the site or sign out and back in.",
        });
    }

    private static bool IsResidentDonorOrStaff(string roleInput, out string normalized)
    {
        if (string.Equals(roleInput, UserRoles.Resident, StringComparison.OrdinalIgnoreCase))
        {
            normalized = UserRoles.Resident;
            return true;
        }

        if (string.Equals(roleInput, UserRoles.Donor, StringComparison.OrdinalIgnoreCase))
        {
            normalized = UserRoles.Donor;
            return true;
        }

        if (string.Equals(roleInput, UserRoles.Staff, StringComparison.OrdinalIgnoreCase))
        {
            normalized = UserRoles.Staff;
            return true;
        }

        normalized = roleInput;
        return false;
    }

    /// <summary>Returns error message or null if OK.</summary>
    private async Task<string?> TryTransitionRoleAsync(AppUser user, string oldRole, string newRole)
    {
        if (string.Equals(oldRole, UserRoles.Resident, StringComparison.OrdinalIgnoreCase))
        {
            return "Residents cannot change account type here. Create a new account if needed.";
        }

        if (string.Equals(oldRole, UserRoles.Donor, StringComparison.OrdinalIgnoreCase)
            && string.Equals(newRole, UserRoles.Staff, StringComparison.OrdinalIgnoreCase))
        {
            if (user.StaffMemberId.HasValue)
            {
                return null;
            }

            var staffMember = new StaffMember
            {
                FullName = $"{user.FirstName} {user.LastName}".Trim(),
                Email = user.Email?.Trim() ?? string.Empty,
                Title = "Staff",
                CreatedAt = DateTime.UtcNow,
            };
            dbContext.StaffMembers.Add(staffMember);
            await dbContext.SaveChangesAsync();
            user.StaffMemberId = staffMember.Id;
            return null;
        }

        if (string.Equals(oldRole, UserRoles.Staff, StringComparison.OrdinalIgnoreCase)
            && string.Equals(newRole, UserRoles.Donor, StringComparison.OrdinalIgnoreCase))
        {
            if (user.StaffMemberId.HasValue)
            {
                var sm = await dbContext.StaffMembers.FindAsync(user.StaffMemberId.Value);
                if (sm is not null)
                {
                    dbContext.StaffMembers.Remove(sm);
                }

                user.StaffMemberId = null;
            }

            if (!user.SupporterId.HasValue)
            {
                var normalizedEmail = user.Email?.Trim().ToLowerInvariant();
                Supporter? supporter = null;
                if (!string.IsNullOrWhiteSpace(normalizedEmail))
                {
                    supporter = await dbContext.Supporters
                        .FirstOrDefaultAsync(s =>
                            s.Email != null &&
                            s.Email.ToLower() == normalizedEmail);
                }

                if (supporter is null)
                {
                    supporter = new Supporter
                    {
                        SupporterType = "MonetaryDonor",
                        DisplayName = $"{user.FirstName} {user.LastName}".Trim(),
                        Email = user.Email?.Trim(),
                        Status = "Active",
                        CreatedAt = DateTime.UtcNow,
                    };
                    dbContext.Supporters.Add(supporter);
                    await dbContext.SaveChangesAsync();
                }

                user.SupporterId = supporter.Id;
            }

            return null;
        }

        if (string.Equals(oldRole, newRole, StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        return "Only Donor ↔ Staff role changes are supported for non-residents.";
    }

    private async Task SyncLinkedProfilesAsync(AppUser user, string firstName, string lastName, string email)
    {
        var display = $"{firstName} {lastName}".Trim();
        if (user.ResidentId.HasValue)
        {
            var r = await dbContext.Residents.FindAsync(user.ResidentId.Value);
            if (r is not null)
            {
                // Resident entity may not have name fields — skip if none
            }
        }

        if (user.SupporterId.HasValue)
        {
            var s = await dbContext.Supporters.FindAsync(user.SupporterId.Value);
            if (s is not null)
            {
                s.DisplayName = display;
                s.Email = email;
            }
        }

        if (user.StaffMemberId.HasValue)
        {
            var sm = await dbContext.StaffMembers.FindAsync(user.StaffMemberId.Value);
            if (sm is not null)
            {
                sm.FullName = display;
                sm.Email = email;
            }
        }

        await dbContext.SaveChangesAsync();
    }
}
