import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import './DonorImpactPage.css';

// =============================================================================
// API types — match the C# DonorImpactController DTOs
// =============================================================================

type DonorBrief = {
  supporterId: number;
  displayName: string;
  supporterType: string;
  country: string;
  donationCount: number;
  totalContributed: number;
  lastDonationDate: string | null;
};

type ProgramAreaSlice = {
  name: string;
  amount: number;
  percent: number;
};

type SafehouseSummary = {
  safehouseId: number;
  name: string;
  city: string;
  province: string;
  country: string;
  amountAllocated: number;
};

type MonthlyContribution = {
  month: string;
  amount: number;
  count: number;
};

type DonorImpactReport = {
  supporterId: number;
  displayName: string;
  supporterType: string;
  country: string;
  region: string;
  totalContributed: number;
  totalAllocated: number;
  donationCount: number;
  firstDonationDate: string | null;
  lastDonationDate: string | null;
  programAreaBreakdown: ProgramAreaSlice[];
  safehousesSupported: SafehouseSummary[];
  monthlyTimeline: MonthlyContribution[];
  avgHealthScore: number | null;
  avgEducationProgress: number | null;
  avgActiveResidents: number | null;
  message?: string;
};

type ResearchCoefficient = {
  variable: string;
  coef: number;
  std_err: number;
  t_stat: number;
  p_value: number;
  ci_lower: number;
  ci_upper: number;
};

type ResearchContext = {
  trained_at_utc: string;
  model: string;
  interpretation: string;
  health: {
    target: string;
    n_obs: number;
    r_squared: number;
    adj_r_squared: number;
    coefficients: ResearchCoefficient[];
  };
  education: {
    target: string;
    n_obs: number;
    r_squared: number;
    adj_r_squared: number;
    coefficients: ResearchCoefficient[];
  };
};

type ImpactModelInfo = {
  donorCount: number;
  healthR2: number;
  educationR2: number;
  nObservations: number;
  trainedAt: string | null;
  modelName: string;
};

// =============================================================================
// Visual constants
// =============================================================================

const PROGRAM_COLORS: Record<string, string> = {
  Health: '#385f82',
  Education: '#c9983f',
  Counseling: '#a05b3a',
  Operations: '#5f8448',
};

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const moneyDecimal = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

