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

    Task SendDonationReceiptAsync(
        string donorDisplayName,
        string donorEmail,
        decimal amount,
        string currency,
        string donationType,
        string campaignName,
        DateTime donationDateUtc,
        string? inKindItemDetails = null,
        CancellationToken cancellationToken = default);

    Task SendVolunteerConfirmationAsync(
        string volunteerName,
        string volunteerEmail,
        bool flexibleOnDays,
        IReadOnlyList<string> days,
        IReadOnlyList<string> timesOfDay,
        IReadOnlyList<string> focusAreas,
        string? notes,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Send an arbitrary thank-you email (subject + plain-text body) to a donor
    /// through the configured SMTP transport. Used by the AI thank-you drafter
    /// on the Donors &amp; Contributions staff page. Returns true on success,
    /// false if the recipient was empty or SMTP is misconfigured; throws on
    /// transport failures so the controller can return an error to the caller.
    /// </summary>
    Task<bool> SendThankYouEmailAsync(
        string donorEmail,
        string donorName,
        string subject,
        string plainTextBody,
        CancellationToken cancellationToken = default);
}
