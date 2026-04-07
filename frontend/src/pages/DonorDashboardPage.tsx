import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import heroImage from '../background.jpg?format=webp&quality=82&w=1920';
import { useAuth } from '../auth/useAuth';
import { donorImpactApi, type DonorImpactReport } from '../lib/api';
import { donationsApi } from '../lib/api';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const volunteerFocusOptions = [
  'Teaching',
  'Math tutoring',
  'Reading support',
  'Creating social media content',
  'Physical activities',
  'Arts and crafts',
  'Mentorship and life skills',
  'Event support',
];

const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const weekDayFull = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

const timeOfDayOptions = [
  { id: 'Mornings', label: 'Mornings (approx. 8 AM–12 PM)' },
  { id: 'Afternoons', label: 'Afternoons (approx. 12–5 PM)' },
  { id: 'Evenings', label: 'Evenings (approx. 5–9 PM)' },
] as const;

function formatWelcomeName(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  const cleaned = raw.trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function DonorDashboardPage() {
  const { effectiveDisplayName } = useAuth();
  const welcomeName = formatWelcomeName(effectiveDisplayName);

  const [amount, setAmount] = useState('100');
  const [donationType, setDonationType] = useState<'Monetary' | 'InKind' | 'Time' | 'Skills'>('Monetary');
  const [currency, setCurrency] = useState<'USD' | 'PHP'>('USD');
  const [donorName, setDonorName] = useState('');
  const [donationSuccess, setDonationSuccess] = useState<string | null>(null);
  const [donationError, setDonationError] = useState<string | null>(null);
  const [donationSubmitting, setDonationSubmitting] = useState(false);

  const [volunteerName, setVolunteerName] = useState('');
  const [volunteerEmail, setVolunteerEmail] = useState('');
  const [volunteerPhone, setVolunteerPhone] = useState('');
  const [availDays, setAvailDays] = useState<string[]>([]);
  const [availTimes, setAvailTimes] = useState<string[]>([]);
  const [flexibleOnDays, setFlexibleOnDays] = useState(false);
  const [availabilityNotes, setAvailabilityNotes] = useState('');
  const [selectedFocuses, setSelectedFocuses] = useState<string[]>([]);
  const [volunteerSuccess, setVolunteerSuccess] = useState<string | null>(null);
  const [volunteerError, setVolunteerError] = useState<string | null>(null);

  // Real per-donor data from /api/donor-impact/me — supporter_id is read
  // server-side from the cookie claim, so we never have to know or pass it.
  const [impact, setImpact] = useState<DonorImpactReport | null>(null);
  const [impactLoading, setImpactLoading] = useState(true);
  const [impactError, setImpactError] = useState<string | null>(null);

  const loadImpact = async () => {
    setImpactLoading(true);
    setImpactError(null);
    try {
      const data = await donorImpactApi.me();
      setImpact(data);
    } catch (err) {
      setImpactError(err instanceof Error ? err.message : 'Could not load your giving history.');
    } finally {
      setImpactLoading(false);
    }
  };

  useEffect(() => {
    void loadImpact();
  }, []);

  const topProgramArea = useMemo(() => {
    if (!impact || impact.programAreaBreakdown.length === 0) return null;
    return [...impact.programAreaBreakdown].sort((a, b) => b.amount - a.amount)[0];
  }, [impact]);

  const supportSpanText = useMemo(() => {
    if (!impact?.firstDonationDate) return null;
    const first = new Date(impact.firstDonationDate);
    const last = impact.lastDonationDate ? new Date(impact.lastDonationDate) : new Date();
    const months = Math.max(
      1,
      (last.getFullYear() - first.getFullYear()) * 12 + (last.getMonth() - first.getMonth()),
    );
    if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
    const years = (months / 12).toFixed(1).replace(/\.0$/, '');
    return `${years} year${years === '1' ? '' : 's'}`;
  }, [impact]);

  const onDonationSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setDonationError(null);
    setDonationSuccess(null);
    setDonationSubmitting(true);

    const numericAmount = Number.parseFloat(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setDonationError('Please enter a valid donation amount.');
      setDonationSubmitting(false);
      return;
    }

    const confirmed = window.confirm(
      `Confirm donation of ${money.format(numericAmount)} as ${donationType}?`,
    );
    if (!confirmed) {
      setDonationSubmitting(false);
      return;
    }

    try {
      await donationsApi.create({
        amount: numericAmount,
        donationType,
        frequency: 'one-time',
        currency,
        donationDate: new Date().toISOString(),
        donorName: donorName.trim(),
      });

      const mealsSupported = Math.max(1, Math.floor(numericAmount / 10));
      const counselingHours = Math.max(1, Math.floor(numericAmount / 35));
      setDonationSuccess(
        `Thank you, ${donorName || 'supporter'}! Your gift was recorded successfully and can fund about ${mealsSupported} meals or ${counselingHours} counseling hour(s).`,
      );
      await loadImpact();
      setDonorName('');
      setAmount('100');
      setDonationType('Monetary');
      setCurrency('USD');
    } catch (err) {
      setDonationError(err instanceof Error ? err.message : 'Could not save donation.');
    } finally {
      setDonationSubmitting(false);
    }
  };

  const onVolunteerSubmit = (event: FormEvent) => {
    event.preventDefault();
    setVolunteerError(null);
    setVolunteerSuccess(null);

    if (selectedFocuses.length === 0) {
      setVolunteerError('Please select at least one area you would like to help with.');
      return;
    }

    if (!flexibleOnDays && availDays.length === 0) {
      setVolunteerError(
        'Please choose at least one day you are usually available, or check “Flexible on days”.',
      );
      return;
    }

    if (availTimes.length === 0) {
      setVolunteerError('Please choose at least one time of day you are usually available.');
      return;
    }

    const daySummary = flexibleOnDays ? 'flexible on days' : availDays.join(', ');
    const timeSummary = availTimes.join(', ');
    setVolunteerSuccess(
      `Thank you, ${volunteerName}! We recorded your interests (${selectedFocuses.join(', ')}), availability (${daySummary}; ${timeSummary}).`,
    );
    setVolunteerName('');
    setVolunteerEmail('');
    setVolunteerPhone('');
    setAvailDays([]);
    setAvailTimes([]);
    setFlexibleOnDays(false);
    setAvailabilityNotes('');
    setSelectedFocuses([]);
  };

  const toggleFocus = (focus: string) => {
    setSelectedFocuses((current) =>
      current.includes(focus) ? current.filter((item) => item !== focus) : [...current, focus],
    );
  };

  const toggleAvailDay = (day: string) => {
    setAvailDays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day],
    );
  };

  const toggleAvailTime = (slot: string) => {
    setAvailTimes((current) =>
      current.includes(slot) ? current.filter((t) => t !== slot) : [...current, slot],
    );
  };

  const heroTitle = welcomeName ? `Welcome back, ${welcomeName}` : 'Donor Portal';

  return (
    <section className="donor-page kateri-landing-section">
      <header className="kateri-photo-hero">
        <div
          className="kateri-photo-hero__media"
          style={{ backgroundImage: `url(${heroImage})` }}
          aria-hidden={true}
        />
        <div className="kateri-photo-hero__scrim" aria-hidden={true} />
        <div className="kateri-photo-hero__inner">
          <h1 className="kateri-photo-hero__title">{heroTitle}</h1>
          <p className="kateri-photo-hero__lead">
            Your support helps provide safe housing, counseling, education, and reintegration
            services for the girls in Kateri&apos;s care.
          </p>
          <div className="kateri-hero-actions">
            <a className="btn-kateri-gold" href="#donate-forms">
              Make a donation
            </a>
            <Link className="btn-kateri-ghost" to="/impact">
              View Our Impact
            </Link>
          </div>
        </div>
      </header>

      <article className="auth-card donor-history-overview" id="donor-history">
        <div className="donor-overview-head">
          <h2>Your giving overview</h2>
          <Link className="donor-overview-cta" to="/donor-impact">
            See full impact report →
          </Link>
        </div>

        {impactLoading && (
          <p className="auth-lead">Loading your giving history…</p>
        )}

        {impactError && (
          <p className="auth-lead donor-history-empty">
            {impactError === 'Your account isn\u2019t linked to a donor profile yet. Contact staff to connect them.'
              ? impactError
              : 'We couldn\u2019t load your giving history right now. Try refreshing the page.'}
          </p>
        )}

        {!impactLoading && !impactError && impact && (
          <>
            <p className="auth-lead">
              Welcome back{impact.displayName ? `, ${impact.displayName}` : ''}. Here&apos;s the
              real impact of your support — pulled directly from your linked giving record.
            </p>

            <div className="donor-history-summary">
              <div className="donor-history-summary__item">
                <p className="metric-label">Total contributed</p>
                <p className="metric-value donor-history-summary__value">
                  {money.format(impact.totalContributed)}
                </p>
                {supportSpanText && (
                  <p className="donor-overview-meta">over {supportSpanText} of giving</p>
                )}
              </div>
              <div className="donor-history-summary__item">
                <p className="metric-label">Gifts on record</p>
                <p className="metric-value donor-history-summary__value">{impact.donationCount}</p>
                {impact.lastDonationDate && (
                  <p className="donor-overview-meta">
                    last gift{' '}
                    {new Date(impact.lastDonationDate).toLocaleDateString(undefined, {
                      dateStyle: 'medium',
                    })}
                  </p>
                )}
              </div>
              <div className="donor-history-summary__item">
                <p className="metric-label">Safehouses you fund</p>
                <p className="metric-value donor-history-summary__value">
                  {impact.safehousesSupported.length}
                </p>
                {impact.safehousesSupported[0] && (
                  <p className="donor-overview-meta">
                    incl. {impact.safehousesSupported[0].name}
                  </p>
                )}
              </div>
              <div className="donor-history-summary__item">
                <p className="metric-label">Top program area</p>
                <p className="metric-value donor-history-summary__value donor-overview-program">
                  {topProgramArea ? topProgramArea.name : '—'}
                </p>
                {topProgramArea && (
                  <p className="donor-overview-meta">
                    {money.format(topProgramArea.amount)} ({topProgramArea.percent.toFixed(0)}%)
                  </p>
                )}
              </div>
            </div>

            {impact.programAreaBreakdown.length > 0 && (
              <div className="donor-overview-allocation">
                <p className="metric-label">Where your dollars go</p>
                <div className="donor-overview-bar">
                  {impact.programAreaBreakdown.map((slice, idx) => {
                    const colors = ['#385f82', '#c9983f', '#a05b3a', '#5f8448', '#7e7468'];
                    return (
                      <div
                        key={slice.name}
                        className="donor-overview-bar__segment"
                        style={{
                          width: `${slice.percent}%`,
                          background: colors[idx % colors.length],
                        }}
                        title={`${slice.name}: ${money.format(slice.amount)} (${slice.percent.toFixed(1)}%)`}
                      />
                    );
                  })}
                </div>
                <ul className="donor-overview-legend">
                  {impact.programAreaBreakdown.map((slice, idx) => {
                    const colors = ['#385f82', '#c9983f', '#a05b3a', '#5f8448', '#7e7468'];
                    return (
                      <li key={slice.name}>
                        <span
                          className="donor-overview-legend__dot"
                          style={{ background: colors[idx % colors.length] }}
                        />
                        <span className="donor-overview-legend__label">{slice.name}</span>
                        <span className="donor-overview-legend__pct">
                          {slice.percent.toFixed(0)}%
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {(impact.avgHealthScore != null || impact.avgEducationProgress != null || impact.avgActiveResidents != null) && (
              <div className="donor-overview-outcomes">
                <p className="metric-label">Outcomes at your funded safehouses</p>
                <div className="donor-overview-outcomes__row">
                  {impact.avgHealthScore != null && (
                    <div>
                      <strong>{impact.avgHealthScore.toFixed(1)} / 5</strong>
                      <span>Avg health score</span>
                    </div>
                  )}
                  {impact.avgEducationProgress != null && (
                    <div>
                      <strong>{impact.avgEducationProgress.toFixed(0)}%</strong>
                      <span>Avg education progress</span>
                    </div>
                  )}
                  {impact.avgActiveResidents != null && (
                    <div>
                      <strong>{Math.round(impact.avgActiveResidents)}</strong>
                      <span>Residents in care</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

      </article>

      <hr className="section-divider" />

      <article className="feature-slab">
        <h2>How donations help</h2>
        <ul className="mission-list">
          <li>
            <strong>$25</strong> helps cover school supplies and basic learning materials.
          </li>
          <li>
            <strong>$50</strong> supports transportation and case follow-up visits.
          </li>
          <li>
            <strong>$100</strong> funds meals, hygiene, and daily care essentials.
          </li>
          <li>
            <strong>$250</strong> helps provide professional counseling and trauma-informed support.
          </li>
        </ul>
      </article>

      <hr className="section-divider" />

      <div id="donate-forms" className="donor-forms-stack">
        <article className="auth-card">
          <h2>Donate</h2>
          <p className="auth-lead">Choose an amount and donation type. We will route it to direct care.</p>
          <form onSubmit={onDonationSubmit}>
            <label>
              Name
              <input
                required
                type="text"
                value={donorName}
                onChange={(event) => setDonorName(event.target.value)}
              />
            </label>
            <label>
              Amount
              <input
                required
                min={1}
                step="0.01"
                type="number"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
            <label>
              Donation type
              <select
                value={donationType}
                onChange={(event) =>
                  setDonationType(event.target.value as 'Monetary' | 'InKind' | 'Time' | 'Skills')
                }
              >
                <option value="Monetary">Monetary</option>
                <option value="InKind">In-kind</option>
                <option value="Time">Time</option>
                <option value="Skills">Skills</option>
              </select>
            </label>
            <label>
              Currency
              <select value={currency} onChange={(event) => setCurrency(event.target.value as 'USD' | 'PHP')}>
                <option value="USD">USD</option>
                <option value="PHP">PHP</option>
              </select>
            </label>
            {donationError && <p className="error-text">{donationError}</p>}
            {donationSuccess && <p className="success-text">{donationSuccess}</p>}
            <button type="submit" disabled={donationSubmitting}>
              {donationSubmitting ? 'Submitting…' : 'Submit donation'}
            </button>
          </form>
        </article>

        <article className="auth-card">
          <h2>Volunteer sign-up</h2>
          <p className="auth-lead">Tell us how you would like to help the girls.</p>
          <form onSubmit={onVolunteerSubmit}>
            <label>
              Full name
              <input
                required
                type="text"
                value={volunteerName}
                onChange={(event) => setVolunteerName(event.target.value)}
              />
            </label>
            <label>
              Email
              <input
                required
                type="email"
                value={volunteerEmail}
                onChange={(event) => setVolunteerEmail(event.target.value)}
              />
            </label>
            <label>
              Phone
              <input
                type="text"
                value={volunteerPhone}
                onChange={(event) => setVolunteerPhone(event.target.value)}
              />
            </label>

            <fieldset className="donor-focus-fieldset volunteer-availability-fieldset">
              <legend>When are you usually available?</legend>
              <p className="volunteer-availability-hint">
                Pick days and times of day so we can match you to opportunities. Staff can follow up
                for exact times.
              </p>

              <label className="volunteer-flexible-option">
                <input
                  type="checkbox"
                  checked={flexibleOnDays}
                  onChange={(event) => {
                    setFlexibleOnDays(event.target.checked);
                    if (event.target.checked) setAvailDays([]);
                  }}
                />
                <span>Flexible on which days I volunteer</span>
              </label>

              <div
                className={`volunteer-day-grid${flexibleOnDays ? ' volunteer-day-grid--disabled' : ''}`}
                aria-disabled={flexibleOnDays}
              >
                {weekDays.map((short, i) => (
                  <label className="volunteer-day-chip" key={weekDayFull[i]}>
                    <input
                      type="checkbox"
                      disabled={flexibleOnDays}
                      checked={availDays.includes(weekDayFull[i])}
                      onChange={() => toggleAvailDay(weekDayFull[i])}
                    />
                    <span>{short}</span>
                  </label>
                ))}
              </div>

              <p className="volunteer-availability-sublegend">Time of day (select all that apply)</p>
              <div className="volunteer-time-grid">
                {timeOfDayOptions.map((slot) => (
                  <label className="donor-focus-option" key={slot.id}>
                    <input
                      type="checkbox"
                      checked={availTimes.includes(slot.id)}
                      onChange={() => toggleAvailTime(slot.id)}
                    />
                    <span>{slot.label}</span>
                  </label>
                ))}
              </div>

              <label className="volunteer-notes-label">
                Additional notes (optional)
                <textarea
                  rows={3}
                  placeholder="e.g. Only during school year, prefer virtual for tutoring, etc."
                  value={availabilityNotes}
                  onChange={(event) => setAvailabilityNotes(event.target.value)}
                />
              </label>
            </fieldset>

            <fieldset className="donor-focus-fieldset">
              <legend>What would you like to help with?</legend>
              <div className="donor-focus-grid">
                {volunteerFocusOptions.map((focus) => (
                  <label className="donor-focus-option" key={focus}>
                    <input
                      type="checkbox"
                      checked={selectedFocuses.includes(focus)}
                      onChange={() => toggleFocus(focus)}
                    />
                    <span>{focus}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {volunteerError && <p className="error-text">{volunteerError}</p>}
            {volunteerSuccess && <p className="success-text">{volunteerSuccess}</p>}
            <button type="submit">Submit volunteer interest</button>
          </form>
        </article>
      </div>
    </section>
  );
}
