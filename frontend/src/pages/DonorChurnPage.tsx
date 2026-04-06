import { useEffect, useState } from 'react';
import './DonorChurnPage.css';

type DonorChurnItem = {
  supporterId: number;
  displayName: string;
  supporterType: string;
  acquisitionChannel: string;
  status: string;
  churnProbability: number;
  churnRisk: string;
  lastDonationDate: string | null;
  totalDonated: number;
  donationCount: number;
  isRecurring: boolean;
  daysSinceLastDonation: number;
};

type ChurnModelInfo = {
  supporterCount: number;
  r2: number;
  trainedAt: string | null;
  modelName: string;
};

type SortKey = 'churnRisk' | 'name' | 'lastDonation' | 'totalDonated';
type RiskFilter = 'All' | 'High' | 'Medium' | 'Low';

const riskColor = (risk: string) => {
  switch (risk) {
    case 'High': return '#a63d40';
    case 'Medium': return '#c9983f';
    case 'Low': return '#5f8448';
    default: return '#4a5b66';
  }
};

const riskSortOrder: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

export function DonorChurnPage() {
  const [donors, setDonors] = useState<DonorChurnItem[]>([]);
  const [modelInfo, setModelInfo] = useState<ChurnModelInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('All');
  const [sortBy, setSortBy] = useState<SortKey>('churnRisk');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [dashRes, infoRes] = await Promise.all([
          fetch('/api/donor-churn/dashboard', { credentials: 'include' }),
          fetch('/api/donor-churn/model-info', { credentials: 'include' }),
        ]);
        if (!dashRes.ok || !infoRes.ok) throw new Error('Failed to load data');
        const [dashData, infoData] = await Promise.all([dashRes.json(), infoRes.json()]);
        setDonors(dashData);
        setModelInfo(infoData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
        setTimeout(() => setVisible(true), 60);
      }
    };
    loadData();
  }, []);

  const filtered = donors
    .filter(d => riskFilter === 'All' || d.churnRisk === riskFilter)
    .filter(d => d.displayName.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      switch (sortBy) {
        case 'churnRisk':
          return (riskSortOrder[a.churnRisk] ?? 3) - (riskSortOrder[b.churnRisk] ?? 3)
            || b.churnProbability - a.churnProbability;
        case 'name':
          return a.displayName.localeCompare(b.displayName);
        case 'lastDonation':
          return b.daysSinceLastDonation - a.daysSinceLastDonation;
        case 'totalDonated':
          return b.totalDonated - a.totalDonated;
        default:
          return 0;
      }
    });

  const countByRisk = (risk: string) => donors.filter(d => d.churnRisk === risk).length;

  if (loading) {
    return (
      <div className="churn-loading">
        <div className="churn-loading-spinner" />
        <p>Loading Donor Retention Dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="churn-loading">
        <p style={{ color: 'var(--error)' }}>Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="churn-page">
      {/* ── Header ────────────────────────────────────── */}
      <div className="churn-header">
        <span className="churn-overline">ML-Powered Insights</span>
        <h1 className="churn-title">Donor Retention Dashboard</h1>
        <p className="churn-subtitle">
          Analyzing <strong>{modelInfo?.supporterCount?.toLocaleString() ?? '...'}</strong> donors
          with a {modelInfo?.modelName ?? 'predictive'} model.
          {modelInfo?.trainedAt && (
            <span className="churn-trained-at">
              {' '}Last trained {new Date(modelInfo.trainedAt).toLocaleDateString()}.
            </span>
          )}
        </p>
      </div>

      {/* ── Summary cards ─────────────────────────────── */}
      <div className="churn-summary-row">
        <SummaryCard
          label="At Risk"
          count={countByRisk('High')}
          color="#a63d40"
          visible={visible}
          delay={0}
        />
        <SummaryCard
          label="Monitor"
          count={countByRisk('Medium')}
          color="#c9983f"
          visible={visible}
          delay={1}
        />
        <SummaryCard
          label="Healthy"
          count={countByRisk('Low')}
          color="#5f8448"
          visible={visible}
          delay={2}
        />
      </div>

      {/* ── Filters / sorting ─────────────────────────── */}
      <div className="churn-controls">
        <div className="churn-search-wrap">
          <svg className="churn-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            className="churn-search"
            type="text"
            placeholder="Search donors..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="churn-filter-group">
          {(['All', 'High', 'Medium', 'Low'] as RiskFilter[]).map(level => (
            <button
              key={level}
              className={`churn-filter-btn ${riskFilter === level ? 'churn-filter-btn--active' : ''}`}
              onClick={() => setRiskFilter(level)}
            >
              {level !== 'All' && (
                <span className="churn-filter-dot" style={{ background: riskColor(level) }} />
              )}
              {level}
            </button>
          ))}
        </div>

        <div className="churn-sort-wrap">
          <label className="churn-sort-label">Sort by</label>
          <select
            className="churn-sort-select"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortKey)}
          >
            <option value="churnRisk">Churn Risk</option>
            <option value="name">Name</option>
            <option value="lastDonation">Last Donation</option>
            <option value="totalDonated">Total Donated</option>
          </select>
        </div>
      </div>

      {/* ── Donor cards ───────────────────────────────── */}
      <div className="churn-donor-list">
        {filtered.length === 0 && (
          <div className="churn-empty">No donors match your filters.</div>
        )}
        {filtered.map((donor, i) => (
          <DonorCard
            key={donor.supporterId}
            donor={donor}
            index={i}
            visible={visible}
            expanded={expandedId === donor.supporterId}
            onToggle={() =>
              setExpandedId(prev => (prev === donor.supporterId ? null : donor.supporterId))
            }
          />
        ))}
      </div>

      {/* ── Disclaimer ────────────────────────────────── */}
      <div className="churn-disclaimer">
        Predictions generated by a {modelInfo?.modelName ?? 'predictive'} model
        (ROC-AUC = {modelInfo?.r2 ?? '...'}) analyzing{' '}
        {modelInfo?.supporterCount?.toLocaleString() ?? '...'} donor profiles.
        Risk scores update nightly.
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════════ */