function formatMonthLabel(yyyymm: string): string {
  const [yr, mo] = yyyymm.split('-');
  const d = new Date(Number(yr), Number(mo) - 1, 1);
  return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

function prettyVar(v: string): string {
  return v
    .replace(/_lag1$/, '')
    .replace(/donation_to_/, '$ to ')
    .replace(/_/g, ' ')
    .replace(/^\$/, '$')
    .replace(/^./, (c) => c.toUpperCase());
}

// =============================================================================
// Page component
// =============================================================================

export function DonorImpactPage() {
  const [donors, setDonors] = useState<DonorBrief[]>([]);
  const [report, setReport] = useState<DonorImpactReport | null>(null);
  const [research, setResearch] = useState<ResearchContext | null>(null);
  const [modelInfo, setModelInfo] = useState<ImpactModelInfo | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(false);

  // ── Initial load: donor list + research context + model info ──────────
  useEffect(() => {
    const load = async () => {
      try {
        const [donorsRes, researchRes, infoRes] = await Promise.all([
          fetch('/api/donor-impact/donors', { credentials: 'include' }),
          fetch('/api/donor-impact/research-context', { credentials: 'include' }),
          fetch('/api/donor-impact/model-info', { credentials: 'include' }),
        ]);
        if (!donorsRes.ok || !infoRes.ok) {
          throw new Error('Failed to load donor data');
        }
        const donorList: DonorBrief[] = await donorsRes.json();
        setDonors(donorList);
        if (researchRes.ok) {
          const researchData = await researchRes.json();
          if (!researchData?.available || researchData.health) {
            setResearch(researchData);
          }
        }
        const info: ImpactModelInfo = await infoRes.json();
        setModelInfo(info);
        // Auto-select the top donor for an immediate "wow" view
        if (donorList.length > 0) {
          setSelectedId(donorList[0].supporterId);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
        setTimeout(() => setVisible(true), 60);
      }
    };
    load();
  }, []);

  // ── Load report when donor selection changes ──────────────────────────
  useEffect(() => {
    if (selectedId == null) return;
    const loadReport = async () => {
      setReportLoading(true);
      try {
        const res = await fetch(`/api/donor-impact/${selectedId}`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to load impact report');
        const data: DonorImpactReport = await res.json();
        setReport(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setReportLoading(false);
      }
    };
    loadReport();
  }, [selectedId]);

  const filteredDonors = useMemo(
    () =>
      donors.filter(
        (d) =>
          d.displayName.toLowerCase().includes(search.toLowerCase()) ||
          d.country.toLowerCase().includes(search.toLowerCase()),
      ),
    [donors, search],
  );

  // Top donation findings: positive, statistically significant donation→outcome links
  const significantHealthFindings = useMemo(() => {
    if (!research?.health) return [];
    return research.health.coefficients
      .filter((c) => c.variable.startsWith('donation_to_') && c.p_value < 0.10)
      .sort((a, b) => Math.abs(b.t_stat) - Math.abs(a.t_stat));
  }, [research]);

  if (loading) {
    return (
      <div className="impact-loading">
        <div className="impact-spinner" />
        <p>Loading donor impact data…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="impact-error">
        <h2>Couldn’t load impact dashboard</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <section className={`donor-impact-page ${visible ? 'is-visible' : ''}`}>
      {/* ─── Header ───────────────────────────────────────── */}
      <header className="impact-header">
        <span className="impact-overline">Pipeline 5 · Donation Impact Attribution</span>
        <h1 className="impact-title">Where your generosity goes</h1>
        <p className="impact-subtitle">
          Trace every dollar a donor has given through the safehouses they’ve funded — see the
          residents reached, the programs supported, and the outcomes the data shows.
        </p>
        {modelInfo && (
          <p className="impact-model-meta">
            Trained on{' '}
            <strong>{modelInfo.nObservations.toLocaleString()}</strong> safehouse-month
            observations · OLS R² ={' '}
            <strong>{(modelInfo.healthR2 * 100).toFixed(0)}%</strong> for health outcomes
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

      <div className="impact-grid">
        {/* ─── Left rail: donor selector ─────────────────────────── */}
        <aside className="impact-sidebar">
          <div className="impact-sidebar-head">
            <h2>Choose a donor</h2>
            <span className="impact-sidebar-count">{filteredDonors.length}</span>
          </div>
          <input
            type="search"
            placeholder="Search donors…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="impact-search"
          />
          <ul className="impact-donor-list">
            {filteredDonors.map((d) => (
              <li key={d.supporterId}>
                <button
                  type="button"
                  className={`impact-donor-card${
                    selectedId === d.supporterId ? ' is-selected' : ''
                  }`}
                  onClick={() => setSelectedId(d.supporterId)}
                >
                  <div className="impact-donor-card__top">
                    <span className="impact-donor-name">{d.displayName || `Donor #${d.supporterId}`}</span>
                    <span className="impact-donor-amount">{money.format(d.totalContributed)}</span>
                  </div>
                  <div className="impact-donor-card__meta">
                    <span>{d.supporterType || 'Supporter'}</span>
                    <span>·</span>
                    <span>{d.donationCount} gifts</span>
                    {d.country && (
                      <>
                        <span>·</span>
                        <span>{d.country}</span>
                      </>
                    )}
                  </div>
                </button>
              </li>
            ))}
            {filteredDonors.length === 0 && (
              <li className="impact-donor-empty">No donors match your search.</li>
            )}
          </ul>
        </aside>

        {/* ─── Right pane: report ──────────────────────────────── */}
        <div className="impact-report-pane">
          {reportLoading && (
            <div className="impact-report-loading">
              <div className="impact-spinner" />
            </div>
          )}

          {report && !reportLoading && (
            <>
              {/* ── Donor hero ─────────────────────────── */}
              <div className="impact-report-hero">
                <div className="impact-report-hero__text">
                  <span className="impact-report-overline">Personal Impact Report</span>
                  <h2 className="impact-report-name">
                    {report.displayName || `Donor #${report.supporterId}`}
                  </h2>
                  <p className="impact-report-subtitle">
                    {report.supporterType}
                    {report.country && ` · ${report.country}`}
                    {report.region && `, ${report.region}`}
                  </p>
                </div>
                <div className="impact-report-hero__total">
                  <span className="impact-hero-total-label">Total Contributed</span>
                  <span className="impact-hero-total-amount">
                    {moneyDecimal.format(report.totalContributed)}
                  </span>
                  <span className="impact-hero-total-meta">
                    {report.donationCount} gift{report.donationCount === 1 ? '' : 's'}
                    {report.firstDonationDate && (
                      <>
                        {' '}
                        since{' '}
                        {new Date(report.firstDonationDate).toLocaleDateString(undefined, {
                          dateStyle: 'medium',
                        })}
                      </>
                    )}
                  </span>
                </div>
              </div>

              {/* ── Stat cards ─────────────────────────── */}
              <div className="impact-stat-grid">
                <StatCard
                  label="Safehouses Supported"
                  value={report.safehousesSupported.length.toString()}
                  caption={
                    report.safehousesSupported.length > 0
                      ? report.safehousesSupported
                          .slice(0, 2)
                          .map((s) => s.name)
                          .join(', ') +
                        (report.safehousesSupported.length > 2 ? ` +${report.safehousesSupported.length - 2} more` : '')
                      : 'No allocations yet'
                  }
                />
                <StatCard
                  label="Residents in care (avg)"
                  value={
                    report.avgActiveResidents != null
                      ? Math.round(report.avgActiveResidents).toString()
                      : '—'
                  }
                  caption="At funded safehouses, during your support period"
                />
                <StatCard
                  label="Education Progress"
                  value={
                    report.avgEducationProgress != null
                      ? `${report.avgEducationProgress.toFixed(0)}%`
                      : '—'
                  }
                  caption="Avg progress at funded safehouses"
                  accent
                />
                <StatCard
                  label="Health Score (avg)"
                  value={
                    report.avgHealthScore != null ? `${report.avgHealthScore.toFixed(1)} / 5` : '—'
                  }
                  caption="Resident wellbeing at funded safehouses"
                />
              </div>

              {/* ── Charts row ──────────────────────────── */}
              <div className="impact-charts-row">
                {/* Donut: program area allocation */}
                <article className="impact-chart-card">
                  <header>
                    <h3>Where your dollars go</h3>
                    <p>Breakdown by program area</p>
                  </header>
                  {report.programAreaBreakdown.length > 0 ? (
                    <div className="impact-chart-wrap">
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie
                            data={report.programAreaBreakdown}
                            dataKey="amount"
                            nameKey="name"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={2}
                            stroke="rgba(255,255,255,0.6)"
                          >
                            {report.programAreaBreakdown.map((entry) => (
                              <Cell
                                key={entry.name}
                                fill={PROGRAM_COLORS[entry.name] ?? '#7e7468'}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={((value: unknown, _name: unknown, item: { payload?: ProgramAreaSlice }) => {
                              const slice = item?.payload;
                              const num = typeof value === 'number' ? value : Number(value ?? 0);
                              return [
                                `${moneyDecimal.format(num)} (${(slice?.percent ?? 0).toFixed(1)}%)`,
                                slice?.name ?? '',
                              ];
                            }) as never}
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
                            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="impact-empty">No program-area allocation data yet.</p>
                  )}
                </article>

                {/* Line: monthly contribution timeline */}
                <article className="impact-chart-card">
                  <header>
                    <h3>Your giving over time</h3>
                    <p>Monthly contribution timeline</p>
                  </header>
                  {report.monthlyTimeline.length > 0 ? (
                    <div className="impact-chart-wrap">
                      <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={report.monthlyTimeline}>
                          <XAxis
                            dataKey="month"
                            tickFormatter={formatMonthLabel}
                            stroke="rgba(31,47,63,0.5)"
                            fontSize={11}
                          />
                          <YAxis
                            stroke="rgba(31,47,63,0.5)"
                            fontSize={11}
                            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                          />
                          <Tooltip
                            labelFormatter={((label: unknown) =>
                              typeof label === 'string' ? formatMonthLabel(label) : String(label ?? '')) as never}
                            formatter={((value: unknown) => {
                              const num = typeof value === 'number' ? value : Number(value ?? 0);
                              return [moneyDecimal.format(num), 'Contributed'];
                            }) as never}
                            contentStyle={{
                              background: 'rgba(255,253,247,0.96)',
                              border: '1px solid rgba(170,190,208,0.4)',
                              borderRadius: 12,
                              fontSize: 12,
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="amount"
                            stroke="#385f82"
                            strokeWidth={3}
                            dot={{ r: 4, fill: '#c9983f', strokeWidth: 0 }}
                            activeDot={{ r: 6 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="impact-empty">No timeline data.</p>
                  )}
                </article>
              </div>

              {/* ── Safehouses bar chart ─────────────────── */}
              {report.safehousesSupported.length > 0 && (
                <article className="impact-chart-card impact-chart-card--wide">
                  <header>
                    <h3>Safehouses you’ve funded</h3>
                    <p>Total allocated by safehouse</p>
                  </header>
                  <div className="impact-chart-wrap">
                    <ResponsiveContainer width="100%" height={Math.max(200, report.safehousesSupported.length * 42)}>
                      <BarChart
                        data={report.safehousesSupported}
                        layout="vertical"
                        margin={{ left: 20, right: 28 }}
                      >
                        <XAxis
                          type="number"
                          stroke="rgba(31,47,63,0.5)"
                          fontSize={11}
                          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          stroke="rgba(31,47,63,0.7)"
                          fontSize={12}
                          width={140}
                        />
                        <Tooltip
                          formatter={((value: unknown) => {
                            const num = typeof value === 'number' ? value : Number(value ?? 0);
                            return [moneyDecimal.format(num), 'Allocated'];
                          }) as never}
                          labelFormatter={((label: unknown, payload: Array<{ payload?: SafehouseSummary }>) => {
                            const p = payload?.[0]?.payload;
                            const labelStr = String(label ?? '');
                            return p ? `${labelStr} — ${p.city}, ${p.country}` : labelStr;
                          }) as never}
                          contentStyle={{
                            background: 'rgba(255,253,247,0.96)',
                            border: '1px solid rgba(170,190,208,0.4)',
                            borderRadius: 12,
                            fontSize: 12,
                          }}
                        />
                        <Bar dataKey="amountAllocated" fill="#385f82" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </article>
              )}

              {/* ── Research context card ────────────────── */}
              {research && significantHealthFindings.length > 0 && (
                <article className="impact-research-card">
                  <header>
                    <span className="impact-research-overline">📊 What the data shows</span>
                    <h3>Research-backed context</h3>
                    <p>
                      Based on {research.health.n_obs} safehouse-month observations, our OLS model
                      explains {(research.health.r_squared * 100).toFixed(0)}% of the variance in
                      resident health scores.
                    </p>
                  </header>
                  <ul className="impact-research-list">
                    {significantHealthFindings.slice(0, 3).map((c) => {
                      const direction = c.coef > 0 ? 'increase' : 'decrease';
                      const magnitude = Math.abs(c.coef * 1000);
                      const sig =
                        c.p_value < 0.01
                          ? 'highly significant (p < 0.01)'
                          : c.p_value < 0.05
                            ? 'significant (p < 0.05)'
                            : 'marginally significant (p < 0.10)';
                      return (
                        <li key={c.variable}>
                          <strong>{prettyVar(c.variable)}:</strong> Each $1,000 is associated with
                          a {magnitude.toFixed(3)}-point {direction} in average health score (
                          {sig}).
                        </li>
                      );
                    })}
                  </ul>
                  <p className="impact-research-disclaimer">
                    Statistical association — not causal. Many factors influence resident outcomes
                    beyond donations.
                  </p>
                </article>
              )}

              {report.message && (
                <div className="impact-message-banner">{report.message}</div>
              )}
            </>
          )}

          {!report && !reportLoading && (
            <div className="impact-report-empty">
              <p>Select a donor on the left to see their personalized impact report.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function StatCard({
  label,
  value,
  caption,
  accent = false,
}: {
  label: string;
  value: string;
  caption?: string;
  accent?: boolean;
}) {
  return (
    <div className={`impact-stat-card${accent ? ' impact-stat-card--accent' : ''}`}>
      <span className="impact-stat-label">{label}</span>
      <span className="impact-stat-value">{value}</span>
      {caption && <span className="impact-stat-caption">{caption}</span>}
    </div>
  );
}
