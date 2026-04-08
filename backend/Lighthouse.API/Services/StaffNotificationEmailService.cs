using System.Net;
using System.Net.Mail;
using System.Text;

namespace Lighthouse.API.Services;

/// <summary>
/// Sends HTML notifications to staff when donors give or volunteer.
/// If SMTP is not configured, sends are skipped and a warning is logged (operations still succeed).
/// </summary>
public class StaffNotificationEmailService(
    IConfiguration configuration,
    ILogger<StaffNotificationEmailService> logger) : IStaffNotificationEmailService
{
    private const string DefaultStaffTo = "park2002@byu.edu";

    public Task SendDonationNotificationAsync(
        string donorDisplayName,
        string donorEmail,
        string? donorPhone,
        decimal amount,
        string currency,
        string donationType,
        string campaignName,
        DateTime donationDateUtc,
        string? inKindItemDetails = null,
        CancellationToken cancellationToken = default)
    {
        var subject = string.IsNullOrWhiteSpace(inKindItemDetails)
            ? $"[Kateri] New donation — {donorDisplayName}"
            : $"[Kateri] In-kind goods — {donorDisplayName}";
        var body = BuildDonationHtml(
            donorDisplayName,
            donorEmail,
            donorPhone,
            amount,
            currency,
            donationType,
            campaignName,
            donationDateUtc,
            inKindItemDetails);
        return SendInternalAsync(subject, body, cancellationToken);
    }

    public Task SendVolunteerInterestNotificationAsync(
        string volunteerName,
        string volunteerEmail,
        string? volunteerPhone,
        bool flexibleOnDays,
        IReadOnlyList<string> days,
        IReadOnlyList<string> timesOfDay,
        IReadOnlyList<string> focusAreas,
        string? notes,
        CancellationToken cancellationToken = default)
    {
        var subject = $"[Kateri] Volunteer interest — {volunteerName}";
        var body = BuildVolunteerHtml(
            volunteerName,
            volunteerEmail,
            volunteerPhone,
            flexibleOnDays,
            days,
            timesOfDay,
            focusAreas,
            notes);
        return SendInternalAsync(subject, body, cancellationToken);
    }

    public Task SendDonationReceiptAsync(
        string donorDisplayName,
        string donorEmail,
        decimal amount,
        string currency,
        string donationType,
        string campaignName,
        DateTime donationDateUtc,
        string? inKindItemDetails = null,
        CancellationToken cancellationToken = default)
    {
        if (!ShouldSendUserEmail(donorEmail))
            return Task.CompletedTask;

        var subject = string.IsNullOrWhiteSpace(inKindItemDetails)
            ? $"[Kateri] Thank you for your donation, {donorDisplayName}"
            : $"[Kateri] Thank you for your in-kind donation, {donorDisplayName}";
        var body = BuildDonationReceiptHtml(
            donorDisplayName,
            amount,
            currency,
            donationType,
            campaignName,
            donationDateUtc,
            inKindItemDetails);
        return SendToRecipientAsync(donorEmail.Trim(), subject, body, "donor receipt", cancellationToken);
    }

    public Task SendVolunteerConfirmationAsync(
        string volunteerName,
        string volunteerEmail,
        bool flexibleOnDays,
        IReadOnlyList<string> days,
        IReadOnlyList<string> timesOfDay,
        IReadOnlyList<string> focusAreas,
        string? notes,
        CancellationToken cancellationToken = default)
    {
        if (!ShouldSendUserEmail(volunteerEmail))
            return Task.CompletedTask;

        var subject = $"[Kateri] Thank you for volunteering, {volunteerName}";
        var body = BuildVolunteerConfirmationHtml(
            volunteerName,
            flexibleOnDays,
            days,
            timesOfDay,
            focusAreas,
            notes);
        return SendToRecipientAsync(volunteerEmail.Trim(), subject, body, "volunteer confirmation", cancellationToken);
    }

    public async Task<bool> SendThankYouEmailAsync(
        string donorEmail,
        string donorName,
        string subject,
        string plainTextBody,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(donorEmail))
        {
            logger.LogWarning("SendThankYouEmailAsync called with empty donor email for {DonorName}", donorName);
            return false;
        }

        var host = configuration["NotificationEmail:SmtpHost"]?.Trim();
        var from = configuration["NotificationEmail:FromAddress"]?.Trim();
        if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(from))
        {
            logger.LogWarning(
                "SendThankYouEmailAsync aborted — SMTP not configured (host={Host}, from={From})",
                host, from);
            return false;
        }

        // Wrap the plain-text body in a simple HTML template. We preserve the
        // author's line breaks so the paragraphs render correctly in Gmail/
        // Outlook, and strip anything that looks like raw HTML from the model
        // (Claude is prompted not to include any, but belt + suspenders).
        var htmlBody = BuildThankYouHtml(donorName, plainTextBody);

        await SendToRecipientAsync(
            donorEmail.Trim(),
            subject,
            htmlBody,
            "thank-you email",
            cancellationToken,
            throwOnError: true);

        return true;
    }

    private static string BuildThankYouHtml(string donorName, string plainTextBody)
    {
        // Escape any stray HTML characters from Claude's output before we drop
        // it into our own template. Then convert \n into <br> and paragraph
        // breaks into <p> blocks so Gmail renders it as intended.
        var escaped = System.Net.WebUtility.HtmlEncode(plainTextBody);
        var paragraphs = escaped
            .Replace("\r\n", "\n")
            .Split("\n\n", StringSplitOptions.RemoveEmptyEntries)
            .Select(para => "<p style=\"margin: 0 0 1rem; color: #1e2c3a; line-height: 1.6; font-size: 15px;\">"
                + para.Replace("\n", "<br>")
                + "</p>");

        var bodyHtml = string.Join("\n", paragraphs);

        var sb = new StringBuilder();
        sb.AppendLine("<!doctype html>");
        sb.AppendLine("<html><head><meta charset=\"utf-8\"><title>Thank you</title></head>");
        sb.AppendLine("<body style=\"margin:0; padding:0; background:#fdf8ec; font-family: Georgia, 'Times New Roman', serif;\">");
        sb.AppendLine("<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"background:#fdf8ec;\">");
        sb.AppendLine("<tr><td align=\"center\" style=\"padding: 2rem 1rem;\">");
        sb.AppendLine("<table role=\"presentation\" width=\"600\" cellspacing=\"0\" cellpadding=\"0\" style=\"max-width:600px; background:#ffffff; border-radius:12px; box-shadow:0 4px 20px rgba(56,95,130,0.08); overflow:hidden;\">");
        sb.AppendLine("<tr><td style=\"padding: 2rem 2.5rem 1rem; border-bottom: 3px solid #385f82;\">");
        sb.AppendLine("<h1 style=\"margin:0; font-family: Georgia, serif; color:#385f82; font-size:1.8rem; font-weight:700;\">Kateri</h1>");
        sb.AppendLine("<p style=\"margin:0.3rem 0 0; color: #a05b3a; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.1em; font-family: Arial, sans-serif;\">A message of gratitude</p>");
        sb.AppendLine("</td></tr>");
        sb.AppendLine("<tr><td style=\"padding: 2rem 2.5rem;\">");
        sb.Append(bodyHtml);
        sb.AppendLine("</td></tr>");
        sb.AppendLine("<tr><td style=\"padding: 1rem 2.5rem 1.5rem; border-top: 1px solid rgba(56,95,130,0.15); background:#fdfbf5;\">");
        sb.AppendLine("<p style=\"margin:0; font-size:0.8rem; color: rgba(30,44,58,0.6); font-family: Arial, sans-serif;\">");
        sb.AppendLine("Kateri · Protecting Native American women and girls from sexual abuse and trafficking<br>");
        sb.AppendLine("kateri.byuisresearch.com");
        sb.AppendLine("</p>");
        sb.AppendLine("</td></tr>");
        sb.AppendLine("</table></td></tr></table></body></html>");
        return sb.ToString();
    }

    private async Task SendInternalAsync(string subject, string htmlBody, CancellationToken cancellationToken)
    {
        var to = configuration["NotificationEmail:StaffNotifyTo"]?.Trim();
        if (string.IsNullOrWhiteSpace(to))
            to = DefaultStaffTo;

        await SendToRecipientAsync(to, subject, htmlBody, "staff notification", cancellationToken);
    }

    private Task SendToRecipientAsync(
        string to,
        string subject,
        string htmlBody,
        string emailType,
        CancellationToken cancellationToken)
        => SendToRecipientAsync(to, subject, htmlBody, emailType, cancellationToken, throwOnError: false);

    private async Task SendToRecipientAsync(
        string to,
        string subject,
        string htmlBody,
        string emailType,
        CancellationToken cancellationToken,
        bool throwOnError)
    {
        if (string.IsNullOrWhiteSpace(to))
            return;

        var from = configuration["NotificationEmail:FromAddress"]?.Trim();
        var host = configuration["NotificationEmail:SmtpHost"]?.Trim();
        var user = configuration["NotificationEmail:SmtpUser"]?.Trim();
        var password = configuration["NotificationEmail:SmtpPassword"]?.Trim();

        var missingHost = string.IsNullOrWhiteSpace(host);
        var missingFrom = string.IsNullOrWhiteSpace(from);
        if (missingHost || missingFrom)
        {
            logger.LogWarning(
                "{EmailType} email skipped due to missing config. MissingHost: {MissingHost}, MissingFromAddress: {MissingFrom}. Expected env vars: NotificationEmail__SmtpHost and NotificationEmail__FromAddress. Subject: {Subject}, To: {To}",
                emailType,
                missingHost,
                missingFrom,
                subject,
                to);
            return;
        }

        if (!int.TryParse(configuration["NotificationEmail:SmtpPort"], out var port))
            port = 587;

        var useSsl = configuration.GetValue("NotificationEmail:UseSsl", true);

        try
        {
            // Use address only for From — a mismatched display name (e.g. "Kateri…" vs @gmail.com)
            // triggers "sender may be spoofing" / caution banners in Gmail and Outlook.
            using var message = new MailMessage
            {
                From = new MailAddress(from!),
                Subject = subject,
                Body = htmlBody,
                IsBodyHtml = true,
                BodyEncoding = Encoding.UTF8,
                SubjectEncoding = Encoding.UTF8,
            };
            message.To.Add(new MailAddress(to));

            using var client = new SmtpClient(host, port)
            {
                EnableSsl = useSsl,
                DeliveryMethod = SmtpDeliveryMethod.Network,
            };

            if (!string.IsNullOrWhiteSpace(user) && password != null)
                client.Credentials = new NetworkCredential(user, password);
            else
                client.Credentials = CredentialCache.DefaultNetworkCredentials;

            await client.SendMailAsync(message, cancellationToken);
            logger.LogInformation("{EmailType} email sent to {To}. Subject: {Subject}", emailType, to, subject);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to send {EmailType} email to {To}. Subject: {Subject}", emailType, to, subject);
            if (throwOnError) throw;
        }
    }

    private static string BuildDonationHtml(
        string donorDisplayName,
        string donorEmail,
        string? donorPhone,
        decimal amount,
        string currency,
        string donationType,
        string campaignName,
        DateTime donationDateUtc,
        string? inKindItemDetails)
    {
        var phoneRow = string.IsNullOrWhiteSpace(donorPhone)
            ? ""
            : Row("Phone", WebUtility.HtmlEncode(donorPhone));

        var inKindBlock = string.IsNullOrWhiteSpace(inKindItemDetails)
            ? ""
            : $@"<tr><td colspan=""2"" style=""padding:12px 0 8px; border-bottom:1px solid #f1f5f9;""><strong style=""color:#0f172a;"">Goods details</strong></td></tr>
        <tr><td colspan=""2"" style=""padding:0 0 12px; color:#334155; font-size:14px; white-space:pre-wrap; border-bottom:1px solid #f1f5f9;"">{WebUtility.HtmlEncode(inKindItemDetails)}</td></tr>";

        return $@"
<!DOCTYPE html>
<html><head><meta charset=""utf-8""></head>
<body style=""font-family:Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:#f4f6f8; margin:0; padding:24px;"">
  <table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""max-width:560px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e2e8f0;"">
    <tr><td style=""background:#0b5c97; color:#fff; padding:20px 24px;"">
      <h1 style=""margin:0; font-size:20px; font-weight:600;"">New donation received</h1>
      <p style=""margin:8px 0 0; opacity:0.95; font-size:14px;"">Kateri — Donor Portal</p>
    </td></tr>
    <tr><td style=""padding:24px; color:#1e293b; font-size:15px; line-height:1.5;"">
      <p style=""margin:0 0 16px;"">A supporter has submitted a donation through the portal.</p>
      <table role=""presentation"" cellpadding=""0"" cellspacing=""0"" width=""100%"" style=""border-collapse:collapse;"">
        {Row("Donor name", WebUtility.HtmlEncode(donorDisplayName))}
        {Row("Email", WebUtility.HtmlEncode(donorEmail))}
        {phoneRow}
        {Row("Amount", WebUtility.HtmlEncode($"{amount:N2} {currency}"))}
        {Row("Type", WebUtility.HtmlEncode(donationType))}
        {Row("Campaign", WebUtility.HtmlEncode(campaignName))}
        {Row("Submitted (UTC)", WebUtility.HtmlEncode(donationDateUtc.ToString("yyyy-MM-dd HH:mm") + " UTC"))}
        {inKindBlock}
      </table>
      <p style=""margin:24px 0 0; font-size:13px; color:#64748b;"">This message was generated automatically from the Kateri web application.</p>
    </td></tr>
  </table>
</body></html>";
    }

    private static string BuildVolunteerHtml(
        string volunteerName,
        string volunteerEmail,
        string? volunteerPhone,
        bool flexibleOnDays,
        IReadOnlyList<string> days,
        IReadOnlyList<string> timesOfDay,
        IReadOnlyList<string> focusAreas,
        string? notes)
    {
        var phoneRow = string.IsNullOrWhiteSpace(volunteerPhone)
            ? ""
            : Row("Phone", WebUtility.HtmlEncode(volunteerPhone));

        var daySummary = flexibleOnDays
            ? "Flexible on which days"
            : (days.Count > 0 ? string.Join(", ", days) : "—");

        var timeSummary = timesOfDay.Count > 0 ? string.Join(", ", timesOfDay) : "—";
        var focusSummary = focusAreas.Count > 0 ? string.Join(", ", focusAreas) : "—";
        var notesBlock = string.IsNullOrWhiteSpace(notes)
            ? ""
            : $@"<p style=""margin:20px 0 0; padding:16px; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0;""><strong>Additional notes</strong><br/><span style=""white-space:pre-wrap; font-size:14px;"">{WebUtility.HtmlEncode(notes)}</span></p>";

        return $@"
<!DOCTYPE html>
<html><head><meta charset=""utf-8""></head>
<body style=""font-family:Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:#f4f6f8; margin:0; padding:24px;"">
  <table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""max-width:560px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e2e8f0;"">
    <tr><td style=""background:#0b5c97; color:#fff; padding:20px 24px;"">
      <h1 style=""margin:0; font-size:20px; font-weight:600;"">New volunteer interest</h1>
      <p style=""margin:8px 0 0; opacity:0.95; font-size:14px;"">Kateri — Donor Portal</p>
    </td></tr>
    <tr><td style=""padding:24px; color:#1e293b; font-size:15px; line-height:1.5;"">
      <p style=""margin:0 0 16px;"">Someone signed up to volunteer through the portal.</p>
      <table role=""presentation"" cellpadding=""0"" cellspacing=""0"" width=""100%"" style=""border-collapse:collapse;"">
        {Row("Volunteer name", WebUtility.HtmlEncode(volunteerName))}
        {Row("Email", WebUtility.HtmlEncode(volunteerEmail))}
        {phoneRow}
        {Row("Availability — days", WebUtility.HtmlEncode(daySummary))}
        {Row("Time of day", WebUtility.HtmlEncode(timeSummary))}
        {Row("Areas of interest", WebUtility.HtmlEncode(focusSummary))}
      </table>
      {notesBlock}
      <p style=""margin:24px 0 0; font-size:13px; color:#64748b;"">This message was generated automatically from the Kateri web application.</p>
    </td></tr>
  </table>
</body></html>";
    }

    private string BuildDonationReceiptHtml(
        string donorDisplayName,
        decimal amount,
        string currency,
        string donationType,
        string campaignName,
        DateTime donationDateUtc,
        string? inKindItemDetails)
    {
        var portalUrl = configuration["NotificationEmail:PortalUrl"]?.Trim();
        var portalLink = string.IsNullOrWhiteSpace(portalUrl)
            ? ""
            : $@"<p style=""margin:16px 0 0;""><a href=""{WebUtility.HtmlEncode(portalUrl)}"" style=""color:#0b5c97; text-decoration:none; font-weight:600;"">View your donor dashboard</a></p>";

        var detailsBlock = string.IsNullOrWhiteSpace(inKindItemDetails)
            ? ""
            : $@"<p style=""margin:16px 0 0; padding:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; white-space:pre-wrap;""><strong>Item details</strong><br/>{WebUtility.HtmlEncode(inKindItemDetails)}</p>";

        return $@"
<!DOCTYPE html>
<html><head><meta charset=""utf-8""></head>
<body style=""font-family:Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:#f4f6f8; margin:0; padding:24px;"">
  <table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""max-width:560px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e2e8f0;"">
    <tr><td style=""background:#0b5c97; color:#fff; padding:20px 24px;"">
      <h1 style=""margin:0; font-size:20px; font-weight:600;"">Thank you for your donation</h1>
      <p style=""margin:8px 0 0; opacity:0.95; font-size:14px;"">Kateri</p>
    </td></tr>
    <tr><td style=""padding:24px; color:#1e293b; font-size:15px; line-height:1.5;"">
      <p style=""margin:0 0 16px;"">Hi {WebUtility.HtmlEncode(donorDisplayName)}, we received your donation and appreciate your support.</p>
      <table role=""presentation"" cellpadding=""0"" cellspacing=""0"" width=""100%"" style=""border-collapse:collapse;"">
        {Row("Amount", WebUtility.HtmlEncode($"{amount:N2} {currency}"))}
        {Row("Type", WebUtility.HtmlEncode(donationType))}
        {Row("Campaign", WebUtility.HtmlEncode(campaignName))}
        {Row("Received (UTC)", WebUtility.HtmlEncode(donationDateUtc.ToString("yyyy-MM-dd HH:mm") + " UTC"))}
      </table>
      {detailsBlock}
      {portalLink}
      <p style=""margin:24px 0 0; font-size:13px; color:#64748b;"">If you have any questions, reply to this email.</p>
    </td></tr>
  </table>
</body></html>";
    }

    private string BuildVolunteerConfirmationHtml(
        string volunteerName,
        bool flexibleOnDays,
        IReadOnlyList<string> days,
        IReadOnlyList<string> timesOfDay,
        IReadOnlyList<string> focusAreas,
        string? notes)
    {
        var daySummary = flexibleOnDays
            ? "Flexible on which days"
            : (days.Count > 0 ? string.Join(", ", days) : "—");
        var timeSummary = timesOfDay.Count > 0 ? string.Join(", ", timesOfDay) : "—";
        var focusSummary = focusAreas.Count > 0 ? string.Join(", ", focusAreas) : "—";
        var notesBlock = string.IsNullOrWhiteSpace(notes)
            ? ""
            : $@"<p style=""margin:20px 0 0; padding:16px; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0;""><strong>Your notes</strong><br/><span style=""white-space:pre-wrap; font-size:14px;"">{WebUtility.HtmlEncode(notes)}</span></p>";

        var portalUrl = configuration["NotificationEmail:PortalUrl"]?.Trim();
        var portalLink = string.IsNullOrWhiteSpace(portalUrl)
            ? ""
            : $@"<p style=""margin:16px 0 0;""><a href=""{WebUtility.HtmlEncode(portalUrl)}"" style=""color:#0b5c97; text-decoration:none; font-weight:600;"">Return to the donor portal</a></p>";

        return $@"
<!DOCTYPE html>
<html><head><meta charset=""utf-8""></head>
<body style=""font-family:Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:#f4f6f8; margin:0; padding:24px;"">
  <table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""max-width:560px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e2e8f0;"">
    <tr><td style=""background:#0b5c97; color:#fff; padding:20px 24px;"">
      <h1 style=""margin:0; font-size:20px; font-weight:600;"">Thank you for volunteering</h1>
      <p style=""margin:8px 0 0; opacity:0.95; font-size:14px;"">Kateri</p>
    </td></tr>
    <tr><td style=""padding:24px; color:#1e293b; font-size:15px; line-height:1.5;"">
      <p style=""margin:0 0 16px;"">Hi {WebUtility.HtmlEncode(volunteerName)}, we received your volunteer interest form. A team member will follow up soon.</p>
      <table role=""presentation"" cellpadding=""0"" cellspacing=""0"" width=""100%"" style=""border-collapse:collapse;"">
        {Row("Availability — days", WebUtility.HtmlEncode(daySummary))}
        {Row("Time of day", WebUtility.HtmlEncode(timeSummary))}
        {Row("Areas of interest", WebUtility.HtmlEncode(focusSummary))}
      </table>
      {notesBlock}
      {portalLink}
      <p style=""margin:24px 0 0; font-size:13px; color:#64748b;"">You can reply to this email if your availability changes.</p>
    </td></tr>
  </table>
</body></html>";
    }

    private bool ShouldSendUserEmail(string recipient)
    {
        if (string.IsNullOrWhiteSpace(recipient))
        {
            logger.LogWarning("User-facing email skipped because recipient email was empty.");
            return false;
        }

        var enabled = configuration.GetValue("NotificationEmail:EnableUserEmails", true);
        if (!enabled)
            logger.LogInformation("User-facing email disabled by NotificationEmail:EnableUserEmails.");
        return enabled;
    }

    private static string Row(string label, string valueHtml) =>
        $@"<tr>
            <td style=""padding:8px 12px 8px 0; color:#64748b; width:40%; vertical-align:top; border-bottom:1px solid #f1f5f9;""><strong>{WebUtility.HtmlEncode(label)}</strong></td>
            <td style=""padding:8px 0; color:#0f172a; vertical-align:top; border-bottom:1px solid #f1f5f9;"">{valueHtml}</td>
          </tr>";
}
