namespace Lighthouse.API.Services;

public interface IStaffNotificationEmailService
{
    Task SendDonationNotificationAsync(
        string donorDisplayName,
        string donorEmail,
        string? donorPhone,
        decimal amount,
        string currency,
        string donationType,
        string campaignName,
        DateTime donationDateUtc,
        string? inKindItemDetails = null,
        CancellationToken cancellationToken = default);

    Task SendVolunteerInterestNotificationAsync(
        string volunteerName,
        string volunteerEmail,
        string? volunteerPhone,
        bool flexibleOnDays,
        IReadOnlyList<string> days,
        IReadOnlyList<string> timesOfDay,
        IReadOnlyList<string> focusAreas,
        string? notes,
        CancellationToken cancellationToken = default);
}
