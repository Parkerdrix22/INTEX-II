using Lighthouse.API.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Lighthouse.API.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
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
        modelBuilder.Entity<Resident>().ToTable("residents");
        modelBuilder.Entity<Supporter>().ToTable("supporters");
        modelBuilder.Entity<Donation>().ToTable("donations");
        modelBuilder.Entity<Safehouse>().ToTable("safehouses");
        modelBuilder.Entity<ProcessRecording>().ToTable("process_recordings");
        modelBuilder.Entity<HomeVisitation>().ToTable("home_visitations");
        modelBuilder.Entity<Partner>().ToTable("partners");
        modelBuilder.Entity<PublicImpactSnapshot>().ToTable("public_impact_snapshots");
    }
}
