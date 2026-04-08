import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  caseloadApi,
  type CaseloadResident,
  type ProcessRecording,
  type ProcessRecordingSummary,
} from '../lib/api';
import heroImage from '../background.jpg?format=webp&quality=82&w=1920';

type YesNoUnknown = '' | 'true' | 'false';

type ProcessFormState = {
  residentId: string;
  sessionDate: string;
  socialWorker: string;
  sessionType: string;
  sessionDurationMinutes: string;
  emotionalStateObserved: string;
  emotionalStateEnd: string;
  sessionNarrative: string;
  interventionsApplied: string;
  followUpActions: string;
  progressNoted: YesNoUnknown;
  concernsFlagged: YesNoUnknown;
  referralMade: YesNoUnknown;
  notesRestricted: string;
};

type ProcessEditorState = ProcessFormState & {
  recordKey: string;
  residentLabel: string;
};

const BLANK_FORM: ProcessFormState = {
  residentId: '',
  sessionDate: '',
  socialWorker: '',
  sessionType: 'Individual',
  sessionDurationMinutes: '',
  emotionalStateObserved: '',
  emotionalStateEnd: '',
  sessionNarrative: '',
  interventionsApplied: '',
  followUpActions: '',
  progressNoted: '',
  concernsFlagged: '',
  referralMade: '',
  notesRestricted: '',
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

/** Short preview for the list table; full text is in the row-detail modal. */
function truncateNarrativePreview(text: string | null | undefined, maxWords = 8): string {
  const s = text?.trim();
  if (!s) return '—';
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return s;
  return `${words.slice(0, maxWords).join(' ')}…`;
}

export function ProcessRecordingPage() {
  const [rows, setRows] = useState<ProcessRecordingSummary[]>([]);
  const [residents, setResidents] = useState<CaseloadResident[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sessionTypeFilter, setSessionTypeFilter] = useState<'All' | string>('All');
  const [flagFilter, setFlagFilter] = useState<'All' | 'Concerns' | 'Progress'>('All');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<ProcessFormState>(BLANK_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [viewing, setViewing] = useState<ProcessRecording & { residentLabel: string; residentId: number } | null>(null);
  const [editor, setEditor] = useState<ProcessEditorState | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const refresh = async () => {
    const [recordingData, residentData] = await Promise.all([
      caseloadApi.listAllProcessRecordings(),
      caseloadApi.residents(),
    ]);
    setRows(recordingData);
    setResidents(residentData);
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        await refresh();
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

  const openViewer = async (row: ProcessRecordingSummary) => {
    // The summary row only carries enough to render the list. Fetch the full
    // per-resident list and pick out the matching recordKey so the details
    // card (and subsequent edit form) has every field.
    setEditError(null);
    try {
      const full = await caseloadApi.processRecordings(row.residentId);
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
      sessionDate: toDateInput(viewing.sessionDate),
      socialWorker: viewing.socialWorker ?? '',
      sessionType: viewing.sessionType,
      sessionDurationMinutes:
        viewing.sessionDurationMinutes != null ? String(viewing.sessionDurationMinutes) : '',
      emotionalStateObserved: viewing.emotionalStateObserved ?? '',
      emotionalStateEnd: viewing.emotionalStateEnd ?? '',
      sessionNarrative: viewing.sessionNarrative ?? '',
      interventionsApplied: viewing.interventionsApplied ?? '',
      followUpActions: viewing.followUpActions ?? '',
      progressNoted: boolToSelect(viewing.progressNoted),
      concernsFlagged: boolToSelect(viewing.concernsFlagged),
      referralMade: boolToSelect(viewing.referralMade),
      notesRestricted: viewing.notesRestricted ?? '',
    });
    setViewing(null);
  };

  const buildPayload = (form: ProcessFormState) => ({
    sessionDate: form.sessionDate,
    sessionType: form.sessionType,
    socialWorker: form.socialWorker || undefined,
    sessionDurationMinutes:
      form.sessionDurationMinutes.trim() === '' ? undefined : Number(form.sessionDurationMinutes),
    emotionalStateObserved: form.emotionalStateObserved || undefined,
    emotionalStateEnd: form.emotionalStateEnd || undefined,
    sessionNarrative: form.sessionNarrative || undefined,
    interventionsApplied: form.interventionsApplied || undefined,
    followUpActions: form.followUpActions || undefined,
    progressNoted: form.progressNoted === '' ? undefined : form.progressNoted === 'true',
    concernsFlagged: form.concernsFlagged === '' ? undefined : form.concernsFlagged === 'true',
    referralMade: form.referralMade === '' ? undefined : form.referralMade === 'true',
    notesRestricted: form.notesRestricted || undefined,
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
      await caseloadApi.addProcessRecording(Number(createForm.residentId), buildPayload(createForm));
      await refresh();
      setCreateForm(BLANK_FORM);
      setShowCreate(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create process recording.');
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
      await caseloadApi.updateProcessRecording(
        Number(editor.residentId),
        editor.recordKey,
        buildPayload(editor),
      );
      await refresh();
      setEditor(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update process recording.');
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteRecord = async () => {
    if (!editor) return;
    if (!window.confirm('Delete this process recording? This cannot be undone.')) return;
    setEditError(null);
    setSavingEdit(true);
    try {
      await caseloadApi.deleteProcessRecording(Number(editor.residentId), editor.recordKey);
      await refresh();
      setEditor(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to delete process recording.');
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteFromViewer = async () => {
    if (!viewing) return;
    if (!window.confirm('Delete this process recording? This cannot be undone.')) return;
    try {
      await caseloadApi.deleteProcessRecording(viewing.residentId, viewing.recordKey);
      await refresh();
      setViewing(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to delete process recording.');
    }
  };

  const yesNo = (value: boolean | null | undefined): string =>
    value === true ? 'Yes' : value === false ? 'No' : '—';

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
            Every counseling session logged across all residents. Create new sessions, edit or delete
            existing ones, and filter by session type, social worker, or flagged concerns.
          </p>
          <div className="kateri-hero-actions">
            <button
              type="button"
              className="btn-kateri-gold"
              onClick={() => {
                setCreateError(null);
                setCreateForm({
                  ...BLANK_FORM,
                  sessionDate: toDateInput(new Date().toISOString()),
                });
                setShowCreate(true);
              }}
            >
              + New process recording
            </button>
          </div>
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

        <div className="caseload-table-wrap process-recording-table-wrap">
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
                  <tr
                    key={`${row.residentId}-${row.recordKey}`}
                    className="resident-record-row"
                    onClick={() => void openViewer(row)}
                  >
                    <td>{formatDate(row.sessionDate)}</td>
                    <td onClick={(event) => event.stopPropagation()}>
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
                    <td
                      className="caseload-narrative-cell process-recording-narrative-preview"
                      title={
                        row.narrativePreview?.trim()
                          ? `${row.narrativePreview.trim()} — Click the row for the full record.`
                          : undefined
                      }
                    >
                      {truncateNarrativePreview(row.narrativePreview)}
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
      </article>

      {showCreate && (
        <div
          className="resident-modal-backdrop"
          role="presentation"
          onClick={() => setShowCreate(false)}
        >
          <article
            className="resident-modal-card"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>New process recording</h2>
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
                Session date
                <input
                  type="date"
                  required
                  value={createForm.sessionDate}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, sessionDate: event.target.value }))
                  }
                />
              </label>
              <label>
                Session type
                <select
                  value={createForm.sessionType}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, sessionType: event.target.value }))
                  }
                >
                  <option>Individual</option>
                  <option>Group</option>
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
                Session duration (minutes)
                <input
                  type="number"
                  min={1}
                  value={createForm.sessionDurationMinutes}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      sessionDurationMinutes: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Emotional state observed
                <input
                  type="text"
                  value={createForm.emotionalStateObserved}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      emotionalStateObserved: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Emotional state end
                <input
                  type="text"
                  value={createForm.emotionalStateEnd}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      emotionalStateEnd: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Session narrative
                <textarea
                  rows={4}
                  value={createForm.sessionNarrative}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      sessionNarrative: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Interventions applied
                <select
                  value={createForm.interventionsApplied}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      interventionsApplied: event.target.value,
                    }))
                  }
                >
                  <option value="">Select…</option>
                  <option>Caring</option>
                  <option>Healing</option>
                  <option>Teaching</option>
                  <option>Life Skills</option>
                  <option>Legal Services</option>
                  <option>Referral to specialist</option>
                </select>
              </label>
              <label>
                Follow-up actions
                <input
                  type="text"
                  value={createForm.followUpActions}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      followUpActions: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Progress noted
                <select
                  value={createForm.progressNoted}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      progressNoted: event.target.value as YesNoUnknown,
                    }))
                  }
                >
                  <option value="">Select…</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
              <label>
                Concerns flagged
                <select
                  value={createForm.concernsFlagged}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      concernsFlagged: event.target.value as YesNoUnknown,
                    }))
                  }
                >
                  <option value="">Select…</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
              <label>
                Referral made
                <select
                  value={createForm.referralMade}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      referralMade: event.target.value as YesNoUnknown,
                    }))
                  }
                >
                  <option value="">Select…</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
              <label>
                Notes (restricted)
                <textarea
                  rows={3}
                  value={createForm.notesRestricted}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      notesRestricted: event.target.value,
                    }))
                  }
                />
              </label>
              {createError && <p className="error-text">{createError}</p>}
              <div className="resident-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={creating}>
                  {creating ? 'Creating…' : 'Create recording'}
                </button>
              </div>
            </form>
          </article>
        </div>
      )}

      {viewing && (
        <div
          className="resident-modal-backdrop"
          role="presentation"
          onClick={() => setViewing(null)}
        >
          <article
            className="resident-modal-card record-detail-card"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="record-detail-card__header">
              <div>
                <p className="record-detail-card__eyebrow">Process recording</p>
                <h2>{formatDate(viewing.sessionDate)}</h2>
                <p className="auth-lead" style={{ margin: 0 }}>
                  Resident: <strong>{viewing.residentLabel}</strong> · Session type:{' '}
                  <strong>{viewing.sessionType}</strong>
                </p>
              </div>
            </header>

            <dl className="record-detail-grid">
              <div>
                <dt>Social worker</dt>
                <dd>{viewing.socialWorker || '—'}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>
                  {viewing.sessionDurationMinutes != null
                    ? `${viewing.sessionDurationMinutes} minutes`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Emotional state (start)</dt>
                <dd>{viewing.emotionalStateObserved || '—'}</dd>
              </div>
              <div>
                <dt>Emotional state (end)</dt>
                <dd>{viewing.emotionalStateEnd || '—'}</dd>
              </div>
              <div>
                <dt>Interventions applied</dt>
                <dd>{viewing.interventionsApplied || '—'}</dd>
              </div>
              <div>
                <dt>Follow-up actions</dt>
                <dd>{viewing.followUpActions || '—'}</dd>
              </div>
              <div>
                <dt>Progress noted</dt>
                <dd>{yesNo(viewing.progressNoted)}</dd>
              </div>
              <div>
                <dt>Concerns flagged</dt>
                <dd>{yesNo(viewing.concernsFlagged)}</dd>
              </div>
              <div>
                <dt>Referral made</dt>
                <dd>{yesNo(viewing.referralMade)}</dd>
              </div>
            </dl>

            <div className="record-detail-card__section">
              <h3>Session narrative</h3>
              <p className="record-detail-card__prose">
                {viewing.sessionNarrative?.trim() || 'No narrative recorded.'}
              </p>
            </div>

            {viewing.notesRestricted?.trim() && (
              <div className="record-detail-card__section">
                <h3>Restricted notes</h3>
                <p className="record-detail-card__prose">{viewing.notesRestricted}</p>
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

      {editor && (
        <div className="resident-modal-backdrop" role="presentation" onClick={() => setEditor(null)}>
          <article
            className="resident-modal-card"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Edit process recording</h2>
            <p className="auth-lead" style={{ marginTop: 0 }}>
              Resident: <strong>{editor.residentLabel}</strong>
            </p>
            <form className="donor-entry-form" onSubmit={submitEdit}>
              <label>
                Session date
                <input
                  type="date"
                  required
                  value={editor.sessionDate}
                  onChange={(event) =>
                    setEditor((current) => (current ? { ...current, sessionDate: event.target.value } : current))
                  }
                />
              </label>
              <label>
                Session type
                <select
                  value={editor.sessionType}
                  onChange={(event) =>
                    setEditor((current) => (current ? { ...current, sessionType: event.target.value } : current))
                  }
                >
                  <option>Individual</option>
                  <option>Group</option>
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
                Session duration (minutes)
                <input
                  type="number"
                  min={1}
                  value={editor.sessionDurationMinutes}
                  onChange={(event) =>
                    setEditor((current) =>
                      current ? { ...current, sessionDurationMinutes: event.target.value } : current,
                    )
                  }
                />
              </label>
              <label>
                Emotional state observed
                <input
                  type="text"
                  value={editor.emotionalStateObserved}
                  onChange={(event) =>
                    setEditor((current) =>
                      current ? { ...current, emotionalStateObserved: event.target.value } : current,
                    )
                  }
                />
              </label>
              <label>
                Emotional state end
                <input
                  type="text"
                  value={editor.emotionalStateEnd}
                  onChange={(event) =>
                    setEditor((current) =>
                      current ? { ...current, emotionalStateEnd: event.target.value } : current,
                    )
                  }
                />
              </label>
              <label>
                Session narrative
                <textarea
                  rows={4}
                  value={editor.sessionNarrative}
                  onChange={(event) =>
                    setEditor((current) =>
                      current ? { ...current, sessionNarrative: event.target.value } : current,
                    )
                  }
                />
              </label>
              <label>
                Interventions applied
                <select
                  value={editor.interventionsApplied}
                  onChange={(event) =>
                    setEditor((current) =>
                      current ? { ...current, interventionsApplied: event.target.value } : current,
                    )
                  }
                >
                  <option value="">Select…</option>
                  <option>Caring</option>
                  <option>Healing</option>
                  <option>Teaching</option>
                  <option>Life Skills</option>
                  <option>Legal Services</option>
                  <option>Referral to specialist</option>
                </select>
              </label>
              <label>
                Follow-up actions
                <input
                  type="text"
                  value={editor.followUpActions}
                  onChange={(event) =>
                    setEditor((current) =>
                      current ? { ...current, followUpActions: event.target.value } : current,
                    )
                  }
                />
              </label>
              <label>
                Progress noted
                <select
                  value={editor.progressNoted}
                  onChange={(event) =>
                    setEditor((current) =>
                      current
                        ? { ...current, progressNoted: event.target.value as YesNoUnknown }
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
                Concerns flagged
                <select
                  value={editor.concernsFlagged}
                  onChange={(event) =>
                    setEditor((current) =>
                      current
                        ? { ...current, concernsFlagged: event.target.value as YesNoUnknown }
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
                Referral made
                <select
                  value={editor.referralMade}
                  onChange={(event) =>
                    setEditor((current) =>
                      current
                        ? { ...current, referralMade: event.target.value as YesNoUnknown }
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
                Notes (restricted)
                <textarea
                  rows={3}
                  value={editor.notesRestricted}
                  onChange={(event) =>
                    setEditor((current) =>
                      current ? { ...current, notesRestricted: event.target.value } : current,
                    )
                  }
                />
              </label>
              {editError && <p className="error-text">{editError}</p>}
              <div className="resident-modal-actions">
                <button type="button" className="btn-secondary" onClick={deleteRecord} disabled={savingEdit}>
                  Delete recording
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
