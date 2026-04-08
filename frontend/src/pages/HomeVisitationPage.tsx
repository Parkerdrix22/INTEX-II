import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { caseloadApi, type HomeVisitationSummary } from '../lib/api';
import heroImage from '../background.jpg?format=webp&quality=82&w=1920';

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function statusClass(status: string | null): string {
  if (!status) return 'case-status-pill case-status-pill--prep';
  const normalized = status.toLowerCase();
  if (normalized.includes('open')) return 'case-status-pill case-status-pill--open';
  if (normalized.includes('progress')) return 'case-status-pill case-status-pill--progress';
  if (normalized.includes('closed')) return 'case-status-pill case-status-pill--closed';
  return 'case-status-pill case-status-pill--prep';
}

export function HomeVisitationPage() {
  const [rows, setRows] = useState<HomeVisitationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [visitTypeFilter, setVisitTypeFilter] = useState<'All' | string>('All');
  const [safetyFilter, setSafetyFilter] = useState<'All' | 'Safety' | 'FollowUp'>('All');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await caseloadApi.listAllHomeVisitations();
        setRows(data);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load home visitations.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (visitTypeFilter !== 'All' && row.visitType !== visitTypeFilter) return false;
      if (safetyFilter === 'Safety' && row.safetyConcernsNoted !== true) return false;
      if (safetyFilter === 'FollowUp' && row.followUpNeeded !== true) return false;
      if (!q) return true;
      return [
        row.residentLabel,
        row.socialWorker ?? '',
        row.visitType,
        row.familyCooperationLevel ?? '',
        row.visitOutcome ?? '',
        row.observationsPreview ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [query, rows, visitTypeFilter, safetyFilter]);

  const visitTypes = useMemo(
    () => Array.from(new Set(rows.map((row) => row.visitType))).sort(),
    [rows],
  );

  const totalVisits = rows.length;
  const safetyConcernCount = rows.filter((row) => row.safetyConcernsNoted === true).length;
  const followUpCount = rows.filter((row) => row.followUpNeeded === true).length;
  const uniqueResidents = useMemo(() => {
    const ids = new Set<number>();
    rows.forEach((row) => ids.add(row.residentId));
    return ids.size;
  }, [rows]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageStart = (currentPage - 1) * pageSize;
  const pagedRows = filteredRows.slice(pageStart, pageStart + pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, visitTypeFilter, safetyFilter, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  return (
    <section className="caseload-page kateri-landing-section">
      <header className="kateri-photo-hero">
        <div
          className="kateri-photo-hero__media"
          style={{ backgroundImage: `url(${heroImage})` }}
          aria-hidden={true}
        />
        <div className="kateri-photo-hero__scrim" aria-hidden={true} />
        <div className="kateri-photo-hero__inner">
          <h1 className="kateri-photo-hero__title">Home Visitations &amp; Case Conferences</h1>
          <p className="kateri-photo-hero__lead">
            All field visits and case conferences across every safehouse. Filter by visit type, flag safety
            concerns, and jump into any resident&apos;s file to log new visits or edit existing records.
          </p>
        </div>
      </header>

      <section className="caseload-summary-grid" aria-label="Home visitation key metrics">
        <article className="stat-card">
          <p className="metric-label">Total visits logged</p>
          <p className="metric-value">{totalVisits}</p>
        </article>
        <article className="stat-card">
          <p className="metric-label">Residents visited</p>
          <p className="metric-value">{uniqueResidents}</p>
        </article>
        <article className="stat-card">
          <p className="metric-label">Safety concerns noted</p>
          <p className="metric-value">{safetyConcernCount}</p>
        </article>
        <article className="stat-card">
          <p className="metric-label">Follow-up needed</p>
          <p className="metric-value">{followUpCount}</p>
        </article>
      </section>

      <article className="auth-card caseload-workspace-card">
        <div className="caseload-filters">
          <input
            type="text"
            placeholder="Search resident, worker, outcome, observations..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search home visitations"
          />
          <select
            value={visitTypeFilter}
            onChange={(event) => setVisitTypeFilter(event.target.value)}
            aria-label="Filter by visit type"
          >
            <option value="All">All visit types</option>
            {visitTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <select
            value={safetyFilter}
            onChange={(event) => setSafetyFilter(event.target.value as 'All' | 'Safety' | 'FollowUp')}
            aria-label="Filter by flags"
          >
            <option value="All">All records</option>
            <option value="Safety">Safety concerns only</option>
            <option value="FollowUp">Follow-up needed only</option>
          </select>
        </div>

        <div className="caseload-table-wrap">
          <table className="caseload-table">
            <thead>
              <tr>
                <th>Visit date</th>
                <th>Resident</th>
                <th>Visit type</th>
                <th>Social worker</th>
                <th>Family cooperation</th>
                <th>Outcome</th>
                <th>Flags</th>
                <th>Observations preview</th>
              </tr>
            </thead>
            <tbody>
              {!loading &&
                !loadError &&
                pagedRows.map((row) => (
                  <tr key={`${row.residentId}-${row.recordKey}`}>
                    <td>{formatDate(row.visitDate)}</td>
                    <td>
                      <Link to={`/caseload-inventory/${row.residentId}`}>{row.residentLabel}</Link>
                      {row.caseStatus && (
                        <>
                          {' '}
                          <span className={statusClass(row.caseStatus)}>{row.caseStatus}</span>
                        </>
                      )}
                    </td>
                    <td>{row.visitType}</td>
                    <td>{row.socialWorker ?? '—'}</td>
                    <td>{row.familyCooperationLevel ?? '—'}</td>
                    <td>{row.visitOutcome ?? '—'}</td>
                    <td>
                      {row.safetyConcernsNoted === true && (
                        <span className="case-status-pill case-status-pill--open">Safety</span>
                      )}
                      {row.followUpNeeded === true && (
                        <span className="case-status-pill case-status-pill--progress">Follow-up</span>
                      )}
                      {row.safetyConcernsNoted !== true && row.followUpNeeded !== true && '—'}
                    </td>
                    <td className="caseload-narrative-cell">
                      {row.observationsPreview?.trim() ? row.observationsPreview : '—'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {loading && <p className="caseload-inline-message">Loading home visitations...</p>}
          {loadError && <p className="error-text caseload-inline-message">{loadError}</p>}
          {!loading && !loadError && filteredRows.length === 0 && (
            <p className="caseload-inline-message">No home visitations match the current filters.</p>
          )}
          {!loading && !loadError && filteredRows.length > 0 && (
            <div className="caseload-pagination">
              <div className="caseload-pagination__meta">
                <span>
                  Showing {pageStart + 1}-{Math.min(pageStart + pageSize, filteredRows.length)} of {filteredRows.length}
                </span>
                <label>
                  Rows per page
                  <select
                    value={pageSize}
                    onChange={(event) => setPageSize(Number(event.target.value))}
                    aria-label="Rows per page"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </label>
              </div>
              <div className="caseload-pagination__controls">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                  aria-label="Previous page"
                >
                  ‹
                </button>
                <span className="caseload-pagination__page-indicator">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
                  aria-label="Next page"
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="auth-lead caseload-detail-card" style={{ marginTop: '1rem' }}>
          To create, edit, or delete a home visitation, open the resident&apos;s case file by clicking
          their identifier in the table above. Full CRUD is available on the <strong>Home visitations</strong>
          tab of each resident detail page.
        </p>
      </article>
    </section>
  );
}
