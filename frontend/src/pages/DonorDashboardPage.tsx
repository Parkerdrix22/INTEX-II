import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import heroImage from '../background.jpg?format=webp&quality=82&w=1920';
import { useAuth } from '../auth/useAuth';
import { useLanguage } from '../i18n/LanguageContext';
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
  const { t } = useLanguage();
  const programAreaLabel = (name: string) =>
    name === 'Other' ? t('donorImpact.programAreaOther') : name;
  const { effectiveDisplayName, firstName, lastName } = useAuth();
  const welcomeName = formatWelcomeName(effectiveDisplayName);

  const accountVolunteerName = useMemo(() => {
    const full = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(' ').trim();
    return full || t('donorDashboard.defaultVolunteerName');
  }, [firstName, lastName, t]);

  const [amount, setAmount] = useState('100');
  const [donationType, setDonationType] = useState<DonationTypeKey>('Monetary');
  const currency = 'USD';
  const [programArea, setProgramArea] = useState<ProgramArea>('Education');
  const [donationSuccess, setDonationSuccess] = useState<string | null>(null);
  const [donationError, setDonationError] = useState<string | null>(null);
  const [allocationPlan, setAllocationPlan] = useState<AllocationPlan | null>(null);
  const [valuation, setValuation] = useState<DonationValuation | null>(null);
  const [showLargeGiftModal, setShowLargeGiftModal] = useState(false);

  // Per-donation cap. Anything over this requires a human conversation because
  // the allocation logic and tax/compliance paperwork work differently for
  // gifts at that scale. The values below are tuned so that in every donation
  // type the cap represents roughly \$5M of estimated value:
  //   Monetary / InKind: 5,000,000 USD directly
  //   Time:              149,299 hours × $33.49/hr ≈ $5M
  //   Skills:            500,000 hours (median skills rate ≈ $11.51 ≈ $5.75M)
  //   SocialMedia:       100,000 campaigns (any higher clearly warrants review)
  const LARGE_GIFT_CAPS: Record<DonationTypeKey, number> = {
    Monetary: 5_000_000,
    InKind: 5_000_000,
    Time: 149_299,
    Skills: 500_000,
    SocialMedia: 100_000,
  };

  // Pre-fill the amount with a sensible default whenever the type changes
  // (e.g. switching to Time pre-fills "5", switching to Monetary pre-fills "100").
  // Skipped if the donor has already typed something custom.
  const lastAutoFilledType = useRef(donationType);
  useEffect(() => {
    if (lastAutoFilledType.current === donationType) return;
    setAmount(DONATION_TYPE_CONFIG[donationType].defaultAmount);
    lastAutoFilledType.current = donationType;
  }, [donationType]);

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
      setImpactError(err instanceof Error ? err.message : t('donorDashboard.errors.loadHistory'));
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
    if (months < 12) return `${months} ${months === 1 ? t('donorDashboard.month') : t('donorDashboard.months')}`;
    const years = (months / 12).toFixed(1).replace(/\.0$/, '');
    return `${years} ${years === '1' ? t('donorDashboard.year') : t('donorDashboard.years')}`;
  }, [impact, t]);

  const onDonationSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setDonationError(null);
    setDonationSuccess(null);
    setAllocationPlan(null);
    setValuation(null);
    setDonationSubmitting(true);

    const numericAmount = Number.parseFloat(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setDonationError(t('donorDashboard.errors.invalidAmount'));
      setDonationSubmitting(false);
      return;
    }

    // Cap individual gifts at roughly $5M of estimated value. Anything
    // bigger needs a staff conversation (tax paperwork, compliance review,
    // custom allocation decisions).
    if (numericAmount > LARGE_GIFT_CAPS[donationType]) {
      setShowLargeGiftModal(true);
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
        ? `${t('donorDashboard.success.yourGiftOf')} ${money.format(v.estimatedValue)}`
        : `${t('donorDashboard.success.yourPrefix')} ${v.rawAmount} ${v.impactUnit} (${t('donorDashboard.success.valuedAt')} ${money.format(v.estimatedValue)})`;
      setDonationSuccess(
        `${t('donorDashboard.success.thankYou')}, ${effectiveDisplayName || t('donorDashboard.success.supporter')}! ${conversionLine} ${t('donorDashboard.success.allocatedTail')}`,
      );
      await loadImpact();
      setAmount(DONATION_TYPE_CONFIG[donationType].defaultAmount);
    } catch (err) {
      setDonationError(err instanceof Error ? err.message : t('donorDashboard.errors.saveDonation'));
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
      setGoodsError(t('donorDashboard.errors.goodsItem'));
      setGoodsSubmitting(false);
      return;
    }

    const qty = Number.parseInt(goodsQuantity, 10);
    if (!Number.isFinite(qty) || qty < 1) {
      setGoodsError(t('donorDashboard.errors.goodsQuantity'));
      setGoodsSubmitting(false);
      return;
    }

    const totalVal = Number.parseFloat(goodsEstimatedValue);
    if (!Number.isFinite(totalVal) || totalVal <= 0) {
      setGoodsError(t('donorDashboard.errors.goodsValue'));
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
        `${t('donorDashboard.goodsSuccess.prefix')} "${name}". ${t('donorDashboard.goodsSuccess.suffix')}`,
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
      setGoodsError(err instanceof Error ? err.message : t('donorDashboard.errors.saveGoods'));
    } finally {
      setGoodsSubmitting(false);
    }
  };

  const onVolunteerSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setVolunteerError(null);
    setVolunteerSuccess(null);

    if (selectedFocuses.length === 0) {
      setVolunteerError(t('donorDashboard.errors.volunteerFocus'));
      return;
    }

    if (!flexibleOnDays && availDays.length === 0) {
      setVolunteerError(t('donorDashboard.errors.volunteerDays'));
      return;
    }

    if (availTimes.length === 0) {
      setVolunteerError(t('donorDashboard.errors.volunteerTimes'));
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
      const daySummary = flexibleOnDays ? t('donorDashboard.volunteer.flexibleSummary') : availDays.join(', ');
      const timeSummary = availTimes.join(', ');
      setVolunteerSuccess(
        `${t('donorDashboard.volunteer.successPrefix')}, ${accountVolunteerName}! ${t('donorDashboard.volunteer.successRecorded')} (${selectedFocuses.join(', ')}), ${t('donorDashboard.volunteer.successAvailability')} (${daySummary}; ${timeSummary}). ${t('donorDashboard.volunteer.successSuffix')}`,
      );
      setAvailDays([]);
      setAvailTimes([]);
      setFlexibleOnDays(false);
      setAvailabilityNotes('');
      setSelectedFocuses([]);
    } catch (err) {
      setVolunteerError(err instanceof Error ? err.message : t('donorDashboard.errors.saveVolunteer'));
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

  const heroTitle = welcomeName
    ? `${t('donorDashboard.welcomeBack')}, ${welcomeName}`
    : t('donorDashboard.donorPortal');

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
          <p className="kateri-photo-hero__lead">{t('donorDashboard.heroLead')}</p>
          <div className="kateri-hero-actions">
            <a className="btn-kateri-gold" href="#donate-forms">
              {t('donorDashboard.makeDonation')}
            </a>
            <Link className="btn-kateri-ghost" to="/impact">
              {t('donorDashboard.viewOurImpact')}
            </Link>
          </div>
        </div>
      </header>

      <article className="auth-card donor-history-overview" id="donor-history">
        <div className="donor-overview-head">
          <h2>{t('donorDashboard.givingOverview')}</h2>
          <Link className="donor-overview-cta" to="/my-impact">
            {t('donorDashboard.seeFullReport')}
          </Link>
        </div>

        {impactLoading && (
          <p className="auth-lead">{t('donorDashboard.loadingHistory')}</p>
        )}

        {impactError && (
          <p className="auth-lead donor-history-empty">
            {impactError?.includes('linked to a donor profile')
              ? impactError
              : t('donorDashboard.errors.loadHistoryRetry')}
          </p>
        )}

        {!impactLoading && !impactError && impact && impact.donationCount === 0 && (
          <p className="auth-lead donor-history-empty">{t('donorDashboard.noDonationsYet')}</p>
        )}

        {!impactLoading && !impactError && impact && impact.donationCount > 0 && (
          <>
            <p className="auth-lead">
              {t('donorDashboard.welcomeBack')}{impact.displayName ? `, ${impact.displayName}` : ''}. {t('donorDashboard.realImpactLead')}
            </p>

            <div className="donor-history-summary">
              <div className="donor-history-summary__item">
                <p className="metric-label">{t('donorDashboard.totalContributed')}</p>
                <p className="metric-value donor-history-summary__value">
                  {money.format(impact.totalContributed)}
                </p>
                {supportSpanText && (
                  <p className="donor-overview-meta">{t('donorDashboard.overGivingPre')} {supportSpanText} {t('donorDashboard.overGivingSuffix')}</p>
                )}
              </div>
              <div className="donor-history-summary__item">
                <p className="metric-label">{t('donorDashboard.giftsOnRecord')}</p>
                <p className="metric-value donor-history-summary__value">{impact.donationCount}</p>
                {impact.lastDonationDate && (
                  <p className="donor-overview-meta">
                    {t('donorDashboard.lastGift')}{' '}
                    {new Date(impact.lastDonationDate).toLocaleDateString(undefined, {
                      dateStyle: 'medium',
                    })}
                  </p>
                )}
              </div>
              <div className="donor-history-summary__item">
                <p className="metric-label">{t('donorDashboard.safehousesYouFund')}</p>
                <p className="metric-value donor-history-summary__value">
                  {impact.safehousesSupported.length}
                </p>
                {impact.safehousesSupported[0] && (
                  <p className="donor-overview-meta">
                    {t('donorDashboard.incl')} {impact.safehousesSupported[0].name}
                  </p>
                )}
              </div>
              <div className="donor-history-summary__item">
                <p className="metric-label">{t('donorDashboard.topProgramArea')}</p>
                <p className="metric-value donor-history-summary__value donor-overview-program">
                  {topProgramArea ? programAreaLabel(topProgramArea.name) : '—'}
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
                <p className="metric-label">{t('donorDashboard.whereDollarsGo')}</p>
                <div className="donor-overview-bar">
                  {impact.programAreaBreakdown.map((slice, idx) => {
                    const colors: Record<string, string> = {
                      Health: '#385f82',
                      Education: '#c9983f',
                      Counseling: '#a05b3a',
                      Operations: '#5f8448',
                      Other: '#7e7468',
                    };
                    const fallback = ['#385f82', '#c9983f', '#a05b3a', '#5f8448', '#7e7468'];
                    const bg = colors[slice.name] ?? fallback[idx % fallback.length];
                    return (
                      <div
                        key={slice.name}
                        className="donor-overview-bar__segment"
                        style={{
                          width: `${slice.percent}%`,
                          background: bg,
                        }}
                        title={`${programAreaLabel(slice.name)}: ${money.format(slice.amount)} (${slice.percent.toFixed(1)}%)`}
                      />
                    );
                  })}
                </div>
                <ul className="donor-overview-legend">
                  {impact.programAreaBreakdown.map((slice, idx) => {
                    const colors: Record<string, string> = {
                      Health: '#385f82',
                      Education: '#c9983f',
                      Counseling: '#a05b3a',
                      Operations: '#5f8448',
                      Other: '#7e7468',
                    };
                    const fallback = ['#385f82', '#c9983f', '#a05b3a', '#5f8448', '#7e7468'];
                    const bg = colors[slice.name] ?? fallback[idx % fallback.length];
                    return (
                      <li key={slice.name}>
                        <span
                          className="donor-overview-legend__dot"
                          style={{ background: bg }}
                        />
                        <span className="donor-overview-legend__label">{programAreaLabel(slice.name)}</span>
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
                <p className="metric-label">{t('donorDashboard.outcomesHeading')}</p>
                <div className="donor-overview-outcomes__row">
                  {impact.avgHealthScore != null && (
                    <div>
                      <strong>{impact.avgHealthScore.toFixed(1)} / 5</strong>
                      <span>{t('donorDashboard.avgHealthScore')}</span>
                    </div>
                  )}
                  {impact.avgEducationProgress != null && (
                    <div>
                      <strong>{impact.avgEducationProgress.toFixed(0)}%</strong>
                      <span>{t('donorDashboard.avgEducationProgress')}</span>
                    </div>
                  )}
                  {impact.avgActiveResidents != null && (
                    <div>
                      <strong>{Math.round(impact.avgActiveResidents)}</strong>
                      <span>{t('donorDashboard.residentsInCare')}</span>
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
        <h2>{t('donorDashboard.howHelpHeading')}</h2>
        <ul className="mission-list">
          <li>
            <strong>$25</strong> {t('donorDashboard.help25')}
          </li>
          <li>
            <strong>$50</strong> {t('donorDashboard.help50')}
          </li>
          <li>
            <strong>$100</strong> {t('donorDashboard.help100')}
          </li>
          <li>
            <strong>$250</strong> {t('donorDashboard.help250')}
          </li>
        </ul>
      </article>

      <hr className="section-divider" />

      <div id="donate-forms" className="donor-forms-stack">
        <div className="donor-donate-row">
          <article className="auth-card">
            <h2>{t('donorDashboard.donateHeading')}</h2>
            <p className="auth-lead">{t('donorDashboard.donateLead')}</p>
            <form onSubmit={onDonationSubmit}>
              <label>
                {t('donorDashboard.field.donationType')}
                <select
                  value={donationType}
                  onChange={(event) => setDonationType(event.target.value as DonationTypeKey)}
                >
                  <option value="Monetary">{t('donorDashboard.type.monetary')}</option>
                  <option value="Time">{t('donorDashboard.type.volunteerTime')}</option>
                  <option value="Skills">{t('donorDashboard.type.skilledTime')}</option>
                  <option value="SocialMedia">{t('donorDashboard.type.socialMedia')}</option>
                </select>
              </label>
              <label>
                {typeConfig.amountLabel}
                <input
                  required
                  min={1}
                  max={LARGE_GIFT_CAPS[donationType]}
                  step={donationType === 'Monetary' ? '0.01' : '1'}
                  type="number"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              <p className="donation-type-helper">{typeConfig.helperText}</p>
              <p className="donation-type-helper">{t('donorDashboard.currencyLabel')}: USD</p>
              <label>
                {t('donorDashboard.field.whereShouldGo')}
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
                {t('donorDashboard.transparencyPre')}{' '}
                <strong>{programArea}</strong> {t('donorDashboard.transparencyMid')} (
                <Link to="/impact">{t('donorDashboard.howThisWorks')}</Link>). {t('donorDashboard.transparencySuffix')}
              </p>
              {donationError && <p className="error-text">{donationError}</p>}
              {donationSuccess && <p className="success-text">{donationSuccess}</p>}
              {allocationPlan && allocationPlan.safehouseAllocations.length > 0 && (
                <div className="allocation-plan-card">
                  <h3 className="allocation-plan-card__title">
                    {t('donorDashboard.allocation.titlePre')} {money.format(allocationPlan.totalAmount)} {t('donorDashboard.allocation.titleSuffix')}
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
                      <span className="allocation-plan-card__safehouse">{t('donorDashboard.allocation.generalFund')}</span>
                      <span className="allocation-plan-card__area">{t('donorDashboard.allocation.reserve10')}</span>
                      <span className="allocation-plan-card__amount">
                        {money.format(allocationPlan.generalFundAmount)}
                      </span>
                    </li>
                    <li className="allocation-plan-card__reserve">
                      <span className="allocation-plan-card__safehouse">{t('donorDashboard.allocation.rainyDay')}</span>
                      <span className="allocation-plan-card__area">{t('donorDashboard.allocation.reserve5')}</span>
                      <span className="allocation-plan-card__amount">
                        {money.format(allocationPlan.rainyDayAmount)}
                      </span>
                    </li>
                  </ul>
                </div>
              )}
              <button type="submit" disabled={donationSubmitting}>
                {donationSubmitting ? t('donorDashboard.submitting') : t('donorDashboard.submitDonation')}
              </button>
            </form>
          </article>

          <article className="auth-card">
            <h2>{t('donorDashboard.donateGoodsHeading')}</h2>
            <p className="auth-lead">
              {t('donorDashboard.donateGoodsLead')} ({currency}).
            </p>
            <form onSubmit={(e) => void onGoodsSubmit(e)}>
              <label>
                {t('donorDashboard.goods.itemDescription')}
                <input
                  required
                  maxLength={200}
                  type="text"
                  placeholder={t('donorDashboard.goods.itemPlaceholder')}
                  value={goodsItemName}
                  onChange={(event) => setGoodsItemName(event.target.value)}
                  autoComplete="off"
                />
              </label>
              <label>
                {t('donorDashboard.goods.itemCategory')}
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
                {t('donorDashboard.goods.quantity')}
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
                {t('donorDashboard.goods.unitOfMeasure')}
                <select value={goodsUnit} onChange={(event) => setGoodsUnit(event.target.value)}>
                  {inKindUnits.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('donorDashboard.goods.approxValue')} ({currency})
                <input
                  required
                  min={0.01}
                  step="0.01"
                  type="number"
                  value={goodsEstimatedValue}
                  onChange={(event) => setGoodsEstimatedValue(event.target.value)}
                  placeholder={t('donorDashboard.goods.totalValuePlaceholder')}
                />
              </label>
              <p className="donor-goods-hint">{t('donorDashboard.goods.perUnitHint')}</p>
              <label>
                {t('donorDashboard.goods.intendedUse')}
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
                {t('donorDashboard.goods.receivedCondition')}
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
                {goodsSubmitting ? t('donorDashboard.submitting') : t('donorDashboard.submitGoods')}
              </button>
            </form>
          </article>
        </div>

        <article className="auth-card">
          <h2>{t('donorDashboard.volunteerHeading')}</h2>
          <p className="auth-lead">{t('donorDashboard.volunteerLead')}</p>
          <form onSubmit={(event) => void onVolunteerSubmit(event)}>
            <fieldset className="donor-focus-fieldset volunteer-availability-fieldset">
              <legend>{t('donorDashboard.volunteer.whenAvailable')}</legend>
              <p className="volunteer-availability-hint">{t('donorDashboard.volunteer.whenHint')}</p>

              <label className="volunteer-flexible-option">
                <input
                  type="checkbox"
                  checked={flexibleOnDays}
                  onChange={(event) => {
                    setFlexibleOnDays(event.target.checked);
                    if (event.target.checked) setAvailDays([]);
                  }}
                />
                <span>{t('donorDashboard.volunteer.flexibleDays')}</span>
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

              <p className="volunteer-availability-sublegend">{t('donorDashboard.volunteer.timeOfDay')}</p>
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
                {t('donorDashboard.volunteer.additionalNotes')}
                <textarea
                  rows={3}
                  placeholder={t('donorDashboard.volunteer.notesPlaceholder')}
                  value={availabilityNotes}
                  onChange={(event) => setAvailabilityNotes(event.target.value)}
                />
              </label>
            </fieldset>

            <fieldset className="donor-focus-fieldset">
              <legend>{t('donorDashboard.volunteer.helpWith')}</legend>
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
              {volunteerSubmitting ? t('donorDashboard.submitting') : t('donorDashboard.submitVolunteer')}
            </button>
          </form>
        </article>
      </div>

      {showLargeGiftModal && (
        <div
          className="resident-modal-backdrop"
          role="presentation"
          onClick={() => setShowLargeGiftModal(false)}
        >
          <article
            className="resident-modal-card large-gift-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="large-gift-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="record-detail-card__header">
              <p className="record-detail-card__eyebrow">{t('donorDashboard.largeGift.eyebrow')}</p>
              <h2 id="large-gift-modal-title">{t('donorDashboard.largeGift.heading')}</h2>
            </header>

            <p className="auth-lead">
              {t('donorDashboard.largeGift.bodyPre')}{' '}
              <strong>
                {donationType === 'Monetary' || donationType === 'InKind'
                  ? money.format(LARGE_GIFT_CAPS[donationType])
                  : `${LARGE_GIFT_CAPS[donationType].toLocaleString()} ${typeConfig.unitNoun}`}
              </strong>{' '}
              {t('donorDashboard.largeGift.bodySuffix')}
            </p>
            <ul className="large-gift-modal__list">
              <li>Handle the tax-deduction paperwork correctly for a gift of this size</li>
              <li>
                Discuss which program areas or safehouses you&apos;d like your gift to support,
                rather than relying on the automatic allocation
              </li>
              <li>
                Ensure the gift clears our compliance review — required for all gifts above the
                federal reporting threshold
              </li>
            </ul>

            <p className="auth-lead">
              Please email us at{' '}
              <a href="mailto:giving@kateri.byuisresearch.com">giving@kateri.byuisresearch.com</a>{' '}
              and we&apos;ll be in touch within one business day. If you&apos;d rather not wait,
              you can also submit a smaller gift now and we&apos;ll handle the remainder after we
              talk.
            </p>

            <div className="resident-modal-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => setShowLargeGiftModal(false)}
              >
                {t('donorDashboard.largeGift.gotIt')}
              </button>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
