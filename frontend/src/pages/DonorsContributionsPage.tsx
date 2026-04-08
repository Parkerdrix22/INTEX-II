import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  donorsContributionsApi,
  type DonorsContributionsDashboard,
} from '../lib/api';
import heroImage from '../background.jpg?format=webp&quality=82&w=1920';

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function monthLabel(value: string): string {
  const [year, month] = value.split('-').map(Number);
  if (!year || !month) return value;
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'short',
    year: '2-digit',
  });
}

type DonorTab = 'supporters' | 'contributions' | 'allocations' | 'activity';

export function DonorsContributionsPage() {
  const navigate = useNavigate();
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
  const [showAddSupporterModal, setShowAddSupporterModal] = useState(false);
  const [savingSupporter, setSavingSupporter] = useState(false);
  const [supporterError, setSupporterError] = useState<string | null>(null);
  const [supporterForm, setSupporterForm] = useState({
    supporterType: 'MonetaryDonor',
    displayName: '',
    organizationName: '',
    firstName: '',
    lastName: '',
    relationshipType: 'Local',
    region: 'Luzon',
    country: 'Philippines',
    email: '',
    phone: '',
    status: 'Active',
    createdAt: new Date().toISOString().slice(0, 10),
    firstDonationDate: '',
    acquisitionChannel: 'Website',
  });

  const loadDashboard = async () => {
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

  useEffect(() => {
    void loadDashboard();
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
  const contributionsOverTime = useMemo(() => {
    const buckets = new Map<string, number>();
    contributions.forEach((row) => {
      if (!row.donationDate) return;
      const date = new Date(row.donationDate);
      if (Number.isNaN(date.getTime())) return;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      buckets.set(key, (buckets.get(key) ?? 0) + (row.estimatedValue ?? 0));
    });
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, label: monthLabel(month), amount: Math.round(amount) }));
  }, [contributions]);

  const resetSupporterForm = () => {
    setSupporterForm({
      supporterType: 'MonetaryDonor',
      displayName: '',
      organizationName: '',
      firstName: '',
      lastName: '',
      relationshipType: 'Local',
      region: 'Luzon',
      country: 'Philippines',
      email: '',
      phone: '',
      status: 'Active',
      createdAt: new Date().toISOString().slice(0, 10),
      firstDonationDate: '',
      acquisitionChannel: 'Website',
    });
    setSupporterError(null);
  };

  const handleSaveSupporter = async () => {
    setSavingSupporter(true);
    setSupporterError(null);
    try {
      await donorsContributionsApi.createSupporter({
        supporterType: supporterForm.supporterType,
        displayName: supporterForm.displayName || undefined,
        organizationName: supporterForm.organizationName || undefined,
        firstName: supporterForm.firstName || undefined,
        lastName: supporterForm.lastName || undefined,
        relationshipType: supporterForm.relationshipType,
        region: supporterForm.region,
        country: supporterForm.country,
        email: supporterForm.email || undefined,
        phone: supporterForm.phone || undefined,
        status: supporterForm.status,
        createdAt: supporterForm.createdAt || undefined,
        firstDonationDate: supporterForm.firstDonationDate || undefined,
        acquisitionChannel: supporterForm.acquisitionChannel,
      });
      setShowAddSupporterModal(false);
      resetSupporterForm();
      await loadDashboard();
    } catch (err) {
      setSupporterError(err instanceof Error ? err.message : 'Failed to create supporter.');
    } finally {
      setSavingSupporter(false);
    }
  };

  return (
    <section className="donors-contributions-page kateri-landing-section">
      <header className="kateri-photo-hero">
        <div
          className="kateri-photo-hero__media"
          style={{ backgroundImage: `url(${heroImage})` }}
          aria-hidden={true}
        />
        <div className="kateri-photo-hero__scrim" aria-hidden={true} />
        <div className="kateri-photo-hero__inner">
          <h1 className="kateri-photo-hero__title">Donors &amp; Contributions</h1>
          <p className="kateri-photo-hero__lead">
            Staff workspace for supporter management, contribution logging, allocation tracking, and activity review.
          </p>
        </div>
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
          <p className="metric-value">{formatUsd(animatedSummary.contributionsMtd)}</p>
        </article>
        <article className="stat-card">
          <p className="metric-label">Total contributions</p>
          <p className="metric-value">{formatUsd(animatedSummary.totalContributions)}</p>
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
                    <tr
                      key={row.id}
                      className="donor-click-row"
                      onClick={() => navigate(`/donors-contributions/supporters/${row.id}`)}
                    >
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
            <h2>Contributions over time</h2>
            <p className="auth-lead">Monthly contribution totals from recorded donations.</p>
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={contributionsOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(56,95,130,0.15)" />
                  <XAxis dataKey="label" tick={{ fill: '#385f82', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#385f82', fontSize: 12 }} />
                  <Tooltip formatter={(value) => formatUsd(Number(value))} />
                  <Line
                    type="monotone"
                    dataKey="amount"
                    stroke="#0b5c97"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {contributionsOverTime.length === 0 && (
              <p className="donor-inline-message">No contribution history available yet.</p>
            )}
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
                <li key={row.id} className="donor-activity-item">
                  <p><strong>{row.action}</strong> - {row.details}</p>
                  <p className="metric-label">{formatDate(row.at)}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>

      {showAddSupporterModal && (
        <div className="resident-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="add-supporter-title">
          <div className="resident-modal-card">
            <h2 id="add-supporter-title">Add supporter</h2>
            <form className="donor-entry-form" onSubmit={(event) => event.preventDefault()}>
              <label>
                Supporter type
                <select
                  value={supporterForm.supporterType}
                  onChange={(event) =>
                    setSupporterForm((prev) => ({ ...prev, supporterType: event.target.value }))
                  }
                >
                  <option value="MonetaryDonor">Monetary Donor</option>
                  <option value="InKindDonor">In-Kind Donor</option>
                  <option value="Volunteer">Volunteer</option>
                  <option value="SkillsContributor">Skills Contributor</option>
                  <option value="SocialMediaAdvocate">Social Media Advocate</option>
                </select>
              </label>
              <label>
                Display name
                <input
                  value={supporterForm.displayName}
                  onChange={(event) =>
                    setSupporterForm((prev) => ({ ...prev, displayName: event.target.value }))
                  }
                  placeholder="Organization or full supporter name"
                />
              </label>
              <label>
                Organization name
                <input
                  value={supporterForm.organizationName}
                  onChange={(event) =>
                    setSupporterForm((prev) => ({ ...prev, organizationName: event.target.value }))
                  }
                />
              </label>
              <label>
                First name
                <input
                  value={supporterForm.firstName}
                  onChange={(event) =>
                    setSupporterForm((prev) => ({ ...prev, firstName: event.target.value }))
                  }
                />
              </label>
              <label>
                Last name
                <input
                  value={supporterForm.lastName}
                  onChange={(event) =>
                    setSupporterForm((prev) => ({ ...prev, lastName: event.target.value }))
                  }
                />
              </label>
              <label>
                Relationship type
                <select
                  value={supporterForm.relationshipType}
                  onChange={(event) =>
                    setSupporterForm((prev) => ({ ...prev, relationshipType: event.target.value }))
                  }
                >
                  <option value="Local">Local</option>
                  <option value="International">International</option>
                  <option value="PartnerOrganization">Partner Organization</option>
                </select>
              </label>
              <label>
                Region
                <select
                  value={supporterForm.region}
                  onChange={(event) =>
                    setSupporterForm((prev) => ({ ...prev, region: event.target.value }))
                  }
                >
                  <option value="Luzon">Luzon</option>
                  <option value="Visayas">Visayas</option>
                  <option value="Mindanao">Mindanao</option>
                </select>
              </label>
              <label>
                Country
                <input
                  value={supporterForm.country}
                  onChange={(event) =>
                    setSupporterForm((prev) => ({ ...prev, country: event.target.value }))
                  }
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={supporterForm.email}
                  onChange={(event) =>
                    setSupporterForm((prev) => ({ ...prev, email: event.target.value }))
                  }
                />
              </label>
              <label>
                Phone
                <input
                  value={supporterForm.phone}
                  onChange={(event) =>
                    setSupporterForm((prev) => ({ ...prev, phone: event.target.value }))
                  }
                />
              </label>
              <label>
                Status
                <select
                  value={supporterForm.status}
                  onChange={(event) =>
                    setSupporterForm((prev) => ({ ...prev, status: event.target.value }))
                  }
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </label>
              <label>
                Created at
                <input
                  type="date"
                  value={supporterForm.createdAt}
                  onChange={(event) =>
                    setSupporterForm((prev) => ({ ...prev, createdAt: event.target.value }))
                  }
                />
              </label>
              <label>
                First donation date
                <input
                  type="date"
                  value={supporterForm.firstDonationDate}
                  onChange={(event) =>
                    setSupporterForm((prev) => ({ ...prev, firstDonationDate: event.target.value }))
                  }
                />
              </label>
              <label>
                Acquisition channel
                <select
                  value={supporterForm.acquisitionChannel}
                  onChange={(event) =>
                    setSupporterForm((prev) => ({ ...prev, acquisitionChannel: event.target.value }))
                  }
                >
                  <option value="Website">Website</option>
                  <option value="SocialMedia">Social media</option>
                  <option value="WordOfMouth">Word of mouth</option>
                  <option value="Event">Event</option>
                  <option value="Church">Church</option>
                  <option value="PartnerReferral">Partner referral</option>
                </select>
              </label>
            </form>
            {supporterError && <p className="error-text">{supporterError}</p>}
            <div className="resident-modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowAddSupporterModal(false);
                  setSupporterError(null);
                }}
                disabled={savingSupporter}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void handleSaveSupporter()}
                disabled={savingSupporter}
              >
                {savingSupporter ? 'Saving...' : 'Save supporter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
