import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
import './MyImpactPage.css';
import { useAuth } from '../auth/useAuth';
import { useLanguage } from '../i18n/LanguageContext';

// =============================================================================
// API types — match the C# DonorImpactController DTOs
// =============================================================================

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

export function MyImpactPage() {
  const { t } = useLanguage();
  const { isLoading: authLoading, roles } = useAuth();
  const canViewModelContext = roles.includes('Admin') || roles.includes('Staff');
  const [report, setReport] = useState<DonorImpactReport | null>(null);
  const [research, setResearch] = useState<ResearchContext | null>(null);
  const [modelInfo, setModelInfo] = useState<ImpactModelInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    const load = async () => {
      try {
        const reportRes = await fetch('/api/donor-impact/me', { credentials: 'include' });
        if (!reportRes.ok) {
          const text = await reportRes.text().catch(() => '');
          throw new Error(
            reportRes.status === 404
              ? t('myImpact.errors.notLinked')
              : text || t('myImpact.errors.failedLoad'),
          );
        }
        const data: DonorImpactReport = await reportRes.json();
        setReport(data);

        if (canViewModelContext) {
          const [researchRes, infoRes] = await Promise.all([
            fetch('/api/donor-impact/research-context', { credentials: 'include' }),
            fetch('/api/donor-impact/model-info', { credentials: 'include' }),
          ]);

          if (researchRes.ok) {
            const researchData = await researchRes.json();
            if (!researchData?.available || researchData.health) {
              setResearch(researchData);
            }
          } else {
            setResearch(null);
          }

          if (infoRes.ok) {
            const info: ImpactModelInfo = await infoRes.json();
            setModelInfo(info);
          } else {
            setModelInfo(null);
          }
        } else {
          setResearch(null);
          setModelInfo(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('common.error'));
      } finally {
        setLoading(false);
        setTimeout(() => setVisible(true), 60);
      }
    };
    load();
  }, [authLoading, canViewModelContext, t]);

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
        <p>{t('myImpact.loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="impact-error">
        <h2>{t('myImpact.errors.couldntLoad')}</h2>
        <p>{error}</p>
        <Link to="/donor-dashboard" className="my-impact-back-link">
          {t('myImpact.backToDashboardArrow')}
        </Link>
      </div>
    );
  }

  if (!report) return null;

  return (
    <section className={`donor-impact-page my-impact-page ${visible ? 'is-visible' : ''}`}>
      {/* ─── Back link ──────────────────────────────────────── */}
      <div className="my-impact-nav">
        <Link to="/donor-dashboard" className="my-impact-back-link">
          {t('myImpact.backToDashboard')}
        </Link>
      </div>

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="impact-header">
        <span className="impact-overline">{t('myImpact.overline')}</span>
        <h1 className="impact-title">{t('myImpact.title')}</h1>
        <p className="impact-subtitle">{t('myImpact.subtitle')}</p>
        {modelInfo && (
          <p className="impact-model-meta">
            {t('myImpact.poweredByPre')}{' '}
            <strong>{modelInfo.nObservations.toLocaleString()}</strong>{' '}
            {t('myImpact.poweredByMid')}{' '}
            <strong>{(modelInfo.healthR2 * 100).toFixed(0)}%</strong>{' '}
            {t('myImpact.poweredBySuffix')}
            {modelInfo.trainedAt && (
              <>
                {' · '}
                {t('myImpact.lastRefresh')}{' '}
                {new Date(modelInfo.trainedAt).toLocaleDateString(undefined, {
                  dateStyle: 'medium',
                })}
              </>
            )}
          </p>
        )}
      </header>

      {/* ─── Report content ──────────────────────────────────── */}
      <div className="my-impact-content">
        {/* ── Donor hero ───────────────────────────────────── */}
        <div className="impact-report-hero">
          <div className="impact-report-hero__text">
            <span className="impact-report-overline">{t('donorImpact.personalReport')}</span>
            <h2 className="impact-report-name">
              {report.displayName || `${t('donorImpact.donorPrefix')} #${report.supporterId}`}
            </h2>
            <p className="impact-report-subtitle">
              {report.supporterType}
              {report.country && ` · ${report.country}`}
              {report.region && `, ${report.region}`}
            </p>
          </div>
          <div className="impact-report-hero__total">
            <span className="impact-hero-total-label">{t('donorImpact.totalContributed')}</span>
            <span className="impact-hero-total-amount">
              {moneyDecimal.format(report.totalContributed)}
            </span>
            <span className="impact-hero-total-meta">
              {report.donationCount} {report.donationCount === 1 ? t('donorImpact.gift') : t('donorImpact.gifts')}
              {report.firstDonationDate && (
                <>
                  {' '}
                  {t('donorImpact.since')}{' '}
                  {new Date(report.firstDonationDate).toLocaleDateString(undefined, {
                    dateStyle: 'medium',
                  })}
                </>
              )}
            </span>
          </div>
        </div>

        {/* ── Stat cards ───────────────────────────────────── */}
        <div className="impact-stat-grid">
          <StatCard
            label={t('donorImpact.stat.safehousesSupported')}
            value={report.safehousesSupported.length.toString()}
            caption={
              report.safehousesSupported.length > 0
                ? report.safehousesSupported
                    .slice(0, 2)
                    .map((s) => s.name)
                    .join(', ') +
                  (report.safehousesSupported.length > 2
                    ? ` +${report.safehousesSupported.length - 2} ${t('donorImpact.more')}`
                    : '')
                : t('donorImpact.stat.noAllocations')
            }
          />
          <StatCard
            label={t('donorImpact.stat.residentsInCare')}
            value={
              report.avgActiveResidents != null
                ? Math.round(report.avgActiveResidents).toString()
                : '—'
            }
            caption={t('donorImpact.stat.residentsCaption')}
          />
          <StatCard
            label={t('donorImpact.stat.educationProgress')}
            value={
              report.avgEducationProgress != null
                ? `${report.avgEducationProgress.toFixed(0)}%`
                : '—'
            }
            caption={t('donorImpact.stat.educationCaption')}
            accent
          />
          <StatCard
            label={t('donorImpact.stat.healthScore')}
            value={
              report.avgHealthScore != null
                ? `${report.avgHealthScore.toFixed(1)} / 5`
                : '—'
            }
            caption={t('donorImpact.stat.healthCaption')}
          />
        </div>

        {/* ── Charts row ───────────────────────────────────── */}
        <div className="impact-charts-row">
          {/* Donut: program area allocation */}
          <article className="impact-chart-card">
            <header>
              <h3>{t('donorImpact.whereDollarsGo')}</h3>
              <p>{t('donorImpact.breakdownByArea')}</p>
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
              <p className="impact-empty">{t('donorImpact.empty.programArea')}</p>
            )}
          </article>

          {/* Line: monthly contribution timeline */}
          <article className="impact-chart-card">
            <header>
              <h3>{t('donorImpact.givingOverTime')}</h3>
              <p>{t('donorImpact.monthlyTimeline')}</p>
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
                        return [moneyDecimal.format(num), t('donorImpact.contributed')];
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
              <p className="impact-empty">{t('donorImpact.empty.timeline')}</p>
            )}
          </article>
        </div>

        {/* ── Safehouses bar chart ──────────────────────────── */}
        {report.safehousesSupported.length > 0 && (
          <article className="impact-chart-card impact-chart-card--wide">
            <header>
              <h3>{t('donorImpact.safehousesFunded')}</h3>
              <p>{t('donorImpact.totalAllocatedBySafehouse')}</p>
            </header>
            <div className="impact-chart-wrap">
              <ResponsiveContainer
                width="100%"
                height={Math.max(200, report.safehousesSupported.length * 42)}
              >
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
                      return [moneyDecimal.format(num), t('donorImpact.allocated')];
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

        {/* ── Research context card ─────────────────────────── */}
        {research && significantHealthFindings.length > 0 && (
          <article className="impact-research-card">
            <header>
              <span className="impact-research-overline">{t('donorImpact.research.overline')}</span>
              <h3>{t('donorImpact.research.heading')}</h3>
              <p>
                {t('donorImpact.research.basedOnPre')} {research.health.n_obs}{' '}
                {t('donorImpact.research.basedOnMid')}{' '}
                {(research.health.r_squared * 100).toFixed(0)}%{' '}
                {t('donorImpact.research.basedOnSuffix')}
              </p>
            </header>
            <ul className="impact-research-list">
              {significantHealthFindings.slice(0, 3).map((c) => {
                const direction = c.coef > 0 ? t('donorImpact.research.increase') : t('donorImpact.research.decrease');
                const magnitude = Math.abs(c.coef * 1000);
                const sig =
                  c.p_value < 0.01
                    ? t('donorImpact.research.highlySig')
                    : c.p_value < 0.05
                      ? t('donorImpact.research.sig')
                      : t('donorImpact.research.marginalSig');
                return (
                  <li key={c.variable}>
                    <strong>{prettyVar(c.variable)}:</strong> {t('donorImpact.research.each1000Pre')}{' '}
                    {magnitude.toFixed(3)}{t('donorImpact.research.each1000Mid')} {direction}{' '}
                    {t('donorImpact.research.each1000Suffix')} ({sig}).
                  </li>
                );
              })}
            </ul>
            <p className="impact-research-disclaimer">{t('donorImpact.research.disclaimer')}</p>
          </article>
        )}

        {report.message && (
          <div className="impact-message-banner">{report.message}</div>
        )}

        {/* ── No donations state ────────────────────────────── */}
        {report.donationCount === 0 && (
          <div className="my-impact-no-donations">
            <p>{t('myImpact.noDonations')}</p>
            <Link to="/donor-dashboard" className="my-impact-back-link">
              {t('myImpact.makeFirstGift')}
            </Link>
          </div>
        )}

        {/* ── CTA to full admin view (admin/staff only shown via role) ── */}
        <div className="my-impact-footer">
          <Link to="/donor-dashboard" className="my-impact-back-link">
            {t('myImpact.backToDashboardArrow')}
          </Link>
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
