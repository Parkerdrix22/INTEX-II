import { useEffect, useMemo, useState } from 'react';
import { Check, AlertTriangle } from 'react-feather';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import './CaseResolutionPage.css';

// =============================================================================
// API types — must match the C# CaseResolutionController DTOs exactly
// =============================================================================

type CaseResolutionItem = {
  residentId: number;
  caseControlNo: string;
  internalCode: string;
  caseStatus: string;
  caseCategory: string;
  currentRiskLevel: string;
  reintegrationStatus: string;
  safehouseId: number | null;
  safehouseName: string;
  assignedSocialWorker: string;
  dateOfAdmission: string | null;
  dateClosed: string | null;

  predictedResolutionProbability: number;
  predictedResolutionBand: string;
  modelAgreesWithLabel: boolean;

  ageAtIntake: number;
  lengthOfStayDays: number;
  sessionCount: number;
  achievedRate: number;
  hasSafetyPlan: boolean;
  planCount: number;
  incidentCount: number;

  topResolutionFactors: string[];
};

type CategoryStats = {
  incidents: {
    count: number;
    highSeverity: number;
    selfHarm: number;
    runaway: number;
    unresolved: number;
  };
  health: {
    meanScore: number;
    latestScore: number;
    trend: number;
    meanNutrition: number;
    meanSleep: number;
    recordCount: number;
  };
  education: {
    meanAttendance: number;
    meanProgress: number;
    latestProgress: number;
    recordCount: number;
  };
  sessions: {
    count: number;
    concernsFlaggedRate: number;
    progressNotedRate: number;
    referralMadeRate: number;
    negativeEndStateRate: number;
  };
  homeVisits: {
    count: number;
    safetyConcernsRate: number;
    uncooperativeFamilyRate: number;
    favorableOutcomeRate: number;
  };
  interventions: {
    count: number;
    achievedRate: number;
    onHoldRate: number;
    hasSafetyPlan: boolean;
  };
};

type FeatureContribution = {
  name: string;
  displayName: string;
  value: number;
  coefficient: number;
  direction: 'positive' | 'negative';
};

type DetailedCaseResolution = CaseResolutionItem & {
  categoryStats: CategoryStats;
  featureContributions: FeatureContribution[];
};

type ModelInfo = {
  residentCount: number;
  rocAuc: number;
  trainedAt: string | null;
  modelName: string;
  nFeatures: number;
  nPositives: number;
  target: string;
};

type ResolutionBand = 'All' | 'Imminent' | 'Likely' | 'Possible' | 'Unlikely';
type SortKey = 'resolutionScore' | 'resolutionBand' | 'caseNo' | 'lengthOfStay';

// =============================================================================
// Visual constants
// =============================================================================

const BAND_COLORS: Record<string, string> = {
  Imminent: '#3d6b4d',
  Likely: '#5f8448',
  Possible: '#385f82',
  Unlikely: '#7a8a96',
};

const BAND_BG: Record<string, string> = {
  Imminent: 'rgba(61, 107, 77, 0.16)',
  Likely: 'rgba(95, 132, 72, 0.15)',
  Possible: 'rgba(56, 95, 130, 0.14)',
  Unlikely: 'rgba(122, 138, 150, 0.16)',
};

const BAND_SORT: Record<string, number> = {
  Imminent: 0,
  Likely: 1,
  Possible: 2,
  Unlikely: 3,
};

const POSITIVE_COLOR = '#5f8448';
const NEGATIVE_COLOR = '#6a8aa8';

const numberFmt = new Intl.NumberFormat('en-US');

const formatPct = (value: number): string => `${Math.round(value * 100)}%`;

const bandColor = (band: string): string => BAND_COLORS[band] ?? '#7a8a96';

// =============================================================================
// Page component
// =============================================================================

