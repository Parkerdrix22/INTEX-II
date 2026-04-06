import { useEffect, useState, type FormEvent } from 'react';
import backgroundImage from '../background.jpg';

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

export function DonorDashboardPage() {
  const [amount, setAmount] = useState('100');
  const [frequency, setFrequency] = useState<'one-time' | 'monthly'>('monthly');
  const [donorName, setDonorName] = useState('');
  const [donorEmail, setDonorEmail] = useState('');
  const [donationSuccess, setDonationSuccess] = useState<string | null>(null);
  const [donationError, setDonationError] = useState<string | null>(null);

  const [volunteerName, setVolunteerName] = useState('');
  const [volunteerEmail, setVolunteerEmail] = useState('');
  const [volunteerPhone, setVolunteerPhone] = useState('');
  const [availability, setAvailability] = useState('');
  const [selectedFocuses, setSelectedFocuses] = useState<string[]>([]);
  const [volunteerSuccess, setVolunteerSuccess] = useState<string | null>(null);
  const [volunteerError, setVolunteerError] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add('home-background');
    document.documentElement.style.setProperty('--home-bg-image', `url(${backgroundImage})`);

    return () => {
      document.body.classList.remove('home-background');
      document.documentElement.style.removeProperty('--home-bg-image');
    };
  }, []);

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

    setVolunteerSuccess(
      `Thank you, ${volunteerName}! We received your volunteer interests: ${selectedFocuses.join(', ')}.`,
    );
    setVolunteerName('');
    setVolunteerEmail('');
    setVolunteerPhone('');
    setAvailability('');
    setSelectedFocuses([]);
  };

  const toggleFocus = (focus: string) => {
    setSelectedFocuses((current) =>
      current.includes(focus) ? current.filter((item) => item !== focus) : [...current, focus],
    );
  };

  return (
    <section className="donor-page">
      <article className="hero-panel">
        <h1>Donor Dashboard</h1>
        <p className="hero-copy">
          Your support helps provide safe housing, counseling, education, and reintegration
          services for the girls in Kateri&apos;s care.
        </p>
      </article>

      <div className="stats-grid donor-stats">
        <article className="stat-card">
          <p className="metric-label">Girls Supported This Year</p>
          <p className="metric-value">76</p>
        </article>
        <article className="stat-card">
          <p className="metric-label">Counseling Sessions Funded</p>
          <p className="metric-value">430+</p>
        </article>
        <article className="stat-card">
          <p className="metric-label">School Reintegration Rate</p>
          <p className="metric-value">88%</p>
        </article>
      </div>

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

      <div className="donor-grid">
        <article className="auth-card">
          <h2>Donate money</h2>
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
            <label>
              Availability
              <input
                placeholder="Example: Wednesdays 4-7 PM, Saturdays mornings"
                type="text"
                value={availability}
                onChange={(event) => setAvailability(event.target.value)}
              />
            </label>

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
