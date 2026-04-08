import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import heroImage from '../background.jpg?format=webp&quality=82&w=1920';
import { useAuth } from '../auth/useAuth';
import {
  donorImpactApi,
  donationsApi,
  donorVolunteerApi,
  PROGRAM_AREAS,
  type AllocationPlan,
  type DonationValuation,
  type DonorImpactReport,
  type ProgramArea,
} from '../lib/api';

type DonationTypeKey = 'Monetary' | 'InKind' | 'Time' | 'Skills' | 'SocialMedia';

// Per-type form configuration. Drives the Amount field label, the inline
// helper text, and the conversion footnote in the success card. Backend
// applies the same rates server-side; this is purely for the donor's UX.
const DONATION_TYPE_CONFIG: Record<DonationTypeKey, {
  amountLabel: string;
  helperText: string;
  unitNoun: string;
  defaultAmount: string;
}> = {
  Monetary: {
    amountLabel: 'Amount (USD)',
    helperText: 'Enter the dollar amount you\u2019d like to give.',
    unitNoun: 'dollars',
    defaultAmount: '100',
  },
  Time: {
    amountLabel: 'Hours volunteered',
    helperText: 'Each volunteer hour is valued at $33.49 (Independent Sector\u2019s 2024 standard rate).',
    unitNoun: 'hours',
    defaultAmount: '5',
  },
  Skills: {
    amountLabel: 'Hours of skilled volunteer work',
    helperText: 'Skilled hours (accounting, legal, design, IT) are valued at the median historical rate from our records.',
    unitNoun: 'hours',
    defaultAmount: '3',
  },
  InKind: {
    amountLabel: 'Estimated value of donated items (USD)',
    helperText: 'Enter the fair market value of what you\u2019re donating (e.g. $200 for $200 worth of school supplies).',
    unitNoun: 'dollars',
    defaultAmount: '250',
  },
  SocialMedia: {
    amountLabel: 'Number of campaigns or posts',
    helperText: 'Each social media campaign is valued at the median historical rate from our records.',
    unitNoun: 'campaigns',
    defaultAmount: '1',
  },
};

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

/** Values aligned with `in_kind_donation_items.csv` (lighthouse dataset). */
const inKindItemCategories = [
  { value: 'SchoolMaterials', label: 'School materials' },
  { value: 'Food', label: 'Food' },
  { value: 'Supplies', label: 'Supplies' },
  { value: 'Medical', label: 'Medical' },
  { value: 'Hygiene', label: 'Hygiene' },
  { value: 'Furniture', label: 'Furniture' },
  { value: 'Clothing', label: 'Clothing' },
] as const;

const inKindUnits = [
  { value: 'sets', label: 'sets' },
  { value: 'packs', label: 'packs' },
  { value: 'kg', label: 'kg' },
  { value: 'boxes', label: 'boxes' },
  { value: 'pcs', label: 'pcs' },
] as const;

const inKindIntendedUse = [
  { value: 'Health', label: 'Health' },
  { value: 'Shelter', label: 'Shelter' },
  { value: 'Hygiene', label: 'Hygiene' },
  { value: 'Education', label: 'Education' },
  { value: 'Meals', label: 'Meals' },
] as const;

const inKindConditions = [
  { value: 'New', label: 'New' },
  { value: 'Good', label: 'Good' },
  { value: 'Fair', label: 'Fair' },
] as const;

