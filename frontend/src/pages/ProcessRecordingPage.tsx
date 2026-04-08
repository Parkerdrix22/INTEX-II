import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { caseloadApi, type ProcessRecordingSummary } from '../lib/api';
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

export function ProcessRecordingPage() {
  const [rows, setRows] = useState<ProcessRecordingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sessionTypeFilter, setSessionTypeFilter] = useState<'All' | string>('All');
  const [flagFilter, setFlagFilter] = useState<'All' | 'Concerns' | 'Progress'>('All');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await caseloadApi.listAllProcessRecordings();
        setRows(data);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load process recordings.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (sessionTypeFilter !== 'All' && row.sessionType !== sessionTypeFilter) return false;
      if (flagFilter === 'Concerns' && row.concernsFlagged !== true) return false;
      if (flagFilter === 'Progress' && row.progressNoted !== true) return false;
      if (!q) return true;
      return [
        row.residentLabel,
        row.socialWorker ?? '',
        row.sessionType,
        row.emotionalStateObserved ?? '',
        row.narrativePreview ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [query, rows, sessionTypeFilter, flagFilter]);

  const sessionTypes = useMemo(
    () => Array.from(new Set(rows.map((row) => row.sessionType))).sort(),
    [rows],
  );

  const totalRecordings = rows.length;
  const concernCount = rows.filter((row) => row.concernsFlagged === true).length;
  const progressCount = rows.filter((row) => row.progressNoted === true).length;
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
  }, [query, sessionTypeFilter, flagFilter, pageSize]);

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
          <h1 className="kateri-photo-hero__title">Process Recordings</h1>
          <p className="kateri-photo-hero__lead">
            Every counseling session logged across all residents. Filter by session type, search by social
            worker or narrative, and jump into any resident&apos;s full case file to edit.
          </p>
        </div>
      </header>

      <section className="caseload-summary-grid" aria-label="Process recording key metrics">
        <article className="stat-card">
          <p className="metric-label">Total recordings</p>
          <p className="metric-value">{totalRecordings}</p>
        </article>
        <article className="stat-card">
          <p className="metric-label">Residents documented</p>
          <p className="metric-value">{uniqueResidents}</p>
        </article>
        <article className="stat-card">
          <p className="metric-label">Concerns flagged</p>
          <p className="metric-value">{concernCount}</p>
        </article>
        <article className="stat-card">
          <p className="metric-label">Progress noted</p>
          <p className="metric-value">{progressCount}</p>
        </article>
      </section>

      <article className="auth-card caseload-workspace-card">
        <div className="caseload-filters">
          <input
            type="text"
            placeholder="Search resident, social worker, narrative..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search process recordings"
          />
          <select
            value={sessionTypeFilter}
            onChange={(event) => setSessionTypeFilter(event.target.value)}
            aria-label="Filter by session type"
          >
            <option value="All">All session types</option>
            {sessionTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <select
            value={flagFilter}
            onChange={(event) => setFlagFilter(event.target.value as 'All' | 'Concerns' | 'Progress')}
            aria-label="Filter by flags"
          >
            <option value="All">All records</option>
            <option value="Concerns">Concerns flagged only</option>
            <option value="Progress">Progress noted only</option>
          </select>
        </div>

        <div className="caseload-table-wrap">
          <table className="caseload-table">
            <thead>
              <tr>
                <th>Session date</th>
                <th>Resident</th>
                <th>Session type</th>
                <th>Social worker</th>
                <th>Emotional state</th>
                <th>Flags</th>
                <th>Narrative preview</th>
              </tr>
            </thead>
            <tbody>
              {!loading &&
                !loadError &&
                pagedRows.map((row) => (
                  <tr key={`${row.residentId}-${row.recordKey}`}>
                    <td>{formatDate(row.sessionDate)}</td>
                    <td>
                      <Link to={`/caseload-inventory/${row.residentId}`}>{row.residentLabel}</Link>
                      {row.caseStatus && (
                        <>
                          {' '}
                          <span className={statusClass(row.caseStatus)}>{row.caseStatus}</span>
                        </>
                      )}
                    </td>
                    <td>{row.sessionType}</td>
                    <td>{row.socialWorker ?? '—'}</td>
                    <td>{row.emotionalStateObserved ?? '—'}</td>
                    <td>
                      {row.concernsFlagged === true && (
                        <span className="case-status-pill case-status-pill--open">Concerns</span>
                      )}
                      {row.progressNoted === true && (
                        <span className="case-status-pill case-status-pill--closed">Progress</span>
                      )}
                      {row.concernsFlagged !== true && row.progressNoted !== true && '—'}
                    </td>
                    <td className="caseload-narrative-cell">
                      {row.narrativePreview?.trim() ? row.narrativePreview : '—'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {loading && <p className="caseload-inline-message">Loading process recordings...</p>}
          {loadError && <p className="error-text caseload-inline-message">{loadError}</p>}
          {!loading && !loadError && filteredRows.length === 0 && (
            <p className="caseload-inline-message">No process recordings match the current filters.</p>
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
          To create, edit, or delete a process recording, open the resident&apos;s case file by clicking
          their identifier in the table above. Full CRUD is available on the <strong>Process recordings</strong>
          tab of each resident detail page.
        </p>
      </article>
    </section>
  );
}
