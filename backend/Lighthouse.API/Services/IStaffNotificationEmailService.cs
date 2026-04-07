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
