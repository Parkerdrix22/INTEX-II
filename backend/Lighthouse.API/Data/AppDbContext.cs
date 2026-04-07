using Lighthouse.API.Data.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Lighthouse.API.Data;

// =============================================================================
// AppDbContext
//
// Schema layout:
//   public.users + public.AspNet*       — ASP.NET Core Identity (auth)
//   public.staff_members                 — Internal staff (no lighthouse equivalent)
//   lighthouse.supporters                — Real donors (62 rows)
//   lighthouse.donations                 — Real donations (431 rows)
//   lighthouse.donation_allocations      — Per-allocation breakdown
//   lighthouse.residents                 — Real residents (60 rows)
//   lighthouse.safehouses                — Real safehouses (9 rows)
//   lighthouse.process_recordings        — Session notes per resident
//   lighthouse.home_visitations          — Home visit logs per resident
//   lighthouse.<other operational tables>
//
// Lighthouse tables use snake_case columns and bigint IDs (the user imported
// the dataset that way). Identity tables use snake_case columns but int IDs
// (configured below). Cross-schema FKs are declared as nav properties for
// navigation purposes only — the underlying DB constraints have been dropped
// because they don't survive a cross-schema migration cleanly.
// =============================================================================

public class AppDbContext(DbContextOptions<AppDbContext> options)
    : IdentityDbContext<AppUser, IdentityRole<int>, int>(options)
{
    public new DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<StaffMember> StaffMembers => Set<StaffMember>();
    public DbSet<Resident> Residents => Set<Resident>();
    public DbSet<Supporter> Supporters => Set<Supporter>();
    public DbSet<Donation> Donations => Set<Donation>();
    public DbSet<Safehouse> Safehouses => Set<Safehouse>();
    public DbSet<ProcessRecording> ProcessRecordings => Set<ProcessRecording>();
    public DbSet<HomeVisitation> HomeVisitations => Set<HomeVisitation>();
    // NOTE: Partner and PublicImpactSnapshot were registered before but never
    // queried by any controller, and the lighthouse.public_impact_snapshots
    // table has a fundamentally different shape (json blob vs scalar columns).
    // They've been removed from the DbContext to avoid carrying dead mappings.

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // ── Identity / users (public schema) ─────────────────────────────────
        modelBuilder.Entity<AppUser>().ToTable("users");

        modelBuilder.Entity<AppUser>().Property(user => user.Id).HasColumnName("user_id");
        modelBuilder.Entity<AppUser>().Property(user => user.Email).HasColumnName("email");
        modelBuilder.Entity<AppUser>().Property(user => user.FirstName).HasColumnName("first_name");
        modelBuilder.Entity<AppUser>().Property(user => user.LastName).HasColumnName("last_name");
        modelBuilder.Entity<AppUser>().Property(user => user.PasswordHash).HasColumnName("password_hash");
        modelBuilder.Entity<AppUser>().Property(user => user.UserName).HasColumnName("full_name");
        modelBuilder.Entity<AppUser>().Property(user => user.NormalizedUserName).HasColumnName("normalized_user_name");
        modelBuilder.Entity<AppUser>().Property(user => user.NormalizedEmail).HasColumnName("normalized_email");
        modelBuilder.Entity<AppUser>().Property(user => user.SecurityStamp).HasColumnName("security_stamp");
        modelBuilder.Entity<AppUser>().Property(user => user.ConcurrencyStamp).HasColumnName("concurrency_stamp");
        modelBuilder.Entity<AppUser>().Property(user => user.PhoneNumber).HasColumnName("phone_number");
        modelBuilder.Entity<AppUser>().Property(user => user.PhoneNumberConfirmed).HasColumnName("phone_number_confirmed");
        modelBuilder.Entity<AppUser>().Property(user => user.TwoFactorEnabled).HasColumnName("two_factor_enabled");
        modelBuilder.Entity<AppUser>().Property(user => user.LockoutEnd).HasColumnName("lockout_end");
        modelBuilder.Entity<AppUser>().Property(user => user.LockoutEnabled).HasColumnName("lockout_enabled");
        modelBuilder.Entity<AppUser>().Property(user => user.AccessFailedCount).HasColumnName("access_failed_count");
        modelBuilder.Entity<AppUser>().Property(user => user.EmailConfirmed).HasColumnName("email_confirmed");
        modelBuilder.Entity<AppUser>().Property(user => user.Role).HasColumnName("role");
        modelBuilder.Entity<AppUser>().Property(user => user.IsActive).HasColumnName("is_active");
        modelBuilder.Entity<AppUser>().Property(user => user.CreatedAt).HasColumnName("created_at");
        modelBuilder.Entity<AppUser>().Property(user => user.ResidentId).HasColumnName("resident_id");
        modelBuilder.Entity<AppUser>().Property(user => user.SupporterId).HasColumnName("supporter_id");
        modelBuilder.Entity<AppUser>().Property(user => user.StaffMemberId).HasColumnName("staff_member_id");

        // ── StaffMember stays in public.staff_members (no lighthouse equivalent) ──
        modelBuilder.Entity<StaffMember>().ToTable("staff_members");
        modelBuilder.Entity<StaffMember>().Property(staff => staff.Id).HasColumnName("staff_member_id");

        // ── Operational tables — all live in the lighthouse schema with snake_case columns ──

        // Supporter → lighthouse.supporters
        modelBuilder.Entity<Supporter>().ToTable("supporters", "lighthouse");
        modelBuilder.Entity<Supporter>().Property(s => s.Id).HasColumnName("supporter_id").HasConversion<long>();
        modelBuilder.Entity<Supporter>().Property(s => s.SupporterType).HasColumnName("supporter_type");
        modelBuilder.Entity<Supporter>().Property(s => s.DisplayName).HasColumnName("display_name");
        modelBuilder.Entity<Supporter>().Property(s => s.Email).HasColumnName("email");
        modelBuilder.Entity<Supporter>().Property(s => s.Status).HasColumnName("status");
        modelBuilder.Entity<Supporter>().Property(s => s.CreatedAt).HasColumnName("created_at");

        // Donation → lighthouse.donations
        modelBuilder.Entity<Donation>().ToTable("donations", "lighthouse");
        modelBuilder.Entity<Donation>().Property(d => d.Id).HasColumnName("donation_id").HasConversion<long>();
        modelBuilder.Entity<Donation>().Property(d => d.SupporterId).HasColumnName("supporter_id").HasConversion<long?>();
        modelBuilder.Entity<Donation>().Property(d => d.Amount).HasColumnName("estimated_value");
        modelBuilder.Entity<Donation>().Property(d => d.Currency).HasColumnName("currency_code");
        modelBuilder.Entity<Donation>().Property(d => d.DonatedAt).HasColumnName("donation_date");
        modelBuilder.Entity<Donation>().Property(d => d.CampaignName).HasColumnName("campaign_name");

        // Resident → lighthouse.residents
        modelBuilder.Entity<Resident>().ToTable("residents", "lighthouse");
        modelBuilder.Entity<Resident>().Property(r => r.Id).HasColumnName("resident_id").HasConversion<long>();
        modelBuilder.Entity<Resident>().Property(r => r.CaseControlNo).HasColumnName("case_control_no");
        modelBuilder.Entity<Resident>().Property(r => r.CaseStatus).HasColumnName("case_status");
        modelBuilder.Entity<Resident>().Property(r => r.SafehouseId).HasColumnName("safehouse_id").HasConversion<long?>();
        modelBuilder.Entity<Resident>().Property(r => r.AssignedSocialWorker).HasColumnName("assigned_social_worker");
        modelBuilder.Entity<Resident>().Property(r => r.DateAdmitted).HasColumnName("date_of_admission");
        modelBuilder.Entity<Resident>().Property(r => r.DateClosed).HasColumnName("date_closed");

        // Safehouse → lighthouse.safehouses
        modelBuilder.Entity<Safehouse>().ToTable("safehouses", "lighthouse");
        modelBuilder.Entity<Safehouse>().Property(sh => sh.Id).HasColumnName("safehouse_id").HasConversion<long>();
        modelBuilder.Entity<Safehouse>().Property(sh => sh.Name).HasColumnName("name");
        modelBuilder.Entity<Safehouse>().Property(sh => sh.Region).HasColumnName("region");
        modelBuilder.Entity<Safehouse>().Property(sh => sh.Status).HasColumnName("status");

        // ProcessRecording → lighthouse.process_recordings
        modelBuilder.Entity<ProcessRecording>().ToTable("process_recordings", "lighthouse");
        modelBuilder.Entity<ProcessRecording>().Property(pr => pr.Id).HasColumnName("recording_id").HasConversion<long>();
        modelBuilder.Entity<ProcessRecording>().Property(pr => pr.ResidentId).HasColumnName("resident_id").HasConversion<long>();
        modelBuilder.Entity<ProcessRecording>().Property(pr => pr.SessionDate).HasColumnName("session_date");
        modelBuilder.Entity<ProcessRecording>().Property(pr => pr.SessionType).HasColumnName("session_type");
        modelBuilder.Entity<ProcessRecording>().Property(pr => pr.EmotionalState).HasColumnName("emotional_state_observed");
        modelBuilder.Entity<ProcessRecording>().Property(pr => pr.NarrativeSummary).HasColumnName("session_narrative");

        // HomeVisitation → lighthouse.home_visitations
        modelBuilder.Entity<HomeVisitation>().ToTable("home_visitations", "lighthouse");
        modelBuilder.Entity<HomeVisitation>().Property(hv => hv.Id).HasColumnName("visitation_id").HasConversion<long>();
        modelBuilder.Entity<HomeVisitation>().Property(hv => hv.ResidentId).HasColumnName("resident_id").HasConversion<long>();
        modelBuilder.Entity<HomeVisitation>().Property(hv => hv.VisitDate).HasColumnName("visit_date");
        modelBuilder.Entity<HomeVisitation>().Property(hv => hv.VisitType).HasColumnName("visit_type");
        modelBuilder.Entity<HomeVisitation>().Property(hv => hv.Observations).HasColumnName("observations");

        // ── Index + cross-schema relationships ───────────────────────────────

        modelBuilder.Entity<AppUser>()
            .HasIndex(user => user.Email)
            .IsUnique();
        modelBuilder.Entity<AppUser>()
            .HasIndex(user => user.ResidentId)
            .IsUnique();
        modelBuilder.Entity<AppUser>()
            .HasIndex(user => user.SupporterId)
            .IsUnique();
        modelBuilder.Entity<AppUser>()
            .HasIndex(user => user.StaffMemberId)
            .IsUnique();

        // Navigation properties only — DB-level FKs are NOT enforced because
        // they would need to span schemas (public.users → lighthouse.*) which
        // EF migrations don't handle cleanly. Application code is responsible
        // for referential integrity.
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
    }
}
