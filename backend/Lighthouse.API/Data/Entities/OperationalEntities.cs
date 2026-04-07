using Microsoft.AspNetCore.Identity;
using System.ComponentModel.DataAnnotations.Schema;

namespace Lighthouse.API.Data.Entities;

public static class UserRoles
{
    public const string Admin = "Admin";
    public const string Staff = "Staff";
    public const string Donor = "Donor";
    public const string Resident = "Resident";
}

public class AppUser : IdentityUser<int>
{
    public string Role { get; set; } = UserRoles.Staff;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    [NotMapped]
    public string Username
    {
        get => UserName ?? string.Empty;
        set => UserName = value;
    }

    public int? ResidentId { get; set; }
    public Resident? Resident { get; set; }

    public int? SupporterId { get; set; }
    public Supporter? Supporter { get; set; }

    public int? StaffMemberId { get; set; }
    public StaffMember? StaffMember { get; set; }
}

public class StaffMember
{
    public int Id { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Title { get; set; } = "Social Worker";
    public int? SafehouseId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Resident
{
    public int Id { get; set; }
    public string CaseControlNo { get; set; } = string.Empty;
    public string CaseStatus { get; set; } = string.Empty;
    public int? SafehouseId { get; set; }
    public string? AssignedSocialWorker { get; set; }
    public DateTime? DateAdmitted { get; set; }
    public DateTime? DateClosed { get; set; }
}

public class Supporter
{
    public int Id { get; set; }
    public string SupporterType { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string Status { get; set; } = string.Empty;
    public DateTime? CreatedAt { get; set; }
}

public class Donation
{
    public int Id { get; set; }
    public int? SupporterId { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "USD";
    public DateTime? DonatedAt { get; set; }
    public string? CampaignName { get; set; }
}

public class Safehouse
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Region { get; set; }
    public string Status { get; set; } = string.Empty;
}

public class ProcessRecording
{
    public int Id { get; set; }
    public int ResidentId { get; set; }
    public DateTime SessionDate { get; set; }
    public string SessionType { get; set; } = string.Empty;
    public string? EmotionalState { get; set; }
    public string? NarrativeSummary { get; set; }
}

public class HomeVisitation
{
    public int Id { get; set; }
    public int ResidentId { get; set; }
    public DateTime VisitDate { get; set; }
    public string VisitType { get; set; } = string.Empty;
    public string? Observations { get; set; }
}

public class Partner
{
    public int Id { get; set; }
    public string PartnerName { get; set; } = string.Empty;
    public string PartnerType { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string Status { get; set; } = string.Empty;
}

public class PublicImpactSnapshot
{
    public int Id { get; set; }
    public DateTime SnapshotDate { get; set; }
    public int ResidentsServed { get; set; }
    public decimal DonationsReceived { get; set; }
}
