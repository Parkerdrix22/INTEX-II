import { useEffect, useMemo, useState } from 'react';
import {
  donorsContributionsApi,
  type DonorsContributionsDashboard,
} from '../lib/api';

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function formatPhp(value: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
}

type DonorTab = 'supporters' | 'contributions' | 'allocations' | 'activity';

export function DonorsContributionsPage() {
  const [activeTab, setActiveTab] = useState<DonorTab>('supporters');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DonorsContributionsDashboard | null>(null);
  const [animatedSummary, setAnimatedSummary] = useState({
    activeSupporters: 0,
    newThisMonth: 0,
    contributionsMtd: 0,
    totalContributions: 0,
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await donorsContributionsApi.dashboard();
        setDashboard(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load donors and contributions.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const supporters = dashboard?.supporters ?? [];
  const contributions = dashboard?.contributions ?? [];
  const allocations = dashboard?.allocations ?? [];
  const activityLog = dashboard?.activity ?? [];
  const summary = useMemo(
    () => ({
      activeSupporters: dashboard?.summary.activeSupporters ?? 0,
      newThisMonth: dashboard?.summary.newThisMonth ?? 0,
      contributionsMtd: dashboard?.summary.contributionsMtd ?? 0,
      totalContributions: dashboard?.summary.totalContributions ?? 0,
    }),
    [dashboard],
  );

  useEffect(() => {
    const durationMs = 900;
    const start = performance.now();
    const initial = { ...animatedSummary };
    let rafId = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      setAnimatedSummary({
        activeSupporters: Math.round(
          initial.activeSupporters + (summary.activeSupporters - initial.activeSupporters) * progress,
        ),
        newThisMonth: Math.round(initial.newThisMonth + (summary.newThisMonth - initial.newThisMonth) * progress),
        contributionsMtd:
          initial.contributionsMtd + (summary.contributionsMtd - initial.contributionsMtd) * progress,
        totalContributions:
          initial.totalContributions + (summary.totalContributions - initial.totalContributions) * progress,
      });
      if (progress < 1) rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [summary]);

  const supporterTypes = Array.from(new Set(supporters.map((row) => row.supporterType))).sort();
  const supporterStatuses = Array.from(new Set(supporters.map((row) => row.status))).sort();

  const filteredSupporters = supporters.filter((row) => {
    if (typeFilter !== 'All' && row.supporterType !== typeFilter) return false;
    if (statusFilter !== 'All' && row.status !== statusFilter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [row.displayName, row.supporterType, row.status].join(' ').toLowerCase().includes(q);
  });

  return (
    <section className="donors-contributions-page">
      <header className="donors-page-header">
        <h1>Donors &amp; Contributions</h1>
        <p className="auth-lead">
          Staff workspace for supporter management, contribution logging, allocation tracking, and activity review.
        </p>
      </header>

      <section className="donor-summary-grid" aria-label="Summary metrics">
        <article className="stat-card">
          <p className="metric-label">Active supporters</p>
          <p className="metric-value">{animatedSummary.activeSupporters}+</p>
        </article>
        <article className="stat-card">
          <p className="metric-label">New this month</p>
          <p className="metric-value">{animatedSummary.newThisMonth}+</p>
        </article>
        <article className="stat-card">
          <p className="metric-label">Contributions (MTD)</p>
          <p className="metric-value">{formatPhp(animatedSummary.contributionsMtd)}</p>
        </article>
        <article className="stat-card">
          <p className="metric-label">Total contributions</p>
          <p className="metric-value">{formatPhp(animatedSummary.totalContributions)}</p>
        </article>
      </section>
      {loading && <p className="donor-inline-message">Loading donor dashboard...</p>}
      {error && <p className="error-text donor-inline-message">{error}</p>}

      <article className="auth-card donor-workspace-card">
        <div className="donor-tabs" role="tablist" aria-label="Donor management sections">
          <button type="button" role="tab" aria-selected={activeTab === 'supporters'} className={`donor-tab${activeTab === 'supporters' ? ' donor-tab--active' : ''}`} onClick={() => setActiveTab('supporters')}>
            Supporters
          </button>
          <button type="button" role="tab" aria-selected={activeTab === 'contributions'} className={`donor-tab${activeTab === 'contributions' ? ' donor-tab--active' : ''}`} onClick={() => setActiveTab('contributions')}>
            Contributions
          </button>
          <button type="button" role="tab" aria-selected={activeTab === 'allocations'} className={`donor-tab${activeTab === 'allocations' ? ' donor-tab--active' : ''}`} onClick={() => setActiveTab('allocations')}>
            Allocations
          </button>
          <button type="button" role="tab" aria-selected={activeTab === 'activity'} className={`donor-tab${activeTab === 'activity' ? ' donor-tab--active' : ''}`} onClick={() => setActiveTab('activity')}>
            Activity Log
          </button>
        </div>

        {!loading && !error && activeTab === 'supporters' && (
          <section className="donor-tab-panel">
            <div className="donor-toolbar">
              <input
                type="text"
                placeholder="Search supporter name/type/status"
                aria-label="Search supporters"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <select
                aria-label="Filter by supporter type"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
              >
                <option value="All">All types</option>
                {supporterTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="All">All statuses</option>
                {supporterStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <button type="button">+ Add supporter</button>
            </div>

            <div className="donor-table-wrap">
              <table className="donor-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Last contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSupporters.map((row) => (
                    <tr key={row.id}>
                      <td>{row.displayName}</td>
                      <td>{row.supporterType}</td>
                      <td>{row.status}</td>
                      <td>{formatDate(row.createdAt)}</td>
                      <td>{formatDate(row.lastDonationAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredSupporters.length === 0 && (
              <p className="donor-inline-message">No supporters match the current filters.</p>
            )}
          </section>
        )}

        {!loading && !error && activeTab === 'contributions' && (
          <section className="donor-tab-panel">
            <div className="donor-form-grid">
              <div>
                <h2>Record contribution</h2>
                <form className="donor-entry-form">
                  <label>Supporter<input type="text" placeholder="Search or enter supporter" /></label>
                  <label>Contribution type<select><option>Monetary</option><option>In-kind</option><option>Time</option><option>Skills</option><option>Social media</option></select></label>
                  <label>Amount / Hours / Units<input type="text" placeholder="e.g., PHP 50,000 / 12 hours / 120 kits" /></label>
                  <label>Program area<select><option>Caring</option><option>Healing</option><option>Teaching</option></select></label>
                  <button type="button">Save entry</button>
                </form>
              </div>
              <div className="donor-table-wrap">
                <table className="donor-table">
                  <thead>
                    <tr><th>Date</th><th>Supporter</th><th>Type</th><th>Amount</th><th>Channel</th><th>Program</th></tr>
                  </thead>
                  <tbody>
                    {contributions.map((row) => (
                      <tr key={row.id}>
                        <td>{formatDate(row.donationDate)}</td><td>{row.supporterName}</td><td>{row.donationType}</td><td>{formatPhp(row.estimatedValue ?? 0)}</td><td>{row.campaignName ?? '—'}</td><td>—</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {!loading && !error && activeTab === 'allocations' && (
          <section className="donor-tab-panel">
            <h2>Allocation snapshot</h2>
            <p className="auth-lead">Allocation percentages based on recorded donation allocations per safehouse.</p>
            <div className="donor-table-wrap">
              <table className="donor-table">
                <thead><tr><th>Area</th><th>Caring</th><th>Healing</th><th>Teaching</th></tr></thead>
                <tbody>
                  {allocations.map((row) => (
                    <tr key={row.area}><td>{row.area}</td><td>{row.caringPct}%</td><td>{row.healingPct}%</td><td>{row.teachingPct}%</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {!loading && !error && activeTab === 'activity' && (
          <section className="donor-tab-panel">
            <h2>Activity log</h2>
            <ul className="donor-activity-list">
              {activityLog.map((row) => (
                <li key={`${row.at ?? ''}-${row.action}-${row.details}`} className="donor-activity-item">
                  <p><strong>{row.action}</strong> - {row.details}</p>
                  <p className="metric-label">{formatDate(row.at)}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </section>
  );
}
