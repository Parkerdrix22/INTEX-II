import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'react-feather';
import { caseloadApi, type CaseloadResident } from '../lib/api';
import heroImage from '../background.jpg?format=webp&quality=82&w=1920';

/** Matches lighthouse CSV + API validation in CaseloadController.CreateResident */
const RESIDENT_CASE_STATUSES = ['Active', 'Closed', 'Transferred'] as const;
const RESIDENT_SEX = ['F', 'M'] as const;
const RESIDENT_CASE_CATEGORIES = ['Neglected', 'Surrendered', 'Foundling', 'Abandoned'] as const;
const RESIDENT_REFERRAL_SOURCES = [
  'NGO',
  'Government Agency',
  'Court Order',
  'Self-Referral',
  'Community',
  'Police',
] as const;
const RESIDENT_REINTEGRATION_TYPES = [
  'Foster Care',
  'Family Reunification',
  'None',
  'Independent Living',
  'Adoption (Domestic)',
  'Adoption (Inter-Country)',
] as const;
const RESIDENT_REINTEGRATION_STATUSES = ['In Progress', 'Completed', 'On Hold', 'Not Started'] as const;
const RESIDENT_RELIGIONS = [
  'Unspecified',
  'Roman Catholic',
  'Seventh-day Adventist',
  'Evangelical',
  'Buddhism',
  "Jehovah's Witness",
  'Islam',
  'Other',
] as const;
const RESIDENT_PLACE_PRESETS = [
  'Manila',
  'Quezon City',
  'Davao City',
  'Cebu City',
  'Pasay City',
  'Makati City',
  'Iloilo City',
  'Zamboanga City',
  'Antipolo',
  'Other',
] as const;

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
  const statusFilterId = useId();
  const safehouseFilterId = useId();
  const pageSizeId = useId();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<CaseloadResident[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'All' | string>('All');
  const [safehouseFilter, setSafehouseFilter] = useState<'All' | string>('All');
  const [activeCaseId, setActiveCaseId] = useState<number>(0);
  const [pageSize, setPageSize] = useState(5);
  const [currentPage, setCurrentPage] = useState(1);
  const [animatedSummary, setAnimatedSummary] = useState({
    activeCount: 0,
    transferredCount: 0,
    withWorkerCount: 0,
    closedCount: 0,
  });
  const animatedSummaryRef = useRef(animatedSummary);
  const [showCreateResident, setShowCreateResident] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creatingResident, setCreatingResident] = useState(false);
  const [safehouseOptions, setSafehouseOptions] = useState<Array<{ id: number; name: string }>>([]);
  const [createResidentForm, setCreateResidentForm] = useState({
    caseControlNo: '',
    internalCode: '',
    caseStatus: 'Active',
    safehouseId: '',
    sex: 'F',
    dateOfBirth: '',
    placePreset: '',
    placeOther: '',
    religion: 'Unspecified',
    caseCategory: '',
    assignedSocialWorker: '',
    referralSource: '',
    dateAdmitted: '',
    dateClosed: '',
    reintegrationType: 'None',
    reintegrationStatus: 'In Progress',
  });

  useEffect(() => {
    if (!showCreateResident) return;
    let cancelled = false;
    void caseloadApi
      .safehouses()
      .then((list) => {
        if (!cancelled) setSafehouseOptions(list);
      })
      .catch(() => {
        if (!cancelled) setSafehouseOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [showCreateResident]);

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
  const transferredCount = rows.filter((row) => row.caseStatus.toLowerCase().includes('transfer')).length;
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

  useEffect(() => {
    animatedSummaryRef.current = animatedSummary;
  }, [animatedSummary]);

  useEffect(() => {
    const durationMs = 900;
    const start = performance.now();
    const initial = { ...animatedSummaryRef.current };
    let rafId = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      setAnimatedSummary({
        activeCount: Math.round(initial.activeCount + (activeCount - initial.activeCount) * progress),
        transferredCount: Math.round(initial.transferredCount + (transferredCount - initial.transferredCount) * progress),
        withWorkerCount: Math.round(initial.withWorkerCount + (withWorkerCount - initial.withWorkerCount) * progress),
        closedCount: Math.round(initial.closedCount + (closedCount - initial.closedCount) * progress),
      });
      if (progress < 1) rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [activeCount, transferredCount, withWorkerCount, closedCount]);

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
          <h1 className="kateri-photo-hero__title">Resident Services</h1>
          <p className="kateri-photo-hero__lead">
            Live resident records from the database, with filter/search tools for daily case management workflows.
          </p>
          <div className="kateri-hero-actions">
            <button type="button" className="btn-kateri-gold" onClick={() => setShowCreateResident(true)}>
              + New resident case
            </button>
          </div>
        </div>
      </header>

      <section className="caseload-summary-grid" aria-label="Resident services key metrics">
        <article className="stat-card">
          <p className="metric-label">Active residents</p>
          <p className="metric-value">{animatedSummary.activeCount}+</p>
        </article>
        <article className="stat-card">
          <p className="metric-label">Transferred cases</p>
          <p className="metric-value">{animatedSummary.transferredCount}+</p>
        </article>
        <article className="stat-card">
          <p className="metric-label">Cases with assigned social worker</p>
          <p className="metric-value">{animatedSummary.withWorkerCount}+</p>
        </article>
        <article className="stat-card">
          <p className="metric-label">Closed cases</p>
          <p className="metric-value">{animatedSummary.closedCount}+</p>
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
          <label className="visually-hidden" htmlFor={statusFilterId}>
            Filter by case status
          </label>
          <select
            id={statusFilterId}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="All">All statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <label className="visually-hidden" htmlFor={safehouseFilterId}>
            Filter by safehouse
          </label>
          <select
            id={safehouseFilterId}
            value={safehouseFilter}
            onChange={(event) => setSafehouseFilter(event.target.value)}
          >
            <option value="All">All safehouses</option>
            {safehouses.map((safehouse) => (
              <option key={safehouse} value={safehouse}>
                {safehouse}
              </option>
            ))}
          </select>
        </div>

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
                    id={pageSizeId}
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
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={16} />
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
                  <ChevronRight size={16} />
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
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => navigate(`/caseload-inventory/${selectedCase.id}`)}
                >
                  Open case file
                </button>
              </div>
            </>
          ) : (
            <p className="auth-lead">No records match the current filters.</p>
          )}
        </section>
      </article>

      {showCreateResident && (
        <div className="resident-modal-backdrop" role="presentation" onClick={() => setShowCreateResident(false)}>
          <article className="resident-modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2>Create new resident case</h2>
            <form
              className="donor-entry-form"
              onSubmit={async (event) => {
                event.preventDefault();
                setCreateError(null);
                const f = createResidentForm;
                const placeOfBirth =
                  f.placePreset === 'Other' ? f.placeOther.trim() : f.placePreset;
                const needsClosedDate =
                  f.caseStatus === 'Closed' || f.caseStatus === 'Transferred';
                if (!f.safehouseId.trim()) {
                  setCreateError('Select a safehouse.');
                  return;
                }
                if (!placeOfBirth) {
                  setCreateError('Choose place of birth (or enter a city if you selected Other).');
                  return;
                }
                if (needsClosedDate && !f.dateClosed) {
                  setCreateError('Date closed is required for Closed or Transferred cases.');
                  return;
                }
                setCreatingResident(true);
                try {
                  const created = await caseloadApi.createResident({
                    caseControlNo: f.caseControlNo.trim(),
                    internalCode: f.internalCode.trim(),
                    caseStatus: f.caseStatus,
                    safehouseId: Number(f.safehouseId),
                    sex: f.sex,
                    dateOfBirth: f.dateOfBirth,
                    placeOfBirth,
                    religion: f.religion,
                    caseCategory: f.caseCategory,
                    assignedSocialWorker: f.assignedSocialWorker.trim() || undefined,
                    referralSource: f.referralSource,
                    dateAdmitted: f.dateAdmitted,
                    dateClosed: needsClosedDate ? f.dateClosed : undefined,
                    reintegrationType: f.reintegrationType,
                    reintegrationStatus: f.reintegrationStatus,
                  });
                  const data = await caseloadApi.residents();
                  setRows(data);
                  setActiveCaseId(created.residentId);
                  setShowCreateResident(false);
                  setCreateResidentForm({
                    caseControlNo: '',
                    internalCode: '',
                    caseStatus: 'Active',
                    safehouseId: '',
                    sex: 'F',
                    dateOfBirth: '',
                    placePreset: '',
                    placeOther: '',
                    religion: 'Unspecified',
                    caseCategory: '',
                    assignedSocialWorker: '',
                    referralSource: '',
                    dateAdmitted: '',
                    dateClosed: '',
                    reintegrationType: 'None',
                    reintegrationStatus: 'In Progress',
                  });
                } catch (err) {
                  setCreateError(err instanceof Error ? err.message : 'Failed to create resident.');
                } finally {
                  setCreatingResident(false);
                }
              }}
            >
              <p className="auth-lead" style={{ marginTop: 0 }}>
                Use the same values as your intake CSV (case status, referral source, reintegration fields). Dates are sent in UTC on the
                server so PostgreSQL accepts them.
              </p>
              <label>
                Resident code (e.g. LS-0061)
                <input
                  required
                  placeholder="LS-0061"
                  value={createResidentForm.internalCode}
                  onChange={(event) => setCreateResidentForm((c) => ({ ...c, internalCode: event.target.value }))}
                />
              </label>
              <label>
                Case control number
                <input
                  required
                  placeholder="C1234"
                  value={createResidentForm.caseControlNo}
                  onChange={(event) => setCreateResidentForm((c) => ({ ...c, caseControlNo: event.target.value }))}
                />
              </label>
              <label>
                Case status
                <select
                  required
                  value={createResidentForm.caseStatus}
                  onChange={(event) => setCreateResidentForm((c) => ({ ...c, caseStatus: event.target.value }))}
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {RESIDENT_CASE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Safehouse
                <select
                  required
                  value={createResidentForm.safehouseId}
                  onChange={(event) => setCreateResidentForm((c) => ({ ...c, safehouseId: event.target.value }))}
                >
                  <option value="">{safehouseOptions.length ? 'Select…' : 'Loading safehouses…'}</option>
                  {safehouseOptions.map((sh) => (
                    <option key={sh.id} value={String(sh.id)}>
                      {sh.name} (#{sh.id})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Assigned social worker (optional)
                <input
                  placeholder="SW-15"
                  value={createResidentForm.assignedSocialWorker}
                  onChange={(event) => setCreateResidentForm((c) => ({ ...c, assignedSocialWorker: event.target.value }))}
                />
              </label>
              <label>
                Sex
                <select
                  required
                  value={createResidentForm.sex}
                  onChange={(event) => setCreateResidentForm((c) => ({ ...c, sex: event.target.value }))}
                >
                  {RESIDENT_SEX.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date of birth
                <input
                  required
                  type="date"
                  value={createResidentForm.dateOfBirth}
                  onChange={(event) => setCreateResidentForm((c) => ({ ...c, dateOfBirth: event.target.value }))}
                />
              </label>
              <label>
                Place of birth
                <select
                  required
                  value={createResidentForm.placePreset}
                  onChange={(event) => setCreateResidentForm((c) => ({ ...c, placePreset: event.target.value }))}
                >
                  <option value="">Select…</option>
                  {RESIDENT_PLACE_PRESETS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              {createResidentForm.placePreset === 'Other' && (
                <label>
                  City / place (custom)
                  <input
                    required
                    value={createResidentForm.placeOther}
                    onChange={(event) => setCreateResidentForm((c) => ({ ...c, placeOther: event.target.value }))}
                  />
                </label>
              )}
              <label>
                Religion
                <select
                  required
                  value={createResidentForm.religion}
                  onChange={(event) => setCreateResidentForm((c) => ({ ...c, religion: event.target.value }))}
                >
                  {RESIDENT_RELIGIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Case category
                <select
                  required
                  value={createResidentForm.caseCategory}
                  onChange={(event) => setCreateResidentForm((c) => ({ ...c, caseCategory: event.target.value }))}
                >
                  <option value="">Select…</option>
                  {RESIDENT_CASE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Referral source
                <select
                  required
                  value={createResidentForm.referralSource}
                  onChange={(event) => setCreateResidentForm((c) => ({ ...c, referralSource: event.target.value }))}
                >
                  <option value="">Select…</option>
                  {RESIDENT_REFERRAL_SOURCES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date of admission
                <input
                  required
                  type="date"
                  value={createResidentForm.dateAdmitted}
                  onChange={(event) => setCreateResidentForm((c) => ({ ...c, dateAdmitted: event.target.value }))}
                />
              </label>
              {(createResidentForm.caseStatus === 'Closed' || createResidentForm.caseStatus === 'Transferred') && (
                <label>
                  Date closed
                  <input
                    required
                    type="date"
                    value={createResidentForm.dateClosed}
                    onChange={(event) => setCreateResidentForm((c) => ({ ...c, dateClosed: event.target.value }))}
                  />
                </label>
              )}
              <label>
                Reintegration type
                <select
                  required
                  value={createResidentForm.reintegrationType}
                  onChange={(event) => setCreateResidentForm((c) => ({ ...c, reintegrationType: event.target.value }))}
                >
                  {RESIDENT_REINTEGRATION_TYPES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Reintegration status
                <select
                  required
                  value={createResidentForm.reintegrationStatus}
                  onChange={(event) => setCreateResidentForm((c) => ({ ...c, reintegrationStatus: event.target.value }))}
                >
                  {RESIDENT_REINTEGRATION_STATUSES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              {createError && <p className="error-text">{createError}</p>}
              <div className="resident-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowCreateResident(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={creatingResident}>
                  {creatingResident ? 'Creating...' : 'Create resident'}
                </button>
              </div>
            </form>
          </article>
        </div>
      )}
    </section>
  );
}
