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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import './ResidentRiskPage.css';

// =============================================================================
// API types — must match the C# ResidentRiskController DTOs exactly
// =============================================================================

type ResidentRiskItem = {
  residentId: number;
  caseControlNo: string;
  internalCode: string;
  caseStatus: string;
  caseCategory: string;
  currentRiskLevel: string;
  initialRiskLevel: string;
  reintegrationStatus: string;
  safehouseId: number | null;
  safehouseName: string;
  assignedSocialWorker: string;
  dateOfAdmission: string | null;
  dateClosed: string | null;

  predictedHighRiskProbability: number;
  predictedRiskBand: string;
  modelAgreesWithLabel: boolean;

  ageAtIntake: number;
  lengthOfStayDays: number;
  incidentCount: number;
  highSeverityIncidents: number;
  selfHarmIncidents: number;
  runawayIncidents: number;
  unresolvedIncidents: number;
  meanHealthScore: number;
  negativeEndStateRate: number;
  safetyConcernsRate: number;
  sessionCount: number;

  topRiskFactors: string[];
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

type FeatureBreakdownItem = {
  name: string;
  displayName: string;
  value: number;
  category: string;
};

type DetailedResidentRisk = ResidentRiskItem & {
  categoryStats: CategoryStats;
  featureBreakdown: FeatureBreakdownItem[];
};

type ModelInfo = {
  residentCount: number;
  rocAuc: number;
  trainedAt: string | null;
  modelName: string;
  nFeatures: number;
  nPositives: number;
};

type RiskBand = 'All' | 'Critical' | 'High' | 'Medium' | 'Low';
type SortKey = 'riskScore' | 'riskBand' | 'caseNo' | 'incidents';

// =============================================================================
// Visual constants
// =============================================================================

const BAND_COLORS: Record<string, string> = {
  Low: '#5f8448',
  Medium: '#c9983f',
  High: '#a63d40',
  Critical: '#7a1c20',
};

const BAND_BG: Record<string, string> = {
  Low: 'rgba(95, 132, 72, 0.15)',
  Medium: 'rgba(201, 152, 63, 0.15)',
  High: 'rgba(166, 61, 64, 0.15)',
  Critical: 'rgba(122, 28, 32, 0.18)',
};

const BAND_SORT: Record<string, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

const CATEGORY_COLORS: Record<string, string> = {
  Incidents: '#a63d40',
  Sessions: '#385f82',
  'Home Visits': '#c9983f',
  Interventions: '#5f8448',
};

const numberFmt = new Intl.NumberFormat('en-US');

const formatPct = (value: number): string => `${Math.round(value * 100)}%`;

const bandColor = (band: string): string => BAND_COLORS[band] ?? '#4a5b66';

// =============================================================================
// Page component
// =============================================================================

export function ResidentRiskPage() {
  const [residents, setResidents] = useState<ResidentRiskItem[]>([]);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  const [search, setSearch] = useState('');
  const [bandFilter, setBandFilter] = useState<RiskBand>('All');
  const [sortBy, setSortBy] = useState<SortKey>('riskScore');

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailCache, setDetailCache] = useState<Record<number, DetailedResidentRisk>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  // ── Initial fetch ──────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const [dashRes, infoRes] = await Promise.all([
          fetch('/api/resident-risk/dashboard', { credentials: 'include' }),
          fetch('/api/resident-risk/model-info', { credentials: 'include' }),
        ]);
        if (!dashRes.ok || !infoRes.ok) {
          throw new Error('Failed to load resident risk data');
        }
        const dashData: ResidentRiskItem[] = await dashRes.json();
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
      if (bandFilter !== 'All' && r.predictedRiskBand !== bandFilter) return false;
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
        case 'riskScore':
          return b.predictedHighRiskProbability - a.predictedHighRiskProbability;
        case 'riskBand': {
          const diff =
            (BAND_SORT[a.predictedRiskBand] ?? 9) - (BAND_SORT[b.predictedRiskBand] ?? 9);
          return diff !== 0
            ? diff
            : b.predictedHighRiskProbability - a.predictedHighRiskProbability;
        }
        case 'caseNo':
          return a.caseControlNo.localeCompare(b.caseControlNo);
        case 'incidents':
          return b.incidentCount - a.incidentCount;
        default:
          return 0;
      }
    });
    return sorted;
  }, [residents, search, bandFilter, sortBy]);

  const summary = useMemo(() => {
    const total = residents.length;
    const highCount = residents.filter(
      (r) => r.predictedRiskBand === 'High' || r.predictedRiskBand === 'Critical',
    ).length;
    const agreeCount = residents.filter((r) => r.modelAgreesWithLabel).length;
    const agreementPct = total === 0 ? 0 : agreeCount / total;
    return { total, highCount, agreementPct };
  }, [residents]);

  const distribution = useMemo(() => {
    const bands: Array<'Critical' | 'High' | 'Medium' | 'Low'> = [
      'Critical',
      'High',
      'Medium',
      'Low',
    ];
    return bands
      .map((name) => ({
        name,
        value: residents.filter((r) => r.predictedRiskBand === name).length,
      }))
      .filter((slice) => slice.value > 0);
  }, [residents]);

  const handleToggle = async (resident: ResidentRiskItem) => {
    if (expandedId === resident.residentId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(resident.residentId);
    setDetailError(null);
    if (detailCache[resident.residentId]) return;
    setDetailLoadingId(resident.residentId);
    try {
      const res = await fetch(`/api/resident-risk/${resident.residentId}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load detailed risk profile');
      const data: DetailedResidentRisk = await res.json();
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
      <div className="rrisk-loading">
        <div className="rrisk-spinner" />
        <p>Loading Resident Risk Triage…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rrisk-error">
        <h2>Couldn’t load risk dashboard</h2>
        <p>{error}</p>
        <p className="rrisk-error-hint">
          Try refreshing the page. If the problem persists, contact the system administrator.
        </p>
      </div>
    );
  }

  return (
    <section className={`rrisk-page ${visible ? 'is-visible' : ''}`}>
      {/* ── Header ───────────────────────────────────────── */}
      <header className="rrisk-header">
        <h1 className="rrisk-title">Resident Risk Triage</h1>
        <p className="rrisk-subtitle">
          Identify residents who need immediate case manager attention. Powered by a Random
          Forest classifier trained on health, education, incident, and session data.
        </p>
        {modelInfo && (
          <p className="rrisk-meta">
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
      <div className="rrisk-summary-row">
        <div className="rrisk-summary-cards">
          <SummaryCard
            label="Total residents"
            value={numberFmt.format(summary.total)}
            color="#385f82"
            visible={visible}
            delay={0}
          />
          <SummaryCard
            label="High-risk flagged"
            value={numberFmt.format(summary.highCount)}
            color="#a63d40"
            visible={visible}
            delay={1}
          />
          <SummaryCard
            label="Model agreement"
            value={`${(summary.agreementPct * 100).toFixed(0)}%`}
            color="#5f8448"
            visible={visible}
            delay={2}
          />
          <SummaryCard
            label="ROC-AUC"
            value={modelInfo ? `${(modelInfo.rocAuc * 100).toFixed(0)}%` : '—'}
            color="#c9983f"
            visible={visible}
            delay={3}
          />
        </div>

        <div className="rrisk-distribution-card">
          <h3 className="rrisk-distribution-title">Risk distribution</h3>
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
                    <Cell key={slice.name} fill={BAND_COLORS[slice.name] ?? '#7e7468'} />
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
            <p className="rrisk-empty-mini">No risk band data.</p>
          )}
        </div>
      </div>

      {/* ── Controls row ─────────────────────────────────── */}
      <div className="rrisk-controls">
        <div className="rrisk-search-wrap">
          <svg
            className="rrisk-search-icon"
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
            className="rrisk-search"
            type="text"
            placeholder="Search by case #, code, safehouse, or social worker…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="rrisk-filter-group">
          {(['All', 'Critical', 'High', 'Medium', 'Low'] as RiskBand[]).map((band) => (
            <button
              key={band}
              type="button"
              className={`rrisk-filter-btn ${
                bandFilter === band ? 'rrisk-filter-btn--active' : ''
              }`}
              onClick={() => setBandFilter(band)}
            >
              {band !== 'All' && (
                <span
                  className="rrisk-filter-dot"
                  style={{ background: bandColor(band) }}
                />
              )}
              {band}
            </button>
          ))}
        </div>

        <div className="rrisk-sort-wrap">
          <label className="rrisk-sort-label">Sort by</label>
          <select
            className="rrisk-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
          >
            <option value="riskScore">Risk score</option>
            <option value="riskBand">Risk band</option>
            <option value="caseNo">Case #</option>
            <option value="incidents">Most incidents</option>
          </select>
        </div>
      </div>

      {/* ── Resident list ────────────────────────────────── */}
      <div className="rrisk-list">
        {filtered.length === 0 && (
          <div className="rrisk-empty">No residents match your filters.</div>
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

      <p className="rrisk-disclaimer">
        Predictions generated by a Random Forest classifier
        {modelInfo && (
          <>
            {' '}
            (ROC-AUC = {(modelInfo.rocAuc * 100).toFixed(0)}%) trained on{' '}
            {numberFmt.format(modelInfo.nFeatures)} features across{' '}
            {numberFmt.format(modelInfo.residentCount)} resident profiles
          </>
        )}
        . Risk scores update nightly. Use as a triage aid, not a substitute for professional
        judgment.
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
      className={`rrisk-summary-card ${visible ? 'rrisk-summary-card--visible' : ''}`}
      style={{ transitionDelay: `${delay * 70}ms`, borderTopColor: color }}
    >
      <span className="rrisk-summary-value" style={{ color }}>
        {value}
      </span>
      <span className="rrisk-summary-label">{label}</span>
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
  resident: ResidentRiskItem;
  index: number;
  visible: boolean;
  expanded: boolean;
  detail: DetailedResidentRisk | undefined;
  detailLoading: boolean;
  detailError: string | null;
  onToggle: () => void;
}) {
  const color = bandColor(resident.predictedRiskBand);
  const pct = Math.round(resident.predictedHighRiskProbability * 100);
  const bandBg =
    BAND_BG[resident.predictedRiskBand] ?? 'rgba(74, 91, 102, 0.12)';

  return (
    <div
      className={`rrisk-card ${visible ? 'rrisk-card--visible' : ''} ${
        expanded ? 'rrisk-card--expanded' : ''
      }`}
      style={{ transitionDelay: `${Math.min(index, 18) * 35}ms` }}
    >
      <button type="button" className="rrisk-card-row" onClick={onToggle}>
        <div className="rrisk-card-stripe" style={{ background: color }} />

        <div className="rrisk-card-info">
          <div className="rrisk-card-top">
            <span className="rrisk-card-case">{resident.caseControlNo}</span>
            <span className="rrisk-card-code">{resident.internalCode}</span>
            <span
              className="rrisk-band-badge"
              style={{ background: bandBg, color }}
            >
              {resident.predictedRiskBand}
            </span>
            {resident.modelAgreesWithLabel ? (
              <span className="rrisk-agree rrisk-agree--yes" title="Model agrees with current human label">
                <Check size={14} aria-hidden="true" /> agrees
              </span>
            ) : (
              <span className="rrisk-agree rrisk-agree--no" title="Model disagrees with current human label">
                <AlertTriangle size={14} aria-hidden="true" /> disagrees
              </span>
            )}
          </div>
          <div className="rrisk-card-meta">
            <span>{resident.safehouseName || 'Unassigned safehouse'}</span>
            <span className="rrisk-meta-sep" />
            <span>SW: {resident.assignedSocialWorker || '—'}</span>
            <span className="rrisk-meta-sep" />
            <span>{resident.caseStatus}</span>
          </div>
          {resident.topRiskFactors.length > 0 && (
            <div className="rrisk-factor-row">
              {resident.topRiskFactors.slice(0, 4).map((f) => (
                <span key={f} className="rrisk-factor-chip">
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="rrisk-prob-area">
          <span className="rrisk-prob-pct" style={{ color }}>
            {pct}%
          </span>
          <div className="rrisk-prob-track">
            <div
              className="rrisk-prob-fill"
              style={{ width: `${pct}%`, background: color }}
            />
          </div>
          <span className="rrisk-prob-label">high-risk probability</span>
        </div>

        <div className={`rrisk-chevron ${expanded ? 'rrisk-chevron--open' : ''}`}>
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
        <div className="rrisk-detail">
          {detailLoading && (
            <div className="rrisk-detail-loading">
              <div className="rrisk-spinner rrisk-spinner--small" />
              <span>Loading detailed risk profile…</span>
            </div>
          )}

          {detailError && !detailLoading && (
            <div className="rrisk-detail-error">{detailError}</div>
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
  detail: DetailedResidentRisk;
  color: string;
  pct: number;
}) {
  const categoryData = useMemo(
    () => [
      { name: 'Incidents', value: detail.categoryStats.incidents.count },
      { name: 'Sessions', value: detail.categoryStats.sessions.count },
      { name: 'Home Visits', value: detail.categoryStats.homeVisits.count },
      { name: 'Interventions', value: detail.categoryStats.interventions.count },
    ],
    [detail],
  );

  return (
    <>
      <div className="rrisk-detail-top">
        <div className="rrisk-detail-prob">
          <div className="rrisk-prob-bar-large">
            <div
              className="rrisk-prob-bar-fill"
              style={{ width: `${pct}%`, background: color }}
            />
          </div>
          <p className="rrisk-detail-prob-text">
            Model says <strong style={{ color }}>{pct}%</strong> chance of high risk · Human
            says <strong>{detail.currentRiskLevel}</strong>
          </p>
          <p
            className={`rrisk-detail-agreement ${
              detail.modelAgreesWithLabel
                ? 'rrisk-detail-agreement--yes'
                : 'rrisk-detail-agreement--no'
            }`}
          >
            {detail.modelAgreesWithLabel ? (
              <>
                <Check size={16} aria-hidden="true" /> Model and case manager agree on risk level
              </>
            ) : (
              <>
                <AlertTriangle size={16} aria-hidden="true" /> Model and case manager disagree — review recommended
              </>
            )}
          </p>
        </div>

        <div className="rrisk-detail-chart">
          <h4 className="rrisk-detail-chart-title">Activity by category</h4>
          <ResponsiveContainer width="100%" debounce={1} height={170}>
            <BarChart data={categoryData} layout="vertical" margin={{ left: 8, right: 16 }}>
              <XAxis
                type="number"
                stroke="rgba(31,47,63,0.5)"
                fontSize={11}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                stroke="rgba(31,47,63,0.7)"
                fontSize={11}
                width={88}
              />
              <Tooltip
                formatter={
                  ((value: unknown) => {
                    const num = typeof value === 'number' ? value : Number(value ?? 0);
                    return [numberFmt.format(num), 'Count'];
                  }) as never
                }
                contentStyle={{
                  background: 'rgba(255,253,247,0.96)',
                  border: '1px solid rgba(170,190,208,0.4)',
                  borderRadius: 12,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                {categoryData.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={CATEGORY_COLORS[entry.name] ?? '#7e7468'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rrisk-stat-grid">
        <div className="rrisk-stat-col">
          <h4 className="rrisk-stat-heading">Incidents</h4>
          <StatLine label="Total" value={detail.categoryStats.incidents.count} />
          <StatLine
            label="High severity"
            value={detail.categoryStats.incidents.highSeverity}
          />
          <StatLine
            label="Self-harm"
            value={detail.categoryStats.incidents.selfHarm}
          />
          <StatLine label="Runaway" value={detail.categoryStats.incidents.runaway} />
          <StatLine
            label="Unresolved"
            value={detail.categoryStats.incidents.unresolved}
          />
        </div>

        <div className="rrisk-stat-col">
          <h4 className="rrisk-stat-heading">Health & Education</h4>
          <StatLine
            label="Mean health score"
            value={detail.categoryStats.health.meanScore.toFixed(2)}
          />
          <StatLine
            label="Health trend"
            value={
              detail.categoryStats.health.trend > 0
                ? `+${detail.categoryStats.health.trend.toFixed(2)}`
                : detail.categoryStats.health.trend.toFixed(2)
            }
          />
          <StatLine
            label="Mean attendance"
            value={formatPct(detail.categoryStats.education.meanAttendance)}
          />
          <StatLine
            label="Mean progress"
            value={formatPct(detail.categoryStats.education.meanProgress)}
          />
          <StatLine
            label="Latest progress"
            value={formatPct(detail.categoryStats.education.latestProgress)}
          />
        </div>

        <div className="rrisk-stat-col">
          <h4 className="rrisk-stat-heading">Engagement</h4>
          <StatLine label="Sessions" value={detail.categoryStats.sessions.count} />
          <StatLine
            label="Concerns flagged"
            value={formatPct(detail.categoryStats.sessions.concernsFlaggedRate)}
          />
          <StatLine
            label="Safety concerns"
            value={formatPct(detail.categoryStats.homeVisits.safetyConcernsRate)}
          />
          <StatLine
            label="Family cooperation"
            value={formatPct(
              1 - detail.categoryStats.homeVisits.uncooperativeFamilyRate,
            )}
          />
          <StatLine
            label="Has safety plan"
            value={detail.categoryStats.interventions.hasSafetyPlan ? 'Yes' : 'No'}
          />
        </div>
      </div>

      <div className="rrisk-detail-actions">
        <Link
          to={`/caseload-inventory/${detail.residentId}`}
          className="rrisk-detail-link"
        >
          Open full case file →
        </Link>
      </div>
    </>
  );
}

function StatLine({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rrisk-stat-line">
      <span className="rrisk-stat-line-label">{label}</span>
      <span className="rrisk-stat-line-value">{value}</span>
    </div>
  );
}
