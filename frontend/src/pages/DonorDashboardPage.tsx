import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import heroImage from '../background.jpg?format=webp&quality=82&w=1920';
import { useAuth } from '../auth/useAuth';

const DONOR_GIFTS_STORAGE_KEY = 'kateri-donor-gifts-v1';

type DonorGiftRecord = {
  id: string;
  at: string;
  amount: number;
  frequency: 'one-time' | 'monthly';
};

function loadStoredGifts(): DonorGiftRecord[] {
  try {
    const raw = localStorage.getItem(DONOR_GIFTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is DonorGiftRecord =>
        typeof row === 'object' &&
        row !== null &&
        typeof (row as DonorGiftRecord).id === 'string' &&
        typeof (row as DonorGiftRecord).at === 'string' &&
        typeof (row as DonorGiftRecord).amount === 'number' &&
        ((row as DonorGiftRecord).frequency === 'one-time' ||
          (row as DonorGiftRecord).frequency === 'monthly'),
    );
  } catch {
    return [];
  }
}

function saveStoredGifts(gifts: DonorGiftRecord[]) {
  localStorage.setItem(DONOR_GIFTS_STORAGE_KEY, JSON.stringify(gifts));
}

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
  const [frequency, setFrequency] = useState<'one-time' | 'monthly'>('monthly');
  const [donorName, setDonorName] = useState('');
  const [donorEmail, setDonorEmail] = useState('');
  const [donationSuccess, setDonationSuccess] = useState<string | null>(null);
  const [donationError, setDonationError] = useState<string | null>(null);

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

  const [recordedGifts, setRecordedGifts] = useState<DonorGiftRecord[]>([]);

  useEffect(() => {
    setRecordedGifts(loadStoredGifts());
  }, []);

  const giftTotals = useMemo(() => {
    const totalAmount = recordedGifts.reduce((sum, g) => sum + g.amount, 0);
    const meals = recordedGifts.reduce((sum, g) => sum + Math.max(1, Math.floor(g.amount / 10)), 0);
    const counseling = recordedGifts.reduce(
      (sum, g) => sum + Math.max(1, Math.floor(g.amount / 35)),
      0,
    );
    return { totalAmount, meals, counseling, count: recordedGifts.length };
  }, [recordedGifts]);

  const onDonationSubmit = (event: FormEvent) => {
    event.preventDefault();
    setDonationError(null);
    setDonationSuccess(null);

    const numericAmount = Number.parseFloat(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setDonationError('Please enter a valid donation amount.');
      return;
    }

    const mealsSupported = Math.max(1, Math.floor(numericAmount / 10));
    const counselingHours = Math.max(1, Math.floor(numericAmount / 35));
    const cadenceLabel = frequency === 'monthly' ? 'monthly' : 'one-time';
    const newGift: DonorGiftRecord = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      amount: numericAmount,
      frequency,
    };
    setRecordedGifts((prev) => {
      const next = [newGift, ...prev];
      saveStoredGifts(next);
      return next;
    });
    setDonationSuccess(
      `Thank you, ${donorName || 'supporter'}! Your ${cadenceLabel} gift can fund about ${mealsSupported} meals or ${counselingHours} counseling hour(s).`,
    );
    setDonorName('');
    setDonorEmail('');
    setAmount('100');
    setFrequency('monthly');
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
        <h2>Your giving overview</h2>
        <p className="auth-lead">
          Gifts you submit on this device are listed here with an estimated impact. Official tax
          receipts and records will come from Kateri separately.
        </p>

        <div className="donor-history-summary">
          <div className="donor-history-summary__item">
            <p className="metric-label">Total recorded (this device)</p>
            <p className="metric-value donor-history-summary__value">
              {money.format(giftTotals.totalAmount)}
            </p>
          </div>
          <div className="donor-history-summary__item">
            <p className="metric-label">Gifts recorded</p>
            <p className="metric-value donor-history-summary__value">{giftTotals.count}</p>
          </div>
          <div className="donor-history-summary__item">
            <p className="metric-label">Est. meals supported (cumulative)</p>
            <p className="metric-value donor-history-summary__value">{giftTotals.meals}</p>
          </div>
          <div className="donor-history-summary__item">
            <p className="metric-label">Est. counseling hours (cumulative)</p>
            <p className="metric-value donor-history-summary__value">{giftTotals.counseling}</p>
          </div>
        </div>

        {recordedGifts.length === 0 ? (
          <p className="donor-history-empty">
            No gifts recorded yet. When you submit a donation below, it will appear in this table.
          </p>
        ) : (
          <div className="donor-history-table-wrap">
            <table className="donor-history-table">
              <caption className="visually-hidden">Your recorded donations on this device</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Type</th>
                  <th scope="col">Est. meals</th>
                  <th scope="col">Est. counseling hrs</th>
                </tr>
              </thead>
              <tbody>
                {[...recordedGifts]
                  .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
                  .map((gift) => (
                    <tr key={gift.id}>
                      <td>{new Date(gift.at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</td>
                      <td>{money.format(gift.amount)}</td>
                      <td>{gift.frequency === 'monthly' ? 'Monthly' : 'One-time'}</td>
                      <td>{Math.max(1, Math.floor(gift.amount / 10))}</td>
                      <td>{Math.max(1, Math.floor(gift.amount / 35))}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
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
          <p className="auth-lead">Choose an amount and frequency. We will route it to direct care.</p>
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
              Email
              <input
                required
                type="email"
                value={donorEmail}
                onChange={(event) => setDonorEmail(event.target.value)}
              />
            </label>
            <label>
              Amount (USD)
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
              Frequency
              <select
                value={frequency}
                onChange={(event) => setFrequency(event.target.value as 'one-time' | 'monthly')}
              >
                <option value="one-time">One-time</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            {donationError && <p className="error-text">{donationError}</p>}
            {donationSuccess && <p className="success-text">{donationSuccess}</p>}
            <button type="submit">Submit donation</button>
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
