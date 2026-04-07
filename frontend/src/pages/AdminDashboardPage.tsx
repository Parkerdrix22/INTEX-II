import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  caseloadApi,
  donorsContributionsApi,
  type CaseloadResident,
  type DonorsContributionsDashboard,
} from '../lib/api';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function monthLabel(value: string): string {
  const [year, month] = value.split('-').map(Number);
  if (!year || !month) return value;
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'short',
    year: '2-digit',
  });
}

function safehouseName(row: CaseloadResident): string {
  if (row.safehouseName?.trim()) return row.safehouseName;
  if (!row.safehouseId) return 'Unassigned';
  return `Safehouse #${row.safehouseId}`;
}

function shortAreaLabel(value: string): string {
  const label = value.trim();
  const safehouseMatch = label.match(/safehouse\s*#?\s*(\d+)/i);
  if (safehouseMatch) return `SH ${safehouseMatch[1]}`;
  if (label.length <= 14) return label;
  return `${label.slice(0, 13)}...`;
}

export function AdminDashboardPage() {
  const [residents, setResidents] = useState<CaseloadResident[]>([]);
  const [donors, setDonors] = useState<DonorsContributionsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [animatedSummary, setAnimatedSummary] = useState({
    activeResidents: 0,
    assignedWorkers: 0,
    totalContributions: 0,
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [residentsData, donorsData] = await Promise.all([
          caseloadApi.residents(),
          donorsContributionsApi.dashboard(),
        ]);
        setResidents(residentsData);
        setDonors(donorsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load admin dashboard.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const summary = useMemo(() => {
    const activeResidents = residents.filter((row) => !row.dateClosed).length;
    const assignedWorkers = residents.filter(
      (row) => (row.assignedSocialWorker ?? '').trim().length > 0,
    ).length;
    return {
      activeResidents,
      assignedWorkers,
      totalContributions: donors?.summary.totalContributions ?? 0,
    };
  }, [residents, donors]);

  useEffect(() => {
    const durationMs = 900;
    const start = performance.now();
    const initial = { ...animatedSummary };
    let rafId = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      setAnimatedSummary({
        activeResidents: Math.round(
          initial.activeResidents + (summary.activeResidents - initial.activeResidents) * progress,
        ),
        assignedWorkers: Math.round(
          initial.assignedWorkers + (summary.assignedWorkers - initial.assignedWorkers) * progress,
        ),
        totalContributions:
          initial.totalContributions +
          (summary.totalContributions - initial.totalContributions) * progress,
      });
      if (progress < 1) rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [summary]);

  const residentsBySafehouse = useMemo(() => {
    const counts = new Map<string, number>();
    residents.forEach((row) => {
      const name = safehouseName(row);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([name, residentsCount]) => ({ name, residents: residentsCount }))
      .sort((a, b) => b.residents - a.residents)
      .slice(0, 8);
  }, [residents]);

  const donationsByMonth = useMemo(() => {
    const buckets = new Map<string, number>();
    (donors?.contributions ?? []).forEach((row) => {
      if (!row.donationDate) return;
      const date = new Date(row.donationDate);
      if (Number.isNaN(date.getTime())) return;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      buckets.set(key, (buckets.get(key) ?? 0) + (row.estimatedValue ?? 0));
    });
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8)
      .map(([month, amount]) => ({ month, label: monthLabel(month), amount: Math.round(amount) }));
  }, [donors]);

  const allocationMix = useMemo(() => {
    const allocations = donors?.allocations ?? [];
    return allocations
      .map((row) => ({
        area: row.area,
        Caring: row.caringPct,
        Healing: row.healingPct,
        Teaching: row.teachingPct,
      }))
      .slice(0, 8);
  }, [donors]);

  const recentActivity = (donors?.activity ?? []).slice(0, 6);

  return (
    <section className="admin-dashboard-page">
      <header className="admin-dashboard-page__header">
        <h1>Admin Dashboard</h1>
        <p className="auth-lead">
          Command center for daily operations across residents, safehouses, and donations.
        </p>
      </header>

      <section className="admin-dashboard-summary-grid" aria-label="Admin summary metrics">
        <article className="stat-card">
          <p className="metric-label">Active residents</p>
          <p className="metric-value">{animatedSummary.activeResidents}+</p>
        </article>
        <article className="stat-card">
          <p className="metric-label">Assigned social workers</p>
          <p className="metric-value">{animatedSummary.assignedWorkers}+</p>
        </article>
        <article className="stat-card">
          <p className="metric-label">Total contributions</p>
          <p className="metric-value">{formatCurrency(animatedSummary.totalContributions)}</p>
        </article>
      </section>

      {loading && <p className="donor-inline-message">Loading admin dashboard...</p>}
      {error && <p className="error-text donor-inline-message">{error}</p>}

      {!loading && !error && (
        <>
          <section className="admin-dashboard-charts-grid">
            <article className="auth-card admin-chart-card">
              <h2>Residents by safehouse</h2>
              <div className="admin-chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={residentsBySafehouse}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(56,95,130,0.15)" />
                    <XAxis dataKey="name" tick={{ fill: '#385f82', fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fill: '#385f82', fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="residents" fill="#385f82" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="auth-card admin-chart-card">
              <h2>Donation trend (last 8 months)</h2>
              <div className="admin-chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={donationsByMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(56,95,130,0.15)" />
                    <XAxis dataKey="label" tick={{ fill: '#385f82', fontSize: 12 }} />
                    <YAxis tick={{ fill: '#385f82', fontSize: 12 }} />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Line
                      type="monotone"
                      dataKey="amount"
                      stroke="#c9983f"
                      strokeWidth={3}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="auth-card admin-chart-card admin-chart-card--wide">
              <h2>Allocation mix by area</h2>
              <div className="admin-chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={allocationMix}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(56,95,130,0.15)" />
                    <XAxis
                      dataKey="area"
                      tick={{ fill: '#385f82', fontSize: 12 }}
                      tickFormatter={(value) => shortAreaLabel(String(value))}
                    />
                    <YAxis tick={{ fill: '#385f82', fontSize: 12 }} />
                    <Tooltip formatter={(value) => `${value}%`} />
                    <Legend />
                    <Bar dataKey="Caring" stackId="a" fill="#385f82" />
                    <Bar dataKey="Healing" stackId="a" fill="#5f8448" />
                    <Bar dataKey="Teaching" stackId="a" fill="#c9983f" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
          </section>

          <article className="auth-card admin-activity-card">
            <h2>Recent contribution activity</h2>
            <div className="donor-table-wrap">
              <table className="donor-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Action</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {recentActivity.map((item) => (
                    <tr key={`${item.at ?? 'none'}-${item.details}`}>
                      <td>{item.at ? new Date(item.at).toLocaleDateString() : '—'}</td>
                      <td>{item.action}</td>
                      <td>{item.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </>
      )}
    </section>
  );
}
