import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  caseloadApi,
  type HomeVisitation,
  type ProcessRecording,
  type ResidentDetail,
} from '../lib/api';

type CaseTab = 'profile' | 'process' | 'home';

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

export function ResidentCasePage() {
  const { residentId } = useParams();
  const numericId = Number(residentId);
  const [activeTab, setActiveTab] = useState<CaseTab>('profile');
  const [detail, setDetail] = useState<ResidentDetail | null>(null);
  const [processHistory, setProcessHistory] = useState<ProcessRecording[]>([]);
  const [homeHistory, setHomeHistory] = useState<HomeVisitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingProcess, setSavingProcess] = useState(false);
  const [savingHome, setSavingHome] = useState(false);

  const [processForm, setProcessForm] = useState({
    sessionDate: '',
    socialWorker: '',
    sessionType: 'Individual',
    emotionalState: '',
    narrativeSummary: '',
    interventionsApplied: '',
    followUpActions: '',
  });

  const [homeForm, setHomeForm] = useState({
    visitDate: '',
    visitType: 'Routine follow-up',
    observations: '',
    familyCooperationLevel: '',
    safetyConcerns: '',
    followUpActions: '',
  });

  useEffect(() => {
    if (!Number.isFinite(numericId) || numericId <= 0) {
      setError('Invalid resident id.');
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [resident, processRows, homeRows] = await Promise.all([
          caseloadApi.residentDetail(numericId),
          caseloadApi.processRecordings(numericId),
          caseloadApi.homeVisitations(numericId),
        ]);
        setDetail(resident);
        setProcessHistory(processRows);
        setHomeHistory(homeRows);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load resident case file.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [numericId]);

  const submitProcessRecording = async (event: FormEvent) => {
    event.preventDefault();
    if (!detail) return;
    setSavingProcess(true);
    try {
      await caseloadApi.addProcessRecording(detail.id, processForm);
      const rows = await caseloadApi.processRecordings(detail.id);
      setProcessHistory(rows);
      setProcessForm({
        sessionDate: '',
        socialWorker: '',
        sessionType: 'Individual',
        emotionalState: '',
        narrativeSummary: '',
        interventionsApplied: '',
        followUpActions: '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save process recording.');
    } finally {
      setSavingProcess(false);
    }
  };

  const submitHomeVisitation = async (event: FormEvent) => {
    event.preventDefault();
    if (!detail) return;
    setSavingHome(true);
    try {
      await caseloadApi.addHomeVisitation(detail.id, homeForm);
      const rows = await caseloadApi.homeVisitations(detail.id);
      setHomeHistory(rows);
      setHomeForm({
        visitDate: '',
        visitType: 'Routine follow-up',
        observations: '',
        familyCooperationLevel: '',
        safetyConcerns: '',
        followUpActions: '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save home visitation.');
    } finally {
      setSavingHome(false);
    }
  };

  if (loading) {
    return <section className="blank-page">Loading resident case file...</section>;
  }

  if (error) {
    return (
      <section className="blank-page">
        <p className="error-text">{error}</p>
        <Link to="/caseload-inventory">Back to caseload inventory</Link>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="blank-page">
        <p className="error-text">Resident not found.</p>
        <Link to="/caseload-inventory">Back to caseload inventory</Link>
      </section>
    );
  }

  return (
    <section className="resident-case-page">
      <header className="resident-case-page__header">
        <div>
          <p className="metric-label">Resident case file</p>
          <h1>{detail.displayName}</h1>
          <p className="auth-lead">
            Case control no: {detail.caseControlNo} • Status: {detail.caseStatus}
          </p>
        </div>
        <Link className="btn-primary resident-case-btn" to="/caseload-inventory">
          Back to list
        </Link>
      </header>

      <article className="auth-card resident-case-card">
        <div className="donor-tabs" role="tablist" aria-label="Resident case sections">
          <button
            type="button"
            className={`donor-tab${activeTab === 'profile' ? ' donor-tab--active' : ''}`}
            aria-selected={activeTab === 'profile'}
            onClick={() => setActiveTab('profile')}
          >
            Personal information
          </button>
          <button
            type="button"
            className={`donor-tab${activeTab === 'process' ? ' donor-tab--active' : ''}`}
            aria-selected={activeTab === 'process'}
            onClick={() => setActiveTab('process')}
          >
            Process recording
          </button>
          <button
            type="button"
            className={`donor-tab${activeTab === 'home' ? ' donor-tab--active' : ''}`}
            aria-selected={activeTab === 'home'}
            onClick={() => setActiveTab('home')}
          >
            Home visitation & case conferences
          </button>
        </div>

        {activeTab === 'profile' && (
          <section className="resident-case-grid">
            <article className="resident-case-panel resident-info-grid">
              <label>Resident ID<input value={detail.id} readOnly /></label>
              <label>Case control no<input value={detail.caseControlNo} readOnly /></label>
              <label>Safehouse<input value={detail.safehouseName ?? detail.safehouseId ?? 'Unassigned'} readOnly /></label>
              <label>Assigned social worker<input value={detail.assignedSocialWorker ?? ''} readOnly /></label>
              <label>Sex<input value={detail.sex ?? ''} readOnly /></label>
              <label>Date of birth<input value={formatDate(detail.dateOfBirth)} readOnly /></label>
              <label>Place of birth<input value={detail.placeOfBirth ?? ''} readOnly /></label>
              <label>Religion<input value={detail.religion ?? ''} readOnly /></label>
              <label>Case category<input value={detail.caseCategory ?? ''} readOnly /></label>
              <label>Referral source<input value={detail.referralSource ?? ''} readOnly /></label>
              <label>Date admitted<input value={formatDate(detail.dateAdmitted)} readOnly /></label>
              <label>Date closed<input value={formatDate(detail.dateClosed)} readOnly /></label>
              <label>Reintegration type<input value={detail.reintegrationType ?? ''} readOnly /></label>
              <label>Reintegration status<input value={detail.reintegrationStatus ?? ''} readOnly /></label>
            </article>
            <article className="resident-case-panel">
              <label>
                Notes (restricted)
                <textarea rows={10} value={detail.notesRestricted ?? ''} readOnly />
              </label>
            </article>
          </section>
        )}

        {activeTab === 'process' && (
          <section className="resident-case-grid">
            <article className="resident-case-panel">
              <form className="donor-entry-form" onSubmit={submitProcessRecording}>
                <h2>New process recording</h2>
                <label>Session date<input type="date" required value={processForm.sessionDate} onChange={(event) => setProcessForm((current) => ({ ...current, sessionDate: event.target.value }))} /></label>
                <label>Social worker<input type="text" value={processForm.socialWorker} onChange={(event) => setProcessForm((current) => ({ ...current, socialWorker: event.target.value }))} /></label>
                <label>Session type<select value={processForm.sessionType} onChange={(event) => setProcessForm((current) => ({ ...current, sessionType: event.target.value }))}><option>Individual</option><option>Group</option></select></label>
                <label>Emotional state observed<input type="text" value={processForm.emotionalState} onChange={(event) => setProcessForm((current) => ({ ...current, emotionalState: event.target.value }))} /></label>
                <label>Narrative summary<textarea required rows={3} value={processForm.narrativeSummary} onChange={(event) => setProcessForm((current) => ({ ...current, narrativeSummary: event.target.value }))} /></label>
                <label>Interventions applied<textarea rows={2} value={processForm.interventionsApplied} onChange={(event) => setProcessForm((current) => ({ ...current, interventionsApplied: event.target.value }))} /></label>
                <label>Follow-up actions<textarea rows={2} value={processForm.followUpActions} onChange={(event) => setProcessForm((current) => ({ ...current, followUpActions: event.target.value }))} /></label>
                <button className="btn-primary resident-case-btn" type="submit" disabled={savingProcess}>{savingProcess ? 'Saving...' : 'Save process recording'}</button>
              </form>
            </article>
            <article className="resident-case-panel donor-table-wrap">
              <table className="donor-table">
                <thead><tr><th>Date</th><th>Type</th><th>Emotional state</th><th>Narrative</th></tr></thead>
                <tbody>
                  {processHistory.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDate(row.sessionDate)}</td>
                      <td>{row.sessionType}</td>
                      <td>{row.emotionalState ?? '—'}</td>
                      <td>{row.narrativeSummary ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          </section>
        )}

        {activeTab === 'home' && (
          <section className="resident-case-grid">
            <article className="resident-case-panel">
              <form className="donor-entry-form" onSubmit={submitHomeVisitation}>
                <h2>New home/field visit</h2>
                <label>Visit date<input type="date" required value={homeForm.visitDate} onChange={(event) => setHomeForm((current) => ({ ...current, visitDate: event.target.value }))} /></label>
                <label>Visit type<select value={homeForm.visitType} onChange={(event) => setHomeForm((current) => ({ ...current, visitType: event.target.value }))}><option>Initial assessment</option><option>Routine follow-up</option><option>Reintegration assessment</option><option>Post-placement monitoring</option><option>Emergency</option></select></label>
                <label>Home environment observations<textarea required rows={3} value={homeForm.observations} onChange={(event) => setHomeForm((current) => ({ ...current, observations: event.target.value }))} /></label>
                <label>Family cooperation level<input type="text" value={homeForm.familyCooperationLevel} onChange={(event) => setHomeForm((current) => ({ ...current, familyCooperationLevel: event.target.value }))} /></label>
                <label>Safety concerns<textarea rows={2} value={homeForm.safetyConcerns} onChange={(event) => setHomeForm((current) => ({ ...current, safetyConcerns: event.target.value }))} /></label>
                <label>Follow-up actions<textarea rows={2} value={homeForm.followUpActions} onChange={(event) => setHomeForm((current) => ({ ...current, followUpActions: event.target.value }))} /></label>
                <button className="btn-primary resident-case-btn" type="submit" disabled={savingHome}>{savingHome ? 'Saving...' : 'Save home visitation'}</button>
              </form>
            </article>
            <article className="resident-case-panel">
              <div className="donor-table-wrap">
                <table className="donor-table">
                  <thead><tr><th>Date</th><th>Visit type</th><th>Observations</th></tr></thead>
                  <tbody>
                    {homeHistory.map((row) => (
                      <tr key={row.id}>
                        <td>{formatDate(row.visitDate)}</td>
                        <td>{row.visitType}</td>
                        <td>{row.observations ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <article className="feature-slab resident-case-conference-card">
                <h2>Case conferences</h2>
                <p className="auth-lead">
                  Conference timeline section for this resident. Hook upcoming/previous conference data here when
                  `case_conferences` is ready.
                </p>
              </article>
            </article>
          </section>
        )}
      </article>
    </section>
  );
}