export function CaseResolutionPage() {
  const [residents, setResidents] = useState<CaseResolutionItem[]>([]);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  const [search, setSearch] = useState('');
  const [bandFilter, setBandFilter] = useState<ResolutionBand>('All');
  const [sortBy, setSortBy] = useState<SortKey>('resolutionScore');

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailCache, setDetailCache] = useState<Record<number, DetailedCaseResolution>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  // ── Initial fetch ──────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const [dashRes, infoRes] = await Promise.all([
          fetch('/api/case-resolution/dashboard', { credentials: 'include' }),
          fetch('/api/case-resolution/model-info', { credentials: 'include' }),
        ]);
        if (!dashRes.ok || !infoRes.ok) {
          throw new Error('Failed to load case resolution data');
        }
        const dashData: CaseResolutionItem[] = await dashRes.json();
        const infoData: ModelInfo = await infoRes.json();
        setResidents(dashData);
        setModelInfo(infoData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
        setTimeout(() => setVisible(true), 60);
      }
    };
    load();
  }, []);

  // ── Derived data ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = residents.filter((r) => {
      if (bandFilter !== 'All' && r.predictedResolutionBand !== bandFilter) return false;
      if (!term) return true;
      return (
        r.caseControlNo.toLowerCase().includes(term) ||
        r.internalCode.toLowerCase().includes(term) ||
        r.safehouseName.toLowerCase().includes(term) ||
        r.assignedSocialWorker.toLowerCase().includes(term)
      );
    });
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'resolutionScore':
          return b.predictedResolutionProbability - a.predictedResolutionProbability;
        case 'resolutionBand': {
          const diff =
            (BAND_SORT[a.predictedResolutionBand] ?? 9) -
            (BAND_SORT[b.predictedResolutionBand] ?? 9);
          return diff !== 0
            ? diff
            : b.predictedResolutionProbability - a.predictedResolutionProbability;
        }
        case 'caseNo':
          return a.caseControlNo.localeCompare(b.caseControlNo);
        case 'lengthOfStay':
          return b.lengthOfStayDays - a.lengthOfStayDays;
        default:
          return 0;
      }
    });
    return sorted;
  }, [residents, search, bandFilter, sortBy]);

  const summary = useMemo(() => {
    const total = residents.length;
    const readyCount = residents.filter(
      (r) =>
        r.predictedResolutionBand === 'Imminent' ||
        r.predictedResolutionBand === 'Likely',
    ).length;
    const agreeCount = residents.filter((r) => r.modelAgreesWithLabel).length;
    const agreementPct = total === 0 ? 0 : agreeCount / total;
    return { total, readyCount, agreementPct };
  }, [residents]);

  const distribution = useMemo(() => {
    const bands: Array<'Imminent' | 'Likely' | 'Possible' | 'Unlikely'> = [
      'Imminent',
      'Likely',
      'Possible',
      'Unlikely',
    ];
    return bands
      .map((name) => ({
        name,
        value: residents.filter((r) => r.predictedResolutionBand === name).length,
      }))
      .filter((slice) => slice.value > 0);
  }, [residents]);

  const handleToggle = async (resident: CaseResolutionItem) => {
    if (expandedId === resident.residentId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(resident.residentId);
    setDetailError(null);
    if (detailCache[resident.residentId]) return;
    setDetailLoadingId(resident.residentId);
    try {
      const res = await fetch(`/api/case-resolution/${resident.residentId}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load detailed resolution profile');
      const data: DetailedCaseResolution = await res.json();
      setDetailCache((prev) => ({ ...prev, [resident.residentId]: data }));
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setDetailLoadingId(null);
    }
  };

  // ── Loading / error ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="cres-loading">
        <div className="cres-spinner" />
        <p>Loading Case Resolution Predictor…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="cres-error">
        <h2>Couldn’t load resolution dashboard</h2>
        <p>{error}</p>
        <p className="cres-error-hint">
          Try refreshing the page. If the problem persists, contact the system administrator.
        </p>
      </div>
    );
  }

  return (
    <section className={`cres-page ${visible ? 'is-visible' : ''}`}>
      {/* ── Header ───────────────────────────────────────── */}
      <header className="cres-header">
        <h1 className="cres-title">Resident Graduation Readiness</h1>
        <p className="cres-subtitle">
          Find residents whose case profile most resembles past successful closures. Helps
          case managers prioritize graduation planning, reintegration paperwork, and bed
          turnover.
        </p>
        {modelInfo && (
          <p className="cres-meta">
            Trained on <strong>{numberFmt.format(modelInfo.residentCount)}</strong> residents ·
            ROC-AUC = <strong>{(modelInfo.rocAuc * 100).toFixed(0)}%</strong>
            {modelInfo.trainedAt && (
              <>
                {' '}
                · last refresh{' '}
                {new Date(modelInfo.trainedAt).toLocaleDateString(undefined, {
                  dateStyle: 'medium',
                })}
              </>
            )}
          </p>
        )}
      </header>

      {/* ── Summary + distribution ───────────────────────── */}
      <div className="cres-summary-row">
        <div className="cres-summary-cards">
          <SummaryCard
            label="Total residents"
            value={numberFmt.format(summary.total)}
            color="#385f82"
            visible={visible}
            delay={0}
          />
          <SummaryCard
            label="Likely to graduate"
            value={numberFmt.format(summary.readyCount)}
            color="#5f8448"
            visible={visible}
            delay={1}
          />
          <SummaryCard
            label="Model agreement"
            value={`${(summary.agreementPct * 100).toFixed(0)}%`}
            color="#3d6b4d"
            visible={visible}
            delay={2}
          />
          <SummaryCard
            label="ROC-AUC"
            value={modelInfo ? `${(modelInfo.rocAuc * 100).toFixed(0)}%` : '—'}
            color="#385f82"
            visible={visible}
            delay={3}
          />
        </div>

        <div className="cres-distribution-card">
          <h3 className="cres-distribution-title">Resolution distribution</h3>
          {distribution.length > 0 ? (
            <ResponsiveContainer width="100%" debounce={1} height={200}>
              <PieChart>
                <Pie
                  data={distribution}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={42}
                  outerRadius={72}
                  paddingAngle={2}
                  stroke="rgba(255,255,255,0.6)"
                >
                  {distribution.map((slice) => (
                    <Cell key={slice.name} fill={BAND_COLORS[slice.name] ?? '#7a8a96'} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={
                    ((value: unknown, name: unknown) => {
                      const num = typeof value === 'number' ? value : Number(value ?? 0);
                      return [`${numberFmt.format(num)} residents`, String(name ?? '')];
                    }) as never
                  }
                  contentStyle={{
                    background: 'rgba(255,253,247,0.96)',
                    border: '1px solid rgba(170,190,208,0.4)',
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="cres-empty-mini">No resolution band data.</p>
          )}
        </div>
      </div>

      {/* ── Controls row ─────────────────────────────────── */}
      <div className="cres-controls">
        <div className="cres-search-wrap">
          <svg
            className="cres-search-icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            className="cres-search"
            type="text"
            placeholder="Search by case #, code, safehouse, or social worker…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="cres-filter-group">
          {(['All', 'Imminent', 'Likely', 'Possible', 'Unlikely'] as ResolutionBand[]).map(
            (band) => (
              <button
                key={band}
                type="button"
                className={`cres-filter-btn ${
                  bandFilter === band ? 'cres-filter-btn--active' : ''
                }`}
                onClick={() => setBandFilter(band)}
              >
                {band !== 'All' && (
                  <span
                    className="cres-filter-dot"
                    style={{ background: bandColor(band) }}
                  />
                )}
                {band}
              </button>
            ),
          )}
        </div>

        <div className="cres-sort-wrap">
          <label className="cres-sort-label">Sort by</label>
          <select
            className="cres-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
          >
            <option value="resolutionScore">Resolution score</option>
            <option value="resolutionBand">Resolution band</option>
            <option value="caseNo">Case #</option>
            <option value="lengthOfStay">Length of stay</option>
          </select>
        </div>
      </div>

      {/* ── Resident list ────────────────────────────────── */}
      <div className="cres-list">
        {filtered.length === 0 && (
          <div className="cres-empty">No residents match your filters.</div>
        )}
        {filtered.map((resident, idx) => (
          <ResidentCard
            key={resident.residentId}
            resident={resident}
            index={idx}
            visible={visible}
            expanded={expandedId === resident.residentId}
            detail={detailCache[resident.residentId]}
            detailLoading={detailLoadingId === resident.residentId}
            detailError={expandedId === resident.residentId ? detailError : null}
            onToggle={() => void handleToggle(resident)}
          />
        ))}
      </div>

      <p className="cres-disclaimer">
        Predictions generated by a logistic regression classifier
        {modelInfo && (
          <>
            {' '}
            (ROC-AUC = {(modelInfo.rocAuc * 100).toFixed(0)}%) trained on{' '}
            {numberFmt.format(modelInfo.nFeatures)} features across{' '}
            {numberFmt.format(modelInfo.residentCount)} resident profiles
          </>
        )}
        . Resolution scores update nightly. Use as a planning aid, not a substitute for
        professional judgment.
      </p>
    </section>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function SummaryCard({
  label,
  value,
  color,
  visible,
  delay,
}: {
  label: string;
  value: string;
  color: string;
  visible: boolean;
  delay: number;
}) {
  return (
    <div
      className={`cres-summary-card ${visible ? 'cres-summary-card--visible' : ''}`}
      style={{ transitionDelay: `${delay * 70}ms`, borderTopColor: color }}
    >
      <span className="cres-summary-value" style={{ color }}>
        {value}
      </span>
      <span className="cres-summary-label">{label}</span>
    </div>
  );
}

function ResidentCard({
  resident,
  index,
  visible,
  expanded,
  detail,
  detailLoading,
  detailError,
  onToggle,
}: {
  resident: CaseResolutionItem;
  index: number;
  visible: boolean;
  expanded: boolean;
  detail: DetailedCaseResolution | undefined;
  detailLoading: boolean;
  detailError: string | null;
  onToggle: () => void;
}) {
  const color = bandColor(resident.predictedResolutionBand);
  const pct = Math.round(resident.predictedResolutionProbability * 100);
  const bandBg =
    BAND_BG[resident.predictedResolutionBand] ?? 'rgba(122, 138, 150, 0.14)';

  return (
    <div
      className={`cres-card ${visible ? 'cres-card--visible' : ''} ${
        expanded ? 'cres-card--expanded' : ''
      }`}
      style={{ transitionDelay: `${Math.min(index, 18) * 35}ms` }}
    >
      <button type="button" className="cres-card-row" onClick={onToggle}>
        <div className="cres-card-stripe" style={{ background: color }} />

        <div className="cres-card-info">
          <div className="cres-card-top">
            <span className="cres-card-case">{resident.caseControlNo}</span>
            <span className="cres-card-code">{resident.internalCode}</span>
            <span
              className="cres-band-badge"
              style={{ background: bandBg, color }}
            >
              {resident.predictedResolutionBand}
            </span>
            {resident.modelAgreesWithLabel ? (
              <span
                className="cres-agree cres-agree--yes"
                title="Model agrees with current human label"
              >
                <Check size={14} aria-hidden="true" /> agrees
              </span>
            ) : (
              <span
                className="cres-agree cres-agree--no"
                title="Model disagrees with current human label"
              >
                <AlertTriangle size={14} aria-hidden="true" /> disagrees
              </span>
            )}
          </div>
          <div className="cres-card-meta">
            <span>{resident.safehouseName || 'Unassigned safehouse'}</span>
            <span className="cres-meta-sep" />
            <span>SW: {resident.assignedSocialWorker || '—'}</span>
            <span className="cres-meta-sep" />
            <span>{resident.caseStatus}</span>
          </div>
          {resident.topResolutionFactors.length > 0 && (
            <div className="cres-factor-row">
              {resident.topResolutionFactors.slice(0, 4).map((f) => (
                <span key={f} className="cres-factor-chip">
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="cres-prob-area">
          <span className="cres-prob-pct" style={{ color }}>
            {pct}%
          </span>
          <div className="cres-prob-track">
            <div
              className="cres-prob-fill"
              style={{ width: `${pct}%`, background: color }}
            />
          </div>
          <span className="cres-prob-label">resolution probability</span>
        </div>

        <div className={`cres-chevron ${expanded ? 'cres-chevron--open' : ''}`}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="cres-detail">
          {detailLoading && (
            <div className="cres-detail-loading">
              <div className="cres-spinner cres-spinner--small" />
              <span>Loading detailed resolution profile…</span>
            </div>
          )}

          {detailError && !detailLoading && (
            <div className="cres-detail-error">{detailError}</div>
          )}

          {detail && !detailLoading && (
            <ResidentDetail detail={detail} color={color} pct={pct} />
          )}
        </div>
      )}
    </div>
  );
}

function ResidentDetail({
  detail,
  color,
  pct,
}: {
  detail: DetailedCaseResolution;
  color: string;
  pct: number;
}) {
  const contributionData = useMemo(() => {
    return detail.featureContributions
      .map((fc) => ({
        name: fc.displayName,
        contribution: fc.value * fc.coefficient,
        direction: fc.direction,
      }))
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .slice(0, 8)
      .reverse();
  }, [detail]);

  return (
    <>
      <div className="cres-detail-top">
        <div className="cres-detail-prob">
          <div className="cres-prob-bar-large">
            <div
              className="cres-prob-bar-fill"
              style={{ width: `${pct}%`, background: color }}
            />
          </div>
          <p className="cres-detail-prob-text">
            Model says <strong style={{ color }}>{pct}%</strong> chance the case is at
            resolution stage · Human says <strong>{detail.caseStatus}</strong>
          </p>
          <p
            className={`cres-detail-agreement ${
              detail.modelAgreesWithLabel
                ? 'cres-detail-agreement--yes'
                : 'cres-detail-agreement--no'
            }`}
          >
            {detail.modelAgreesWithLabel ? (
              <>
                <Check size={16} aria-hidden="true" /> Model and case manager agree on resolution readiness
              </>
            ) : (
              <>
                <AlertTriangle size={16} aria-hidden="true" /> Model and case manager disagree — review recommended
              </>
            )}
          </p>
        </div>

        <div className="cres-detail-chart">
          <h4 className="cres-detail-chart-title">Feature contributions</h4>
          {contributionData.length > 0 ? (
            <ResponsiveContainer width="100%" debounce={1} height={220}>
              <BarChart
                data={contributionData}
                layout="vertical"
                margin={{ left: 8, right: 16 }}
              >
                <XAxis
                  type="number"
                  stroke="rgba(31,47,63,0.5)"
                  fontSize={11}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="rgba(31,47,63,0.7)"
                  fontSize={10}
                  width={110}
                />
                <ReferenceLine x={0} stroke="rgba(31,47,63,0.3)" />
                <Tooltip
                  formatter={
                    ((value: unknown) => {
                      const num =
                        typeof value === 'number' ? value : Number(value ?? 0);
                      return [num.toFixed(3), 'Contribution'];
                    }) as never
                  }
                  contentStyle={{
                    background: 'rgba(255,253,247,0.96)',
                    border: '1px solid rgba(170,190,208,0.4)',
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="contribution" radius={[4, 4, 4, 4]}>
                  {contributionData.map((entry, i) => (
                    <Cell
                      key={`contrib-${i}`}
                      fill={entry.contribution >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="cres-empty-mini">No feature contribution data.</p>
          )}
        </div>
      </div>

      <div className="cres-stat-grid">
        <div className="cres-stat-col">
          <h4 className="cres-stat-heading">Engagement</h4>
          <StatLine label="Sessions" value={detail.categoryStats.sessions.count} />
          <StatLine
            label="Concerns flagged"
            value={formatPct(detail.categoryStats.sessions.concernsFlaggedRate)}
          />
          <StatLine
            label="Progress noted"
            value={formatPct(detail.categoryStats.sessions.progressNotedRate)}
          />
          <StatLine
            label="Referrals made"
            value={formatPct(detail.categoryStats.sessions.referralMadeRate)}
          />
        </div>

        <div className="cres-stat-col">
          <h4 className="cres-stat-heading">Outcomes</h4>
          <StatLine
            label="Interventions"
            value={detail.categoryStats.interventions.count}
          />
          <StatLine
            label="Achieved rate"
            value={formatPct(detail.categoryStats.interventions.achievedRate)}
          />
          <StatLine
            label="On hold rate"
            value={formatPct(detail.categoryStats.interventions.onHoldRate)}
          />
          <StatLine
            label="Has safety plan"
            value={detail.categoryStats.interventions.hasSafetyPlan ? 'Yes' : 'No'}
          />
        </div>

        <div className="cres-stat-col">
          <h4 className="cres-stat-heading">Stability</h4>
          <StatLine label="Incidents" value={detail.categoryStats.incidents.count} />
          <StatLine
            label="High severity"
            value={detail.categoryStats.incidents.highSeverity}
          />
          <StatLine
            label="Unresolved"
            value={detail.categoryStats.incidents.unresolved}
          />
          <StatLine
            label="Length of stay (days)"
            value={numberFmt.format(detail.lengthOfStayDays)}
          />
        </div>
      </div>

      <div className="cres-detail-actions">
        <Link
          to={`/caseload-inventory/${detail.residentId}`}
          className="cres-detail-link"
        >
          Open full case file →
        </Link>
      </div>
    </>
  );
}

function StatLine({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="cres-stat-line">
      <span className="cres-stat-line-label">{label}</span>
      <span className="cres-stat-line-value">{value}</span>
    </div>
  );
}
