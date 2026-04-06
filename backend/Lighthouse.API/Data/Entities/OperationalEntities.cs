namespace Lighthouse.API.Data.Entities;

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
