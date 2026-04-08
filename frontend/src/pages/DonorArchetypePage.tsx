import { useEffect, useMemo, useState } from 'react';
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
import './DonorArchetypePage.css';

// =============================================================================
// API types — match the C# DonorArchetypeController DTOs
// =============================================================================

type DonorArchetypeItem = {
  supporterId: number;
  displayName: string;
  supporterType: string;
  country: string;
  status: string;
  frequency: number;
  monetaryTotal: number;
  monetaryAvg: number;
  recencyDays: number;
  tenureDays: number;
  hasRecurring: boolean;
  assignedClusterId: number;
  archetypeLabel: string;
  archetypeColor: string;
  archetypeTagline: string;
  distanceToCentroid: number;
};

type ArchetypeCharacteristics = {
  meanFrequency: number;
  meanMonetaryTotal: number;
  meanMonetaryAvg: number;
  meanRecencyDays: number;
  meanTenureDays: number;
  recurringPct: number;
};

type ArchetypeProfile = {
  clusterId: number;
  label: string;
  tagline: string;
  color: string;
  strategy: string;
  size: number;
  characteristics: ArchetypeCharacteristics;
};

type DistanceEntry = {
  clusterId: number;
  label: string;
  distance: number;
};

type DetailedDonorArchetype = DonorArchetypeItem & {
  archetypeStrategy: string;
  distanceToOtherCentroids: DistanceEntry[];
};

type ArchetypeModelInfo = {
  donorCount: number;
  nClusters: number;
  silhouette: number;
  trainedAt: string | null;
  snapshotDate: string;
  modelName: string;
  interpretation: string;
};

type SortKey = 'monetaryTotal' | 'frequency' | 'recencyDays' | 'name';

// =============================================================================
// Formatters
// =============================================================================

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const moneyDecimal = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

// =============================================================================
// Page component
// =============================================================================

