using Lighthouse.API.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Lighthouse.API.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<StaffMember> StaffMembers => Set<StaffMember>();
    public DbSet<Resident> Residents => Set<Resident>();
    public DbSet<Supporter> Supporters => Set<Supporter>();
    public DbSet<Donation> Donations => Set<Donation>();
    public DbSet<Safehouse> Safehouses => Set<Safehouse>();
    public DbSet<ProcessRecording> ProcessRecordings => Set<ProcessRecording>();
    public DbSet<HomeVisitation> HomeVisitations => Set<HomeVisitation>();
    public DbSet<Partner> Partners => Set<Partner>();
    public DbSet<PublicImpactSnapshot> PublicImpactSnapshots => Set<PublicImpactSnapshot>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AppUser>().ToTable("users");
        modelBuilder.Entity<StaffMember>().ToTable("staff_members");
        modelBuilder.Entity<Resident>().ToTable("residents");
        modelBuilder.Entity<Supporter>().ToTable("supporters");
        modelBuilder.Entity<Donation>().ToTable("donations");
        modelBuilder.Entity<Safehouse>().ToTable("safehouses");
        modelBuilder.Entity<ProcessRecording>().ToTable("process_recordings");
        modelBuilder.Entity<HomeVisitation>().ToTable("home_visitations");
        modelBuilder.Entity<Partner>().ToTable("partners");
        modelBuilder.Entity<PublicImpactSnapshot>().ToTable("public_impact_snapshots");

        modelBuilder.Entity<AppUser>().Property(user => user.Id).HasColumnName("user_id");
        modelBuilder.Entity<AppUser>().Property(user => user.Username).HasColumnName("full_name");
        modelBuilder.Entity<AppUser>().Property(user => user.Email).HasColumnName("email");
        modelBuilder.Entity<AppUser>().Property(user => user.PasswordHash).HasColumnName("password_hash");
        modelBuilder.Entity<AppUser>().Property(user => user.Role).HasColumnName("role");
        modelBuilder.Entity<AppUser>().Property(user => user.IsActive).HasColumnName("is_active");
        modelBuilder.Entity<AppUser>().Property(user => user.CreatedAt).HasColumnName("created_at");
        modelBuilder.Entity<AppUser>().Property(user => user.ResidentId).HasColumnName("resident_id");
        modelBuilder.Entity<AppUser>().Property(user => user.SupporterId).HasColumnName("supporter_id");
        modelBuilder.Entity<AppUser>().Property(user => user.StaffMemberId).HasColumnName("staff_member_id");
        modelBuilder.Entity<StaffMember>().Property(staff => staff.Id).HasColumnName("staff_member_id");

        modelBuilder.Entity<AppUser>()
            .HasIndex(user => user.Email)
            .IsUnique();
        modelBuilder.Entity<AppUser>()
            .HasOne(user => user.Resident)
            .WithMany()
            .HasForeignKey(user => user.ResidentId)
            .OnDelete(DeleteBehavior.SetNull);
        modelBuilder.Entity<AppUser>()
            .HasOne(user => user.Supporter)
            .WithMany()
            .HasForeignKey(user => user.SupporterId)
            .OnDelete(DeleteBehavior.SetNull);
        modelBuilder.Entity<AppUser>()
            .HasOne(user => user.StaffMember)
            .WithMany()
            .HasForeignKey(user => user.StaffMemberId)
            .OnDelete(DeleteBehavior.SetNull);
        modelBuilder.Entity<AppUser>()
            .HasIndex(user => user.ResidentId)
            .IsUnique();
        modelBuilder.Entity<AppUser>()
            .HasIndex(user => user.SupporterId)
            .IsUnique();
        modelBuilder.Entity<AppUser>()
            .HasIndex(user => user.StaffMemberId)
            .IsUnique();

        modelBuilder.Entity<StaffMember>()
            .HasOne<Safehouse>()
            .WithMany()
            .HasForeignKey(staff => staff.SafehouseId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}
