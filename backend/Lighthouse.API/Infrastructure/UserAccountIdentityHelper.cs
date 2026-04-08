using System;
using System.Linq;
using Lighthouse.API.Data.Entities;

namespace Lighthouse.API.Infrastructure;

public static class UserAccountIdentityHelper
{
    public static AppUser BuildAppUser(
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
        EnsureIdentityStamps(user);
        return user;
    }

    public static void EnsureIdentityStamps(AppUser user)
    {
        if (string.IsNullOrWhiteSpace(user.SecurityStamp))
        {
            user.SecurityStamp = Guid.NewGuid().ToString("N");
        }

        if (string.IsNullOrWhiteSpace(user.ConcurrencyStamp))
        {
            user.ConcurrencyStamp = Guid.NewGuid().ToString("N");
        }
    }

    /// <summary>
    /// Identity user names cannot contain spaces. Default login id is email when valid.
    /// </summary>
    public static string? ResolveIdentityUserName(
        string? preferredUsername,
        string firstName,
        string lastName,
        string email,
        out string? error)
    {
        error = null;
        if (!string.IsNullOrWhiteSpace(preferredUsername))
        {
            var u = preferredUsername.Trim();
            if (u.Length > 256)
            {
                error = "Username is too long.";
                return null;
            }

            if (!ContainsOnlyAllowedIdentityUserNameChars(u))
            {
                error =
                    "Username may only contain letters, numbers, and . _ @ + - (no spaces). Leave blank to use their email as the login id.";
                return null;
            }

            return u;
        }

        var trimmedEmail = email.Trim();
        if (!string.IsNullOrWhiteSpace(trimmedEmail))
        {
            if (!ContainsOnlyAllowedIdentityUserNameChars(trimmedEmail))
            {
                error =
                    "This email contains characters that cannot be used as a login id. Enter a custom username using only letters, numbers, and . _ @ + -.";
                return null;
            }

            return trimmedEmail;
        }

        var slug = new string($"{firstName}{lastName}".Where(char.IsLetterOrDigit).ToArray());
        if (string.IsNullOrEmpty(slug))
        {
            error = "Cannot derive a login id without an email address.";
            return null;
        }

        return slug;
    }

    public static bool ContainsOnlyAllowedIdentityUserNameChars(string value)
    {
        foreach (var c in value)
        {
            if (char.IsLetterOrDigit(c))
            {
                continue;
            }

            if (c is '.' or '_' or '-' or '@' or '+')
            {
                continue;
            }

            return false;
        }

        return true;
    }
}