function SummaryCard({
  label,
  count,
  color,
  visible,
  delay,
}: {
  label: string;
  count: number;
  color: string;
  visible: boolean;
  delay: number;
}) {
  return (
    <div
      className={`churn-summary-card ${visible ? 'churn-summary-card--visible' : ''}`}
      style={{ transitionDelay: `${delay * 80}ms`, borderTopColor: color }}
    >
      <span className="churn-summary-count" style={{ color }}>{count}</span>
      <span className="churn-summary-label">{label}</span>
    </div>
  );
}

function DonorCard({
  donor,
  index,
  visible,
  expanded,
  onToggle,
}: {
  donor: DonorChurnItem;
  index: number;
  visible: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const color = riskColor(donor.churnRisk);
  const pct = Math.round(donor.churnProbability * 100);

  const riskFactors: string[] = [];
  if (donor.daysSinceLastDonation > 365) riskFactors.push('No donation in over a year');
  if (!donor.isRecurring) riskFactors.push('Not a recurring donor');
  if (donor.donationCount <= 2) riskFactors.push('Few total donations');
  if (donor.totalDonated < 500) riskFactors.push('Low total giving');

  const explainer =
    donor.churnRisk === 'High'
      ? `This donor hasn't donated in ${donor.daysSinceLastDonation} days and shows patterns consistent with lapsing. Consider personal outreach.`
      : donor.churnRisk === 'Medium'
      ? 'This donor shows some warning signs. Monitor their engagement and consider a follow-up.'
      : 'This donor is actively engaged with consistent giving patterns.';

  const action =
    donor.churnRisk === 'High'
      ? 'Schedule a personal phone call or handwritten note within the next 7 days.'
      : donor.churnRisk === 'Medium'
      ? 'Send a personalized impact update or thank-you email this month.'
      : 'Continue current engagement cadence. Include in annual impact report.';

  return (
    <div
      className={`churn-donor-card ${visible ? 'churn-donor-card--visible' : ''} ${expanded ? 'churn-donor-card--expanded' : ''}`}
      style={{ transitionDelay: `${Math.min(index, 20) * 40}ms` }}
    >
      <div className="churn-donor-row" onClick={onToggle}>
        {/* Risk bar */}
        <div className="churn-risk-bar" style={{ backgroundColor: color }} />

        {/* Main info */}
        <div className="churn-donor-info">
          <div className="churn-donor-name-row">
            <span className="churn-donor-name">{donor.displayName}</span>
            <span className="churn-badge churn-badge--type">{donor.supporterType}</span>
            {donor.isRecurring && <span className="churn-badge churn-badge--recurring">Recurring</span>}
            <span
              className={`churn-badge ${donor.status === 'Active' ? 'churn-badge--active' : 'churn-badge--inactive'}`}
            >
              {donor.status}
            </span>
          </div>

          <div className="churn-donor-stats">
            <span>Last donated {donor.daysSinceLastDonation} days ago</span>
            <span className="churn-stat-sep" />
            <span>Total: ${donor.totalDonated.toLocaleString()}</span>
            <span className="churn-stat-sep" />
            <span>{donor.donationCount} donation{donor.donationCount !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Churn probability */}
        <div className="churn-prob-area">
          <span className="churn-prob-pct" style={{ color }}>{pct}%</span>
          <div className="churn-prob-track">
            <div className="churn-prob-fill" style={{ width: `${pct}%`, backgroundColor: color }} />
          </div>
          <span className="churn-prob-label">churn risk</span>
        </div>

        {/* Expand chevron */}
        <div className={`churn-chevron ${expanded ? 'churn-chevron--open' : ''}`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>

      {/* ── Expanded detail panel ────────────────────── */}
      {expanded && (
        <div className="churn-detail">
          <div className="churn-detail-grid">
            {/* Big probability */}
            <div className="churn-detail-prob">
              <div className="churn-detail-ring" style={{ borderColor: color }}>
                <span className="churn-detail-ring-num">{pct}</span>
                <span className="churn-detail-ring-pct">%</span>
              </div>
              <span className="churn-detail-ring-label">Churn Probability</span>
            </div>

            {/* Explainer */}
            <div className="churn-detail-explainer">
              <h4 className="churn-detail-heading">What does this mean?</h4>
              <p className="churn-detail-text">{explainer}</p>

              {riskFactors.length > 0 && (
                <>
                  <h4 className="churn-detail-heading" style={{ marginTop: '1rem' }}>Risk Factors</h4>
                  <div className="churn-factor-pills">
                    {riskFactors.map(f => (
                      <span key={f} className="churn-factor-pill">{f}</span>
                    ))}
                  </div>
                </>
              )}

              <h4 className="churn-detail-heading" style={{ marginTop: '1rem' }}>Recommended Action</h4>
              <p className="churn-detail-text">{action}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
