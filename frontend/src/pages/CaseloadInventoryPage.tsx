import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { caseloadApi, type CaseloadResident } from '../lib/api';

function safehouseLabel(row: CaseloadResident): string {
  if (row.safehouseName?.trim()) return row.safehouseName;
  if (!row.safehouseId) return 'Unassigned';
  return `Safehouse #${row.safehouseId}`;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function statusClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized.includes('open')) return 'case-status-pill case-status-pill--open';
  if (normalized.includes('progress')) return 'case-status-pill case-status-pill--progress';
  if (normalized.includes('closed')) return 'case-status-pill case-status-pill--closed';
  return 'case-status-pill case-status-pill--prep';
}

export function CaseloadInventoryPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<CaseloadResident[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'All' | string>('All');
  const [safehouseFilter, setSafehouseFilter] = useState<'All' | string>('All');
  const [activeCaseId, setActiveCaseId] = useState<number>(0);
  const [pageSize, setPageSize] = useState(5);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await caseloadApi.residents();
        setRows(data);
        setActiveCaseId(data[0]?.id ?? 0);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load caseload records.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const filteredCases = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((item) => {
      if (statusFilter !== 'All' && item.caseStatus !== statusFilter) return false;
      if (safehouseFilter !== 'All' && safehouseLabel(item) !== safehouseFilter) return false;
      if (!q) return true;
      return [
        item.caseControlNo,
        item.assignedSocialWorker ?? '',
        safehouseLabel(item),
        item.caseStatus,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [query, rows, statusFilter, safehouseFilter]);

  const selectedCase = filteredCases.find((row) => row.id === activeCaseId) ?? filteredCases[0] ?? null;
  const statuses = Array.from(new Set(rows.map((row) => row.caseStatus))).sort();
  const safehouses = Array.from(new Set(rows.map((row) => safehouseLabel(row)))).sort();
  const activeCount = rows.filter((row) => !row.dateClosed).length;
  const openCount = rows.filter((row) => row.caseStatus.toLowerCase().includes('open')).length;
  const withWorkerCount = rows.filter((row) => (row.assignedSocialWorker ?? '').trim().length > 0).length;
  const closedCount = rows.filter((row) => !!row.dateClosed).length;
  const totalPages = Math.max(1, Math.ceil(filteredCases.length / pageSize));
  const pageStart = (currentPage - 1) * pageSize;
  const pagedCases = filteredCases.slice(pageStart, pageStart + pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, statusFilter, safehouseFilter, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    const visible = pagedCases.some((row) => row.id === activeCaseId);
    if (!visible) {
      setActiveCaseId(pagedCases[0]?.id ?? filteredCases[0]?.id ?? 0);
    }
  }, [pagedCases, filteredCases, activeCaseId]);

  return (
    <section className="caseload-page">
      <header className="caseload-page__header">
        <h1>Caseload Inventory</h1>
        <p className="auth-lead">
          Live resident records from the database, with filter/search tools for daily case management workflows.
        </p>
      </header>

      <section className="caseload-summary-grid" aria-label="Caseload key metrics">
        <article className="stat-card">
          <p className="metric-label">Active residents</p>
          <p className="metric-value">{activeCount}</p>
        </article>
        <article className="stat-card">
          <p className="metric-label">Open cases</p>
          <p className="metric-value">{openCount}</p>
        </article>
        <article className="stat-card">
          <p className="metric-label">Cases with assigned social worker</p>
          <p className="metric-value">{withWorkerCount}</p>
        </article>
        <article className="stat-card">
          <p className="metric-label">Closed cases</p>
          <p className="metric-value">{closedCount}</p>
        </article>
      </section>

      <article className="auth-card caseload-workspace-card">
        <div className="caseload-filters">
          <input
            type="text"
            placeholder="Search case control no, social worker, status, or safehouse..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search caseload"
          />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="All">All statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <select value={safehouseFilter} onChange={(event) => setSafehouseFilter(event.target.value)}>
            <option value="All">All safehouses</option>
            {safehouses.map((safehouse) => (
              <option key={safehouse} value={safehouse}>
                {safehouse}
              </option>
            ))}
          </select>
          <button type="button">+ New resident case</button>
        </div>

        <div className="caseload-workspace-grid">
          <div className="caseload-table-wrap">
            <table className="caseload-table">
              <thead>
                <tr>
                  <th>Girl</th>
                  <th>Case control no</th>
                  <th>Status</th>
                  <th>Safehouse</th>
                  <th>Assigned social worker</th>
                  <th>Date admitted</th>
                </tr>
              </thead>
              <tbody>
                {!loading &&
                  !loadError &&
                  pagedCases.map((row) => {
                    const isActive = selectedCase?.id === row.id;
                    return (
                      <tr
                        key={row.id}
                        className={isActive ? 'caseload-row--active' : ''}
                        onClick={() => setActiveCaseId(row.id)}
                      >
                        <td>
                          <Link to={`/caseload-inventory/${row.id}`}>{row.displayName}</Link>
                        </td>
                        <td>{row.caseControlNo}</td>
                        <td>
                          <span className={statusClass(row.caseStatus)}>{row.caseStatus}</span>
                        </td>
                        <td>{safehouseLabel(row)}</td>
                        <td>{row.assignedSocialWorker ?? 'Unassigned'}</td>
                        <td>{formatDate(row.dateAdmitted)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            {loading && <p className="caseload-inline-message">Loading records...</p>}
            {loadError && <p className="error-text caseload-inline-message">{loadError}</p>}
            {!loading && !loadError && filteredCases.length === 0 && (
              <p className="caseload-inline-message">No records match the current filters.</p>
            )}
            {!loading && !loadError && filteredCases.length > 0 && (
              <div className="caseload-pagination">
                <div className="caseload-pagination__meta">
                  <span>
                    Showing {pageStart + 1}-{Math.min(pageStart + pageSize, filteredCases.length)} of {filteredCases.length}
                  </span>
                  <label>
                    Rows per page
                    <select
                      value={pageSize}
                      onChange={(event) => setPageSize(Number(event.target.value))}
                      aria-label="Rows per page"
                    >
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </label>
                </div>
                <div className="caseload-pagination__controls">
                  <button type="button" className="btn-secondary" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
                    « First
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={currentPage === 1}
                  >
                    ‹ Prev
                  </button>
                  <span className="caseload-pagination__page-indicator">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next ›
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                  >
                    Last »
                  </button>
                </div>
              </div>
            )}
          </div>

          <section className="caseload-detail-card" aria-live="polite">
            {selectedCase ? (
              <>
                <h2>{selectedCase.displayName}</h2>
                <p className="auth-lead">
                  Open this resident&apos;s case file to manage personal information, process recordings, and
                  home visitations.
                </p>
                <div className="caseload-detail-form__actions">
                  <button type="button" onClick={() => navigate(`/caseload-inventory/${selectedCase.id}`)}>
                    Open case file
                  </button>
                </div>
              </>
            ) : (
              <p className="auth-lead">No records match the current filters.</p>
            )}
          </section>
        </div>
      </article>
    </section>
  );
}
