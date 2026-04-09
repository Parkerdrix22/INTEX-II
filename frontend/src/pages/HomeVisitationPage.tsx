import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'react-feather';
import {
  caseloadApi,
  type CaseloadResident,
  type HomeVisitation,
  type HomeVisitationSummary,
} from '../lib/api';
import heroImage from '../background.jpg?format=webp&quality=82&w=1920';

type YesNoUnknown = '' | 'true' | 'false';

type HomeFormState = {
  residentId: string;
  visitDate: string;
  socialWorker: string;
  visitType: string;
  locationVisited: string;
  familyMembersPresent: string;
  purpose: string;
  observations: string;
  familyCooperationLevel: string;
  safetyConcernsNoted: YesNoUnknown;
  followUpNeeded: YesNoUnknown;
  followUpNotes: string;
  visitOutcome: string;
};

type HomeEditorState = HomeFormState & {
  recordKey: string;
  residentLabel: string;
};

const BLANK_FORM: HomeFormState = {
  residentId: '',
  visitDate: '',
  socialWorker: '',
  visitType: 'Routine follow-up',
  locationVisited: '',
  familyMembersPresent: '',
  purpose: '',
  observations: '',
  familyCooperationLevel: 'Neutral',
  safetyConcernsNoted: '',
  followUpNeeded: '',
  followUpNotes: '',
  visitOutcome: 'Favorable',
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function boolToSelect(value: boolean | null | undefined): YesNoUnknown {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return '';
}

function yesNo(value: boolean | null | undefined): string {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return '—';
}

function statusClass(status: string | null): string {
  if (!status) return 'case-status-pill case-status-pill--prep';
  const normalized = status.toLowerCase();
  if (normalized.includes('open')) return 'case-status-pill case-status-pill--open';
  if (normalized.includes('progress')) return 'case-status-pill case-status-pill--progress';
  if (normalized.includes('closed')) return 'case-status-pill case-status-pill--closed';
  return 'case-status-pill case-status-pill--prep';
}

function residentDisplayName(row: CaseloadResident): string {
  return row.caseControlNo || `Resident #${row.id}`;
}

export function HomeVisitationPage() {
  const [rows, setRows] = useState<HomeVisitationSummary[]>([]);
  const [residents, setResidents] = useState<CaseloadResident[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [visitTypeFilter, setVisitTypeFilter] = useState<'All' | string>('All');
  const [safetyFilter, setSafetyFilter] = useState<'All' | 'Safety' | 'FollowUp'>('All');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<HomeFormState>(BLANK_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [viewing, setViewing] = useState<HomeVisitation & { residentLabel: string; residentId: number } | null>(null);
  const [editor, setEditor] = useState<HomeEditorState | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const refresh = async () => {
    const [visitData, residentData] = await Promise.all([
      caseloadApi.listAllHomeVisitations(),
      caseloadApi.residents(),
    ]);
    setRows(visitData);
    setResidents(residentData);
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        await refresh();
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

  const openViewer = async (row: HomeVisitationSummary) => {
    setEditError(null);
    try {
      const full = await caseloadApi.homeVisitations(row.residentId);
      const record = full.find((candidate) => candidate.recordKey === row.recordKey);
      if (!record) {
        setLoadError('Could not find the full record. The list may be stale — refreshing.');
        await refresh();
        return;
      }
      setViewing({ ...record, residentLabel: row.residentLabel, residentId: row.residentId });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load record details.');
    }
  };

  const switchToEdit = () => {
    if (!viewing) return;
    setEditor({
      recordKey: viewing.recordKey,
      residentLabel: viewing.residentLabel,
      residentId: String(viewing.residentId),
      visitDate: toDateInput(viewing.visitDate),
      socialWorker: viewing.socialWorker ?? '',
      visitType: viewing.visitType,
      locationVisited: viewing.locationVisited ?? '',
      familyMembersPresent: viewing.familyMembersPresent ?? '',
      purpose: viewing.purpose ?? '',
      observations: viewing.observations ?? '',
      familyCooperationLevel: viewing.familyCooperationLevel ?? 'Neutral',
      safetyConcernsNoted: boolToSelect(viewing.safetyConcernsNoted),
      followUpNeeded: boolToSelect(viewing.followUpNeeded),
      followUpNotes: viewing.followUpNotes ?? '',
      visitOutcome: viewing.visitOutcome ?? 'Favorable',
    });
    setViewing(null);
  };

  const buildPayload = (form: HomeFormState) => ({
    visitDate: form.visitDate,
    visitType: form.visitType,
    socialWorker: form.socialWorker || undefined,
    locationVisited: form.locationVisited || undefined,
    familyMembersPresent: form.familyMembersPresent || undefined,
    purpose: form.purpose || undefined,
    observations: form.observations || undefined,
    familyCooperationLevel: form.familyCooperationLevel || undefined,
    safetyConcernsNoted:
      form.safetyConcernsNoted === '' ? undefined : form.safetyConcernsNoted === 'true',
    followUpNeeded: form.followUpNeeded === '' ? undefined : form.followUpNeeded === 'true',
    followUpNotes: form.followUpNotes || undefined,
    visitOutcome: form.visitOutcome || undefined,
  });

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault();
    setCreateError(null);
    if (!createForm.residentId) {
      setCreateError('Please pick a resident.');
      return;
    }
    setCreating(true);
    try {
      await caseloadApi.addHomeVisitation(Number(createForm.residentId), buildPayload(createForm));
      await refresh();
      setCreateForm(BLANK_FORM);
      setShowCreate(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create home visitation.');
    } finally {
      setCreating(false);
    }
  };

  const submitEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editor) return;
    setEditError(null);
    setSavingEdit(true);
    try {
      await caseloadApi.updateHomeVisitation(
        Number(editor.residentId),
        editor.recordKey,
        buildPayload(editor),
      );
      await refresh();
      setEditor(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update home visitation.');
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteRecord = async () => {
    if (!editor) return;
    if (!window.confirm('Delete this home visitation? This cannot be undone.')) return;
    setEditError(null);
    setSavingEdit(true);
    try {
      await caseloadApi.deleteHomeVisitation(Number(editor.residentId), editor.recordKey);
      await refresh();
      setEditor(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to delete home visitation.');
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteFromViewer = async () => {
    if (!viewing) return;
    if (!window.confirm('Delete this home visitation? This cannot be undone.')) return;
    try {
      await caseloadApi.deleteHomeVisitation(viewing.residentId, viewing.recordKey);
      await refresh();
      setViewing(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to delete home visitation.');
    }
  };

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
            All field visits and case conferences across every safehouse. Create new visits, edit existing
            records, and filter by visit type, safety concerns, or follow-up status.
          </p>
          <div className="kateri-hero-actions">
            <button
              type="button"
              className="btn-kateri-gold"
              onClick={() => {
                setCreateError(null);
                setCreateForm({
                  ...BLANK_FORM,
                  visitDate: toDateInput(new Date().toISOString()),
                });
                setShowCreate(true);
              }}
            >
              + New home visitation
            </button>
          </div>
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

        <div className="caseload-table-wrap home-visitation-table-wrap">
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
              </tr>
            </thead>
            <tbody>
              {!loading &&
                !loadError &&
                pagedRows.map((row) => (
                  <tr
                    key={`${row.residentId}-${row.recordKey}`}
                    className="resident-record-row"
                    onClick={() => void openViewer(row)}
                  >
                    <td>{formatDate(row.visitDate)}</td>
                    <td onClick={(event) => event.stopPropagation()}>
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
      </article>

      {viewing && (
        <div className="resident-modal-backdrop" role="presentation" onClick={() => setViewing(null)}>
          <article
            className="resident-modal-card record-detail-card"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="record-detail-card__header">
              <div>
                <p className="record-detail-card__eyebrow">Home visitation</p>
                <h2>{formatDate(viewing.visitDate)}</h2>
                <p className="auth-lead" style={{ margin: 0 }}>
                  Resident: <strong>{viewing.residentLabel}</strong> · Visit type:{' '}
                  <strong>{viewing.visitType}</strong>
                </p>
              </div>
            </header>

            <dl className="record-detail-grid">
              <div>
                <dt>Social worker</dt>
                <dd>{viewing.socialWorker || '—'}</dd>
              </div>
              <div>
                <dt>Location visited</dt>
                <dd>{viewing.locationVisited || '—'}</dd>
              </div>
              <div>
                <dt>Family members present</dt>
                <dd>{viewing.familyMembersPresent || '—'}</dd>
              </div>
              <div>
                <dt>Family cooperation</dt>
                <dd>{viewing.familyCooperationLevel || '—'}</dd>
              </div>
              <div>
                <dt>Visit outcome</dt>
                <dd>{viewing.visitOutcome || '—'}</dd>
              </div>
              <div>
                <dt>Purpose</dt>
                <dd>{viewing.purpose || '—'}</dd>
              </div>
              <div>
                <dt>Safety concerns</dt>
                <dd>{yesNo(viewing.safetyConcernsNoted)}</dd>
              </div>
              <div>
                <dt>Follow-up needed</dt>
                <dd>{yesNo(viewing.followUpNeeded)}</dd>
              </div>
            </dl>

            <div className="record-detail-card__section">
              <h3>Observations</h3>
              <p className="record-detail-card__prose">
                {viewing.observations?.trim() || 'No observations recorded.'}
              </p>
            </div>

            {viewing.followUpNotes?.trim() && (
              <div className="record-detail-card__section">
                <h3>Follow-up notes</h3>
                <p className="record-detail-card__prose">{viewing.followUpNotes}</p>
              </div>
            )}

            <div className="resident-modal-actions">
              <button type="button" className="btn-secondary" onClick={() => void deleteFromViewer()}>
                Delete
              </button>
              <button type="button" className="btn-secondary" onClick={() => setViewing(null)}>
                Close
              </button>
              <Link
                className="btn-secondary"
                to={`/caseload-inventory/${viewing.residentId}`}
                onClick={() => setViewing(null)}
              >
                Open case file
              </Link>
              <button type="button" className="btn-primary" onClick={switchToEdit}>
                Edit
              </button>
            </div>
          </article>
        </div>
      )}

      {showCreate && (
        <div className="resident-modal-backdrop" role="presentation" onClick={() => setShowCreate(false)}>
          <article
            className="resident-modal-card"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>New home visitation</h2>
            <form className="donor-entry-form" onSubmit={submitCreate}>
              <label>
                Resident
                <select
                  required
                  value={createForm.residentId}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, residentId: event.target.value }))
                  }
                >
                  <option value="">Select resident…</option>
                  {residents.map((resident) => (
                    <option key={resident.id} value={resident.id}>
                      {residentDisplayName(resident)} — {resident.caseStatus}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Visit date
                <input
                  type="date"
                  required
                  value={createForm.visitDate}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, visitDate: event.target.value }))
                  }
                />
              </label>
              <label>
                Visit type
                <select
                  value={createForm.visitType}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, visitType: event.target.value }))
                  }
                >
                  <option>Initial assessment</option>
                  <option>Routine follow-up</option>
                  <option>Reintegration assessment</option>
                  <option>Post-placement monitoring</option>
                  <option>Emergency</option>
                </select>
              </label>
              <label>
                Social worker
                <input
                  type="text"
                  value={createForm.socialWorker}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, socialWorker: event.target.value }))
                  }
                />
              </label>
              <label>
                Location visited
                <input
                  type="text"
                  value={createForm.locationVisited}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, locationVisited: event.target.value }))
                  }
                />
              </label>
              <label>
                Family members present
                <input
                  type="text"
                  value={createForm.familyMembersPresent}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      familyMembersPresent: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Purpose
                <input
                  type="text"
                  value={createForm.purpose}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, purpose: event.target.value }))
                  }
                />
              </label>
              <label>
                Observations
                <textarea
                  rows={4}
                  value={createForm.observations}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, observations: event.target.value }))
                  }
                />
              </label>
              <label>
                Family cooperation level
                <select
                  value={createForm.familyCooperationLevel}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      familyCooperationLevel: event.target.value,
                    }))
                  }
                >
                  <option>Uncooperative</option>
                  <option>Neutral</option>
                  <option>Cooperative</option>
                  <option>Highly Cooperative</option>
                </select>
              </label>
              <label>
                Safety concerns noted
                <select
                  value={createForm.safetyConcernsNoted}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      safetyConcernsNoted: event.target.value as YesNoUnknown,
                    }))
                  }
                >
                  <option value="">Select…</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
              <label>
                Follow-up needed
                <select
                  value={createForm.followUpNeeded}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      followUpNeeded: event.target.value as YesNoUnknown,
                    }))
                  }
                >
                  <option value="">Select…</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
              <label>
                Follow-up notes
                <textarea
                  rows={3}
                  value={createForm.followUpNotes}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, followUpNotes: event.target.value }))
                  }
                />
              </label>
              <label>
                Visit outcome
                <select
                  value={createForm.visitOutcome}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, visitOutcome: event.target.value }))
                  }
                >
                  <option>Favorable</option>
                  <option>Unfavorable</option>
                  <option>Needs improvement</option>
                  <option>Inconclusive</option>
                </select>
              </label>
              {createError && <p className="error-text">{createError}</p>}
              <div className="resident-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={creating}>
                  {creating ? 'Creating…' : 'Create visit'}
                </button>
              </div>
            </form>
          </article>
        </div>
      )}

      {editor && (
        <div className="resident-modal-backdrop" role="presentation" onClick={() => setEditor(null)}>
          <article
            className="resident-modal-card"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Edit home visitation</h2>
            <p className="auth-lead" style={{ marginTop: 0 }}>
              Resident: <strong>{editor.residentLabel}</strong>
            </p>
            <form className="donor-entry-form" onSubmit={submitEdit}>
              <label>
                Visit date
                <input
                  type="date"
                  required
                  value={editor.visitDate}
                  onChange={(event) =>
                    setEditor((current) => (current ? { ...current, visitDate: event.target.value } : current))
                  }
                />
              </label>
              <label>
                Visit type
                <select
                  value={editor.visitType}
                  onChange={(event) =>
                    setEditor((current) => (current ? { ...current, visitType: event.target.value } : current))
                  }
                >
                  <option>Initial assessment</option>
                  <option>Routine follow-up</option>
                  <option>Reintegration assessment</option>
                  <option>Post-placement monitoring</option>
                  <option>Emergency</option>
                </select>
              </label>
              <label>
                Social worker
                <input
                  type="text"
                  value={editor.socialWorker}
                  onChange={(event) =>
                    setEditor((current) => (current ? { ...current, socialWorker: event.target.value } : current))
                  }
                />
              </label>
              <label>
                Location visited
                <input
                  type="text"
                  value={editor.locationVisited}
                  onChange={(event) =>
                    setEditor((current) =>
                      current ? { ...current, locationVisited: event.target.value } : current,
                    )
                  }
                />
              </label>
              <label>
                Family members present
                <input
                  type="text"
                  value={editor.familyMembersPresent}
                  onChange={(event) =>
                    setEditor((current) =>
                      current ? { ...current, familyMembersPresent: event.target.value } : current,
                    )
                  }
                />
              </label>
              <label>
                Purpose
                <input
                  type="text"
                  value={editor.purpose}
                  onChange={(event) =>
                    setEditor((current) => (current ? { ...current, purpose: event.target.value } : current))
                  }
                />
              </label>
              <label>
                Observations
                <textarea
                  rows={4}
                  value={editor.observations}
                  onChange={(event) =>
                    setEditor((current) =>
                      current ? { ...current, observations: event.target.value } : current,
                    )
                  }
                />
              </label>
              <label>
                Family cooperation level
                <select
                  value={editor.familyCooperationLevel}
                  onChange={(event) =>
                    setEditor((current) =>
                      current ? { ...current, familyCooperationLevel: event.target.value } : current,
                    )
                  }
                >
                  <option>Uncooperative</option>
                  <option>Neutral</option>
                  <option>Cooperative</option>
                  <option>Highly Cooperative</option>
                </select>
              </label>
              <label>
                Safety concerns noted
                <select
                  value={editor.safetyConcernsNoted}
                  onChange={(event) =>
                    setEditor((current) =>
                      current
                        ? { ...current, safetyConcernsNoted: event.target.value as YesNoUnknown }
                        : current,
                    )
                  }
                >
                  <option value="">Select…</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
              <label>
                Follow-up needed
                <select
                  value={editor.followUpNeeded}
                  onChange={(event) =>
                    setEditor((current) =>
                      current
                        ? { ...current, followUpNeeded: event.target.value as YesNoUnknown }
                        : current,
                    )
                  }
                >
                  <option value="">Select…</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
              <label>
                Follow-up notes
                <textarea
                  rows={3}
                  value={editor.followUpNotes}
                  onChange={(event) =>
                    setEditor((current) =>
                      current ? { ...current, followUpNotes: event.target.value } : current,
                    )
                  }
                />
              </label>
              <label>
                Visit outcome
                <select
                  value={editor.visitOutcome}
                  onChange={(event) =>
                    setEditor((current) =>
                      current ? { ...current, visitOutcome: event.target.value } : current,
                    )
                  }
                >
                  <option>Favorable</option>
                  <option>Unfavorable</option>
                  <option>Needs improvement</option>
                  <option>Inconclusive</option>
                </select>
              </label>
              {editError && <p className="error-text">{editError}</p>}
              <div className="resident-modal-actions">
                <button type="button" className="btn-secondary" onClick={deleteRecord} disabled={savingEdit}>
                  Delete visit
                </button>
                <button type="button" className="btn-secondary" onClick={() => setEditor(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={savingEdit}>
                  {savingEdit ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </article>
        </div>
      )}
    </section>
  );
}