function formatWelcomeName(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  const cleaned = raw.trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function DonorDashboardPage() {
  const { effectiveDisplayName, firstName, lastName, email, effectivePhone } = useAuth();
  const welcomeName = formatWelcomeName(effectiveDisplayName);

  const accountVolunteerName = useMemo(() => {
    const full = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(' ').trim();
    return full || 'user';
  }, [firstName, lastName]);

  const [amount, setAmount] = useState('100');
  const [donationType, setDonationType] = useState<DonationTypeKey>('Monetary');
  const [currency, setCurrency] = useState<'USD' | 'PHP'>('USD');
  const [programArea, setProgramArea] = useState<ProgramArea>('Education');
  const [donationSuccess, setDonationSuccess] = useState<string | null>(null);
  const [donationError, setDonationError] = useState<string | null>(null);
  const [allocationPlan, setAllocationPlan] = useState<AllocationPlan | null>(null);
  const [valuation, setValuation] = useState<DonationValuation | null>(null);

  // Pre-fill the amount with a sensible default whenever the type changes
  // (e.g. switching to Time pre-fills "5", switching to Monetary pre-fills "100").
  // Skipped if the donor has already typed something custom.
  const lastAutoFilledType = useMemo(() => ({ value: donationType }), []);
  useEffect(() => {
    if (lastAutoFilledType.value === donationType) return;
    setAmount(DONATION_TYPE_CONFIG[donationType].defaultAmount);
    lastAutoFilledType.value = donationType;
  }, [donationType, lastAutoFilledType]);

  const typeConfig = DONATION_TYPE_CONFIG[donationType];
  const [donationSubmitting, setDonationSubmitting] = useState(false);

  const [goodsItemName, setGoodsItemName] = useState('');
  const [goodsCategory, setGoodsCategory] = useState<string>(inKindItemCategories[0].value);
  const [goodsQuantity, setGoodsQuantity] = useState('1');
  const [goodsUnit, setGoodsUnit] = useState<string>(inKindUnits[0].value);
  const [goodsEstimatedValue, setGoodsEstimatedValue] = useState('');
  const [goodsIntendedUse, setGoodsIntendedUse] = useState<string>(inKindIntendedUse[0].value);
  const [goodsCondition, setGoodsCondition] = useState<string>(inKindConditions[0].value);
  const [goodsSuccess, setGoodsSuccess] = useState<string | null>(null);
  const [goodsError, setGoodsError] = useState<string | null>(null);
  const [goodsSubmitting, setGoodsSubmitting] = useState(false);

  const [availDays, setAvailDays] = useState<string[]>([]);
  const [availTimes, setAvailTimes] = useState<string[]>([]);
  const [flexibleOnDays, setFlexibleOnDays] = useState(false);
  const [availabilityNotes, setAvailabilityNotes] = useState('');
  const [selectedFocuses, setSelectedFocuses] = useState<string[]>([]);
  const [volunteerSuccess, setVolunteerSuccess] = useState<string | null>(null);
  const [volunteerError, setVolunteerError] = useState<string | null>(null);
  const [volunteerSubmitting, setVolunteerSubmitting] = useState(false);

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
    setAllocationPlan(null);
    setValuation(null);
    setDonationSubmitting(true);

    const numericAmount = Number.parseFloat(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setDonationError('Please enter a valid donation amount.');
      setDonationSubmitting(false);
      return;
    }

    const confirmed = window.confirm(
      `Confirm ${donationType} donation of ${numericAmount} ${typeConfig.unitNoun}?`,
    );
    if (!confirmed) {
      setDonationSubmitting(false);
      return;
    }

    try {
      const response = await donationsApi.create({
        amount: numericAmount,
        donationType,
        frequency: 'one-time',
        currency,
        donationDate: new Date().toISOString(),
        campaignName: 'Donor Portal',
        donorName: accountVolunteerName,
        programArea,
      });

      setAllocationPlan(response.allocation);
      setValuation(response.valuation);

      const v = response.valuation;
      const conversionLine = v.canonicalType === 'Monetary' || v.canonicalType === 'InKind'
        ? `Your gift of ${money.format(v.estimatedValue)}`
        : `Your ${v.rawAmount} ${v.impactUnit} (valued at ${money.format(v.estimatedValue)})`;
      setDonationSuccess(
        `Thank you, ${effectiveDisplayName || 'supporter'}! ${conversionLine} has been allocated based on current safehouse needs.`,
      );
      await loadImpact();
      setAmount(DONATION_TYPE_CONFIG[donationType].defaultAmount);
      setCurrency('USD');
    } catch (err) {
      setDonationError(err instanceof Error ? err.message : 'Could not save donation.');
    } finally {
      setDonationSubmitting(false);
    }
  };

  const onGoodsSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setGoodsError(null);
    setGoodsSuccess(null);
    setGoodsSubmitting(true);

    const name = goodsItemName.trim();
    if (!name) {
      setGoodsError('Please describe the item you would like to donate.');
      setGoodsSubmitting(false);
      return;
    }

    const qty = Number.parseInt(goodsQuantity, 10);
    if (!Number.isFinite(qty) || qty < 1) {
      setGoodsError('Please enter a valid quantity (whole number, at least 1).');
      setGoodsSubmitting(false);
      return;
    }

    const totalVal = Number.parseFloat(goodsEstimatedValue);
    if (!Number.isFinite(totalVal) || totalVal <= 0) {
      setGoodsError('Please enter an approximate total value greater than zero.');
      setGoodsSubmitting(false);
      return;
    }

    const confirmed = window.confirm(
      `Submit goods pledge: ${qty} × ${name} (approx. ${money.format(totalVal)} total ${currency})? Staff will follow up on drop-off or shipping.`,
    );
    if (!confirmed) {
      setGoodsSubmitting(false);
      return;
    }

    try {
      await donationsApi.createInKind({
        itemName: name,
        itemCategory: goodsCategory,
        quantity: qty,
        unitOfMeasure: goodsUnit,
        estimatedTotalValue: totalVal,
        intendedUse: goodsIntendedUse,
        receivedCondition: goodsCondition,
        currency,
        donationDate: new Date().toISOString(),
        campaignName: 'Donor Portal',
        donorName: accountVolunteerName,
      });
      setGoodsSuccess(
        `Thank you! We recorded your in-kind pledge for "${name}". Our team may contact you at your account email to coordinate delivery.`,
      );
      await loadImpact();
      setGoodsItemName('');
      setGoodsQuantity('1');
      setGoodsEstimatedValue('');
      setGoodsCategory(inKindItemCategories[0].value);
      setGoodsUnit(inKindUnits[0].value);
      setGoodsIntendedUse(inKindIntendedUse[0].value);
      setGoodsCondition(inKindConditions[0].value);
    } catch (err) {
      setGoodsError(err instanceof Error ? err.message : 'Could not save goods donation.');
    } finally {
      setGoodsSubmitting(false);
    }
  };

  const onVolunteerSubmit = async (event: FormEvent) => {
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

    setVolunteerSubmitting(true);
    try {
      await donorVolunteerApi.submitVolunteerInterest({
        flexibleOnDays: flexibleOnDays,
        days: flexibleOnDays ? [] : [...availDays],
        timesOfDay: [...availTimes],
        focusAreas: [...selectedFocuses],
        notes: availabilityNotes.trim(),
      });
      const daySummary = flexibleOnDays ? 'flexible on days' : availDays.join(', ');
      const timeSummary = availTimes.join(', ');
      setVolunteerSuccess(
        `Thank you, ${accountVolunteerName}! We recorded your interests (${selectedFocuses.join(', ')}), availability (${daySummary}; ${timeSummary}). Staff will reach out using your account email.`,
      );
      setAvailDays([]);
      setAvailTimes([]);
      setFlexibleOnDays(false);
      setAvailabilityNotes('');
      setSelectedFocuses([]);
    } catch (err) {
      setVolunteerError(err instanceof Error ? err.message : 'Could not submit volunteer interest.');
    } finally {
      setVolunteerSubmitting(false);
    }
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
            {impactError?.includes('linked to a donor profile')
              ? impactError
              : 'We couldn\u2019t load your giving history right now. Try refreshing the page.'}
          </p>
        )}

        {!impactLoading && !impactError && impact && impact.donationCount === 0 && (
          <p className="auth-lead donor-history-empty">
            You haven&apos;t made any donations yet. Use the form below to make your first gift!
          </p>
        )}

        {!impactLoading && !impactError && impact && impact.donationCount > 0 && (
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
        <div className="donor-donate-row">
          <article className="auth-card">
            <h2>Donate</h2>
            <p className="auth-lead">
              Choose how you'd like to give. Cash, volunteer time, or skilled work — all are
              automatically routed to safehouses with the greatest current need in your chosen
              program area. (To donate physical goods, use the In-kind form on the right.)
            </p>
            <form onSubmit={onDonationSubmit}>
              <label>
                Donation type
                <select
                  value={donationType}
                  onChange={(event) => setDonationType(event.target.value as DonationTypeKey)}
                >
                  <option value="Monetary">Monetary</option>
                  <option value="Time">Volunteer Time</option>
                  <option value="Skills">Skilled Volunteer Time</option>
                  <option value="SocialMedia">Social Media</option>
                </select>
              </label>
              <label>
                {typeConfig.amountLabel}
                <input
                  required
                  min={1}
                  step={donationType === 'Monetary' ? '0.01' : '1'}
                  type="number"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              <p className="donation-type-helper">{typeConfig.helperText}</p>
              <label>
                Currency
                <select
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value as 'USD' | 'PHP')}
                >
                  <option value="USD">USD</option>
                  <option value="PHP">PHP</option>
                </select>
              </label>
              <label>
                Where should your gift go?
                <select
                  value={programArea}
                  onChange={(event) => setProgramArea(event.target.value as ProgramArea)}
                >
                  {PROGRAM_AREAS.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
              </label>
              <p className="donate-transparency-note">
                Your gift is automatically routed to the safehouses with the greatest current need in{' '}
                <strong>{programArea}</strong> using a data-driven need score (
                <Link to="/impact">how this works</Link>). 10% goes to our General Operating Fund and 5%
                to a Rainy Day Reserve; the remaining 85% is split across the top 2 most-needy
                safehouses.
              </p>
              {donationError && <p className="error-text">{donationError}</p>}
              {donationSuccess && <p className="success-text">{donationSuccess}</p>}
              {allocationPlan && allocationPlan.safehouseAllocations.length > 0 && (
                <div className="allocation-plan-card">
                  <h3 className="allocation-plan-card__title">
                    Where your {money.format(allocationPlan.totalAmount)} went
                  </h3>
                  {valuation && valuation.canonicalType !== 'Monetary' && valuation.canonicalType !== 'InKind' && (
                    <p className="allocation-plan-card__conversion">
                      {valuation.rawAmount} {valuation.impactUnit} × ${valuation.ratePerUnit.toFixed(2)} =
                      {' '}{money.format(valuation.estimatedValue)}{' '}
                      <span className="allocation-plan-card__conversion-source">— {valuation.rateSource}</span>
                    </p>
                  )}
                  <ul className="allocation-plan-card__list">
                    {allocationPlan.safehouseAllocations.map((sa) => (
                      <li key={sa.safehouseId}>
                        <span className="allocation-plan-card__safehouse">{sa.safehouseName}</span>
                        <span className="allocation-plan-card__area">{sa.programArea}</span>
                        <span className="allocation-plan-card__amount">{money.format(sa.amount)}</span>
                      </li>
                    ))}
                    <li className="allocation-plan-card__reserve">
                      <span className="allocation-plan-card__safehouse">General Operating Fund</span>
                      <span className="allocation-plan-card__area">10% reserve</span>
                      <span className="allocation-plan-card__amount">
                        {money.format(allocationPlan.generalFundAmount)}
                      </span>
                    </li>
                    <li className="allocation-plan-card__reserve">
                      <span className="allocation-plan-card__safehouse">Rainy Day Reserve</span>
                      <span className="allocation-plan-card__area">5% emergency fund</span>
                      <span className="allocation-plan-card__amount">
                        {money.format(allocationPlan.rainyDayAmount)}
                      </span>
                    </li>
                  </ul>
                </div>
              )}
              <button type="submit" disabled={donationSubmitting}>
                {donationSubmitting ? 'Submitting…' : 'Submit donation'}
              </button>
            </form>
          </article>

          <article className="auth-card">
            <h2>Donate goods</h2>
            <p className="auth-lead">
              Tell us what you would like to give. Fields match our in-kind data: category, quantity,
              unit, total estimated value, intended use, and condition. Value currency is the same as
              in the monetary section above ({currency}).
            </p>
            <form onSubmit={(e) => void onGoodsSubmit(e)}>
              <label>
                Item description
                <input
                  required
                  maxLength={200}
                  type="text"
                  placeholder="e.g. School supplies, hygiene kits, rice"
                  value={goodsItemName}
                  onChange={(event) => setGoodsItemName(event.target.value)}
                  autoComplete="off"
                />
              </label>
              <label>
                Item category
                <select
                  value={goodsCategory}
                  onChange={(event) => setGoodsCategory(event.target.value)}
                >
                  {inKindItemCategories.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quantity
                <input
                  required
                  min={1}
                  step={1}
                  type="number"
                  value={goodsQuantity}
                  onChange={(event) => setGoodsQuantity(event.target.value)}
                />
              </label>
              <label>
                Unit of measure
                <select value={goodsUnit} onChange={(event) => setGoodsUnit(event.target.value)}>
                  {inKindUnits.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Approximate total value ({currency})
                <input
                  required
                  min={0.01}
                  step="0.01"
                  type="number"
                  value={goodsEstimatedValue}
                  onChange={(event) => setGoodsEstimatedValue(event.target.value)}
                  placeholder="Total estimated value for this pledge"
                />
              </label>
              <p className="donor-goods-hint">
                We save per-unit value as total ÷ quantity (same structure as our in-kind import).
              </p>
              <label>
                Intended use
                <select
                  value={goodsIntendedUse}
                  onChange={(event) => setGoodsIntendedUse(event.target.value)}
                >
                  {inKindIntendedUse.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Received condition
                <select
                  value={goodsCondition}
                  onChange={(event) => setGoodsCondition(event.target.value)}
                >
                  {inKindConditions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              {goodsError && <p className="error-text">{goodsError}</p>}
              {goodsSuccess && <p className="success-text">{goodsSuccess}</p>}
              <button type="submit" disabled={goodsSubmitting}>
                {goodsSubmitting ? 'Submitting…' : 'Submit goods pledge'}
              </button>
            </form>
          </article>
        </div>

        <article className="auth-card">
          <h2>Volunteer sign-up</h2>
          <p className="auth-lead">Tell us how you would like to help the girls.</p>
          <form onSubmit={(event) => void onVolunteerSubmit(event)}>
            <div className="volunteer-account-contact" aria-label="Your account contact">
              <p className="volunteer-account-contact__title">Using your account</p>
              <p className="volunteer-account-contact__line">
                <strong>Name</strong>
                <span>{accountVolunteerName}</span>
              </p>
              <p className="volunteer-account-contact__line">
                <strong>Email</strong>
                <span>{email?.trim() || '—'}</span>
              </p>
              <p className="volunteer-account-contact__line">
                <strong>Phone</strong>
                <span>{effectivePhone?.trim() || '—'}</span>
              </p>
              <p className="volunteer-account-contact__hint">
                Phone and display preferences can be updated on your profile when needed.
              </p>
            </div>

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
            <button type="submit" disabled={volunteerSubmitting}>
              {volunteerSubmitting ? 'Submitting…' : 'Submit volunteer interest'}
            </button>
          </form>
        </article>
      </div>
    </section>
  );
}
