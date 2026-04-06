using Lighthouse.API.Data;
using Lighthouse.API.Data.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Lighthouse.API.Infrastructure;

public static class AuthSeeder
{
    public static async Task SeedAsync(IServiceProvider services)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var passwordHasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher<AppUser>>();

        await db.Database.MigrateAsync();

        var safehouse = await db.Safehouses.FirstOrDefaultAsync();
        if (safehouse is null)
        {
            safehouse = new Safehouse
            {
                Name = "Main Safehouse",
                Region = "West",
                Status = "Active",
            };
            db.Safehouses.Add(safehouse);
            await db.SaveChangesAsync();
        }

        var resident = await db.Residents.FirstOrDefaultAsync();
        if (resident is null)
        {
            resident = new Resident
            {
                CaseControlNo = "CASE-0001",
                CaseStatus = "Active",
                SafehouseId = safehouse.Id,
                DateAdmitted = DateTime.UtcNow.Date,
            };
            db.Residents.Add(resident);
            await db.SaveChangesAsync();
        }

        var supporter = await db.Supporters.FirstOrDefaultAsync();
        if (supporter is null)
        {
            supporter = new Supporter
            {
                SupporterType = "MonetaryDonor",
                DisplayName = "Sample Donor",
                Email = "donor@kateri.org",
                Status = "Active",
                CreatedAt = DateTime.UtcNow,
            };
            db.Supporters.Add(supporter);
            await db.SaveChangesAsync();
        }

        var staff = await db.StaffMembers.FirstOrDefaultAsync();
        if (staff is null)
        {
            staff = new StaffMember
            {
                FullName = "Sample Staff",
                Email = "staff@kateri.org",
                Title = "Social Worker",
                SafehouseId = safehouse.Id,
                CreatedAt = DateTime.UtcNow,
            };
            db.StaffMembers.Add(staff);
            await db.SaveChangesAsync();
        }

        await EnsureUserAsync(
            db,
            passwordHasher,
            username: "admin",
            email: "admin@kateri.org",
            password: "Admin#12345",
            role: UserRoles.Admin);

        await EnsureUserAsync(
            db,
            passwordHasher,
            username: "staff1",
            email: "staff@kateri.org",
            password: "Staff#12345",
            role: UserRoles.Staff,
            staffMemberId: staff.Id);

        await EnsureUserAsync(
            db,
            passwordHasher,
            username: "donor1",
            email: "donor@kateri.org",
            password: "Donor#12345",
            role: UserRoles.Donor,
            supporterId: supporter.Id);

        await EnsureUserAsync(
            db,
            passwordHasher,
            username: "resident1",
            email: "resident@kateri.org",
            password: "Resident#12345",
            role: UserRoles.Resident,
            residentId: resident.Id);

        await db.SaveChangesAsync();
    }

    private static async Task EnsureUserAsync(
        AppDbContext db,
        IPasswordHasher<AppUser> passwordHasher,
        string username,
        string email,
        string password,
        string role,
        int? residentId = null,
        int? supporterId = null,
        int? staffMemberId = null)
    {
        if (await db.Users.AnyAsync(user => user.Username == username))
        {
            return;
        }

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
        db.Users.Add(user);
    }
}