export function DonorArchetypePage() {
  const [donors, setDonors] = useState<DonorArchetypeItem[]>([]);
  const [archetypes, setArchetypes] = useState<ArchetypeProfile[]>([]);
  const [modelInfo, setModelInfo] = useState<ArchetypeModelInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  const [search, setSearch] = useState('');
  const [clusterFilter, setClusterFilter] = useState<number | 'All'>('All');
  const [sortBy, setSortBy] = useState<SortKey>('monetaryTotal');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailCache, setDetailCache] = useState<Record<number, DetailedDonorArchetype>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);

  // ── Initial parallel loads ──────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const [dashRes, clusterRes, infoRes] = await Promise.all([
          fetch('/api/donor-archetypes/dashboard', { credentials: 'include' }),
          fetch('/api/donor-archetypes/clusters', { credentials: 'include' }),
          fetch('/api/donor-archetypes/model-info', { credentials: 'include' }),
        ]);
        if (!dashRes.ok || !clusterRes.ok || !infoRes.ok) {
          throw new Error('Failed to load donor archetype data');
        }
        const [dashData, clusterData, infoData]: [
          DonorArchetypeItem[],
          ArchetypeProfile[],
          ArchetypeModelInfo,
        ] = await Promise.all([dashRes.json(), clusterRes.json(), infoRes.json()]);
        setDonors(dashData);
        setArchetypes(clusterData);
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

  // ── Color lookup keyed by clusterId ─────────────────────────────────
  const colorByCluster = useMemo(() => {
    const map: Record<number, string> = {};
    for (const a of archetypes) map[a.clusterId] = a.color;
    return map;
  }, [archetypes]);

  const labelByCluster = useMemo(() => {
    const map: Record<number, string> = {};
    for (const a of archetypes) map[a.clusterId] = a.label;
    return map;
  }, [archetypes]);

  // ── Filtering + sorting ─────────────────────────────────────────────
  const filteredDonors = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = donors.filter((d) => {
      if (clusterFilter !== 'All' && d.assignedClusterId !== clusterFilter) return false;
      if (!q) return true;
      return (
        d.displayName.toLowerCase().includes(q) ||
        d.country.toLowerCase().includes(q) ||
        d.archetypeLabel.toLowerCase().includes(q)
      );
    });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'monetaryTotal':
          return b.monetaryTotal - a.monetaryTotal;
        case 'frequency':
          return b.frequency - a.frequency;
        case 'recencyDays':
          return a.recencyDays - b.recencyDays;
        case 'name':
          return a.displayName.localeCompare(b.displayName);
        default:
          return 0;
      }
    });
    return sorted;
  }, [donors, search, clusterFilter, sortBy]);

  // ── Distribution data for the donut ─────────────────────────────────
  const distributionData = useMemo(
    () =>
      archetypes.map((a) => ({
        clusterId: a.clusterId,
        name: a.label,
        value: a.size,
        color: a.color,
      })),
    [archetypes],
  );

  // ── Expand handler — fetches & caches ───────────────────────────────
  const handleToggle = async (supporterId: number) => {
    if (expandedId === supporterId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(supporterId);
    if (detailCache[supporterId]) return;
    setDetailLoadingId(supporterId);
    try {
      const res = await fetch(`/api/donor-archetypes/${supporterId}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load donor detail');
      const data: DetailedDonorArchetype = await res.json();
      setDetailCache((prev) => ({ ...prev, [supporterId]: data }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setDetailLoadingId(null);
    }
  };

  if (loading) {
    return (
      <div className="archetype-loading">
        <div className="archetype-spinner" />
        <p>Loading donor archetypes…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="archetype-error">
        <h2>Couldn’t load archetype dashboard</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <section className={`archetype-page ${visible ? 'is-visible' : ''}`}>
      {/* ─── Header ───────────────────────────────────────── */}
      <header className="archetype-header">
        <h1 className="archetype-title">Donor Archetypes</h1>
        <p className="archetype-subtitle">
          Every donor automatically grouped into one of four natural personas based on their RFM
          behavior. Each archetype gets a distinct fundraising strategy.
        </p>
        {modelInfo && (
          <p className="archetype-model-meta">
            <strong>{modelInfo.donorCount.toLocaleString()}</strong> donors · K-means with K =
            <strong> {modelInfo.nClusters}</strong> · silhouette ={' '}
            <strong>{modelInfo.silhouette.toFixed(3)}</strong>
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

      {/* ─── Section 1: Archetype Gallery ──────────────────── */}
      <div className="archetype-gallery">
        {archetypes.map((a) => (
          <ArchetypeCard
            key={a.clusterId}
            archetype={a}
            isActive={clusterFilter === a.clusterId}
            onSelect={() =>
              setClusterFilter((prev) => (prev === a.clusterId ? 'All' : a.clusterId))
            }
          />
        ))}
      </div>

      {/* ─── Section 2: Distribution + Filters ─────────────── */}
      <div className="archetype-mid-row">
        {/* Donut */}
        <article className="archetype-chart-card">
          <header>
            <h3>Cluster distribution</h3>
            <p>How the donor base breaks down by archetype</p>
          </header>
          <div className="archetype-chart-wrap">
            <ResponsiveContainer width="100%" debounce={1} height={260}>
              <PieChart>
                <Pie
                  data={distributionData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                  stroke="rgba(255,255,255,0.6)"
                >
                  {distributionData.map((entry) => (
                    <Cell key={entry.clusterId} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={
                    ((value: unknown, _name: unknown, item: { payload?: { name: string } }) => {
                      const num = typeof value === 'number' ? value : Number(value ?? 0);
                      return [`${num} donors`, item?.payload?.name ?? ''];
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
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </article>

        {/* Filters */}
        <div className="archetype-controls">
          <div className="archetype-search-wrap">
            <svg
              className="archetype-search-icon"
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
              className="archetype-search"
              type="search"
              placeholder="Search donors, countries, archetypes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="archetype-filter-group">
            <button
              type="button"
              className={`archetype-filter-btn${clusterFilter === 'All' ? ' archetype-filter-btn--active' : ''}`}
              onClick={() => setClusterFilter('All')}
            >
              All
            </button>
            {archetypes.map((a) => (
              <button
                key={a.clusterId}
                type="button"
                className={`archetype-filter-btn${clusterFilter === a.clusterId ? ' archetype-filter-btn--active' : ''}`}
                onClick={() => setClusterFilter(a.clusterId)}
                style={
                  clusterFilter === a.clusterId
                    ? { borderColor: a.color, color: a.color }
                    : undefined
                }
              >
                <span
                  className="archetype-filter-dot"
                  style={{ background: a.color }}
                  aria-hidden="true"
                />
                {a.label}
              </button>
            ))}
          </div>

          <div className="archetype-sort-wrap">
            <label className="archetype-sort-label" htmlFor="archetype-sort">
              Sort by
            </label>
            <select
              id="archetype-sort"
              className="archetype-sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
            >
              <option value="monetaryTotal">Total $</option>
              <option value="frequency">Frequency</option>
              <option value="recencyDays">Recency</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>
      </div>

      {/* ─── Section 3: Donor list ─────────────────────────── */}
      <div className="archetype-donor-section">
        <div className="archetype-donor-section__head">
          <h2>
            {clusterFilter === 'All'
              ? 'All donors'
              : labelByCluster[clusterFilter] ?? 'Selected archetype'}
          </h2>
          <span className="archetype-donor-count">
            {filteredDonors.length} donor{filteredDonors.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="archetype-donor-list">
          {filteredDonors.length === 0 && (
            <div className="archetype-empty">No donors match your filters.</div>
          )}
          {filteredDonors.map((donor) => (
            <DonorRow
              key={donor.supporterId}
              donor={donor}
              color={colorByCluster[donor.assignedClusterId] ?? donor.archetypeColor}
              expanded={expandedId === donor.supporterId}
              loading={detailLoadingId === donor.supporterId}
              detail={detailCache[donor.supporterId] ?? null}
              onToggle={() => handleToggle(donor.supporterId)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function ArchetypeCard({
  archetype,
  isActive,
  onSelect,
}: {
  archetype: ArchetypeProfile;
  isActive: boolean;
  onSelect: () => void;
}) {
  const c = archetype.characteristics;
  return (
    <button
      type="button"
      className={`archetype-card${isActive ? ' archetype-card--active' : ''}`}
      onClick={onSelect}
      style={isActive ? { borderColor: archetype.color } : undefined}
    >
      <span className="archetype-card__stripe" style={{ background: archetype.color }} />
      <div className="archetype-card__head">
        <div>
          <h3 className="archetype-card__label">{archetype.label}</h3>
          <p className="archetype-card__tagline">{archetype.tagline}</p>
        </div>
        <span
          className="archetype-card__size"
          style={{ background: archetype.color }}
        >
          {archetype.size} donor{archetype.size === 1 ? '' : 's'}
        </span>
      </div>

      <div className="archetype-card__stats">
        <MiniStat label="Avg gifts" value={c.meanFrequency.toFixed(1)} />
        <MiniStat label="Avg total" value={money.format(c.meanMonetaryTotal)} />
        <MiniStat label="Avg recency" value={`${Math.round(c.meanRecencyDays)}d`} />
        <MiniStat label="Recurring" value={`${Math.round(c.recurringPct * 100)}%`} />
      </div>

      <p className="archetype-card__strategy">{archetype.strategy}</p>
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="archetype-mini-stat">
      <span className="archetype-mini-stat__label">{label}</span>
      <span className="archetype-mini-stat__value">{value}</span>
    </div>
  );
}

function DonorRow({
  donor,
  color,
  expanded,
  loading,
  detail,
  onToggle,
}: {
  donor: DonorArchetypeItem;
  color: string;
  expanded: boolean;
  loading: boolean;
  detail: DetailedDonorArchetype | null;
  onToggle: () => void;
}) {
  return (
    <div className={`archetype-donor-card${expanded ? ' archetype-donor-card--expanded' : ''}`}>
      <button
        type="button"
        className="archetype-donor-row"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="archetype-donor-stripe" style={{ background: color }} />
        <div className="archetype-donor-info">
          <div className="archetype-donor-name-row">
            <span className="archetype-donor-name">
              {donor.displayName || `Donor #${donor.supporterId}`}
            </span>
            <span className="archetype-badge archetype-badge--type">{donor.supporterType}</span>
            {donor.hasRecurring && (
              <span className="archetype-badge archetype-badge--recurring">Recurring</span>
            )}
            <span
              className="archetype-badge archetype-badge--archetype"
              style={{ background: color }}
            >
              {donor.archetypeLabel}
            </span>
          </div>
          <div className="archetype-donor-meta">
            {donor.country && <span>{donor.country}</span>}
            {donor.country && <span className="archetype-meta-sep">·</span>}
            <span>{donor.frequency} gifts</span>
            <span className="archetype-meta-sep">·</span>
            <span>{moneyDecimal.format(donor.monetaryTotal)}</span>
            <span className="archetype-meta-sep">·</span>
            <span>last gave {donor.recencyDays}d ago</span>
          </div>
        </div>
        <div className={`archetype-chevron${expanded ? ' archetype-chevron--open' : ''}`}>
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
        <div className="archetype-detail">
          {loading && !detail && (
            <div className="archetype-detail-loading">
              <div className="archetype-spinner" />
            </div>
          )}
          {detail && (
            <div className="archetype-detail-grid">
              <div className="archetype-strategy-block" style={{ borderLeftColor: color }}>
                <span className="archetype-strategy-overline">Why this archetype</span>
                <p className="archetype-strategy-text">{detail.archetypeStrategy}</p>
              </div>

              <div className="archetype-distance-block">
                <h4 className="archetype-detail-heading">Distance to each centroid</h4>
                <p className="archetype-detail-sub">
                  Lower bars = better fit. Look for the second-best fit to spot dual personalities.
                </p>
                <div className="archetype-chart-wrap archetype-chart-wrap--bar">
                  <ResponsiveContainer
                    width="100%"
                    debounce={1}
                    height={Math.max(160, detail.distanceToOtherCentroids.length * 42)}
                  >
                    <BarChart
                      data={detail.distanceToOtherCentroids}
                      layout="vertical"
                      margin={{ left: 20, right: 28 }}
                    >
                      <XAxis type="number" stroke="rgba(31,47,63,0.5)" fontSize={11} />
                      <YAxis
                        type="category"
                        dataKey="label"
                        stroke="rgba(31,47,63,0.7)"
                        fontSize={12}
                        width={150}
                      />
                      <Tooltip
                        formatter={
                          ((value: unknown) => {
                            const num = typeof value === 'number' ? value : Number(value ?? 0);
                            return [num.toFixed(3), 'Distance'];
                          }) as never
                        }
                        contentStyle={{
                          background: 'rgba(255,253,247,0.96)',
                          border: '1px solid rgba(170,190,208,0.4)',
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="distance" radius={[0, 6, 6, 0]}>
                        {detail.distanceToOtherCentroids.map((entry) => (
                          <Cell
                            key={entry.clusterId}
                            fill={entry.clusterId === donor.assignedClusterId ? color : '#aab8c4'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="archetype-rfm-block">
                <h4 className="archetype-detail-heading">Full RFM profile</h4>
                <div className="archetype-rfm-grid">
                  <RfmStat label="Frequency" value={`${donor.frequency}`} />
                  <RfmStat label="Total $" value={moneyDecimal.format(donor.monetaryTotal)} />
                  <RfmStat label="Avg gift" value={moneyDecimal.format(donor.monetaryAvg)} />
                  <RfmStat label="Recency" value={`${donor.recencyDays}d`} />
                  <RfmStat label="Tenure" value={`${donor.tenureDays}d`} />
                  <RfmStat
                    label="Distance"
                    value={donor.distanceToCentroid.toFixed(3)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RfmStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="archetype-rfm-stat">
      <span className="archetype-rfm-stat__label">{label}</span>
      <span className="archetype-rfm-stat__value">{value}</span>
    </div>
  );
}
