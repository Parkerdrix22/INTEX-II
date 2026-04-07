import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  caseloadApi,
  type HealthWellbeingDashboard,
  type HomeVisitation,
  type ProcessRecording,
  type ResidentDetail,
} from '../lib/api';

type CaseTab = 'overview' | 'profile' | 'process' | 'home';
type YesNoUnknown = '' | 'true' | 'false';

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function toDateInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function formatScore(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toFixed(2);
}

function numericAxisDomain(min: number, max: number): [number, number] {
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) ? max : 1;
  if (safeMin === safeMax) return [safeMin - 0.2, safeMax + 0.2];
  return [safeMin - 0.1, safeMax + 0.1];
}

export function ResidentCasePage() {
  const { residentId } = useParams();
  const numericId = Number(residentId);
  const [activeTab, setActiveTab] = useState<CaseTab>('overview');
  const [detail, setDetail] = useState<ResidentDetail | null>(null);
  const [healthDashboard, setHealthDashboard] = useState<HealthWellbeingDashboard | null>(null);
  const [processHistory, setProcessHistory] = useState<ProcessRecording[]>([]);
  const [homeHistory, setHomeHistory] = useState<HomeVisitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingProcess, setSavingProcess] = useState(false);
  const [savingHome, setSavingHome] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [savingResident, setSavingResident] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [processEditor, setProcessEditor] = useState<{
    recordKey: string;
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
  } | null>(null);
  const [homeEditor, setHomeEditor] = useState<{
    recordKey: string;
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
  } | null>(null);

  const [processForm, setProcessForm] = useState({
    sessionDate: '',
    socialWorker: '',
    sessionType: 'Individual',
    sessionDurationMinutes: '',
    emotionalStateObserved: '',
    emotionalStateEnd: '',
    sessionNarrative: '',
    interventionsApplied: '',
    followUpActions: '',
    progressNoted: '' as YesNoUnknown,
    concernsFlagged: '' as YesNoUnknown,
    referralMade: '' as YesNoUnknown,
    notesRestricted: '',
  });

  const [homeForm, setHomeForm] = useState({
    visitDate: '',
    socialWorker: '',
    visitType: 'Routine follow-up',
    locationVisited: '',
    familyMembersPresent: '',
    purpose: '',
    observations: '',
    familyCooperationLevel: 'Neutral',
    safetyConcernsNoted: '' as YesNoUnknown,
    followUpNeeded: '' as YesNoUnknown,
    followUpNotes: '',
    visitOutcome: 'Favorable',
  });
  const [profileForm, setProfileForm] = useState({
    caseStatus: '',
    safehouseId: '',
    assignedSocialWorker: '',
    sex: '',
    dateOfBirth: '',
    placeOfBirth: '',
    religion: '',
    caseCategory: '',
    referralSource: '',
    dateAdmitted: '',
    dateClosed: '',
    reintegrationType: '',
    reintegrationStatus: '',
  });

  const healthTrendData = useMemo(() => {
    if (!healthDashboard?.recent?.length) return [];
    return [...healthDashboard.recent]
      .sort((a, b) => {
        const first = a.recordDate ? new Date(a.recordDate).getTime() : 0;
        const second = b.recordDate ? new Date(b.recordDate).getTime() : 0;
        return first - second;
      })
      .map((row) => ({
        date: formatDate(row.recordDate),
        nutrition: row.nutritionScore,
        sleep: row.sleepQualityScore,
        energy: row.energyLevelScore,
        bmi: row.bmi,
      }));
  }, [healthDashboard]);

  useEffect(() => {
    if (!Number.isFinite(numericId) || numericId <= 0) {
      setError('Invalid resident id.');
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      setProfileSuccess(null);
      try {
        const [resident, health, processRows, homeRows] = await Promise.all([
          caseloadApi.residentDetail(numericId),
          caseloadApi.healthWellbeing(numericId),
          caseloadApi.processRecordings(numericId),
          caseloadApi.homeVisitations(numericId),
        ]);
        setDetail(resident);
        setHealthDashboard(health);
        setProfileForm({
          caseStatus: resident.caseStatus ?? '',
          safehouseId: resident.safehouseId == null ? '' : String(resident.safehouseId),
          assignedSocialWorker: resident.assignedSocialWorker ?? '',
          sex: resident.sex ?? '',
          dateOfBirth: resident.dateOfBirth ? resident.dateOfBirth.slice(0, 10) : '',
          placeOfBirth: resident.placeOfBirth ?? '',
          religion: resident.religion ?? '',
          caseCategory: resident.caseCategory ?? '',
          referralSource: resident.referralSource ?? '',
          dateAdmitted: resident.dateAdmitted ? resident.dateAdmitted.slice(0, 10) : '',
          dateClosed: resident.dateClosed ? resident.dateClosed.slice(0, 10) : '',
          reintegrationType: resident.reintegrationType ?? '',
          reintegrationStatus: resident.reintegrationStatus ?? '',
        });
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
      await caseloadApi.addProcessRecording(detail.id, {
        sessionDate: processForm.sessionDate,
        socialWorker: processForm.socialWorker,
        sessionType: processForm.sessionType,
        sessionDurationMinutes:
          processForm.sessionDurationMinutes.trim() === '' ? undefined : Number(processForm.sessionDurationMinutes),
        emotionalStateObserved: processForm.emotionalStateObserved,
        emotionalStateEnd: processForm.emotionalStateEnd,
        sessionNarrative: processForm.sessionNarrative,
        interventionsApplied: processForm.interventionsApplied,
        followUpActions: processForm.followUpActions,
        progressNoted: processForm.progressNoted === '' ? undefined : processForm.progressNoted === 'true',
        concernsFlagged: processForm.concernsFlagged === '' ? undefined : processForm.concernsFlagged === 'true',
        referralMade: processForm.referralMade === '' ? undefined : processForm.referralMade === 'true',
        notesRestricted: processForm.notesRestricted,
      });
      const rows = await caseloadApi.processRecordings(detail.id);
      setProcessHistory(rows);
      setProcessForm({
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
      await caseloadApi.addHomeVisitation(detail.id, {
        visitDate: homeForm.visitDate,
        socialWorker: homeForm.socialWorker,
        visitType: homeForm.visitType,
        locationVisited: homeForm.locationVisited,
        familyMembersPresent: homeForm.familyMembersPresent,
        purpose: homeForm.purpose,
        observations: homeForm.observations,
        familyCooperationLevel: homeForm.familyCooperationLevel,
        safetyConcernsNoted:
          homeForm.safetyConcernsNoted === '' ? undefined : homeForm.safetyConcernsNoted === 'true',
        followUpNeeded: homeForm.followUpNeeded === '' ? undefined : homeForm.followUpNeeded === 'true',
        followUpNotes: homeForm.followUpNotes,
        visitOutcome: homeForm.visitOutcome,
      });
      const rows = await caseloadApi.homeVisitations(detail.id);
      setHomeHistory(rows);
      setHomeForm({
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
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save home visitation.');
    } finally {
      setSavingHome(false);
    }
  };

  const saveProcessEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!detail || !processEditor) return;
    setSavingEdit(true);
    try {
      await caseloadApi.updateProcessRecording(detail.id, processEditor.recordKey, {
        sessionDate: processEditor.sessionDate,
        socialWorker: processEditor.socialWorker,
        sessionType: processEditor.sessionType,
        sessionDurationMinutes:
          processEditor.sessionDurationMinutes.trim() === ''
            ? undefined
            : Number(processEditor.sessionDurationMinutes),
        emotionalStateObserved: processEditor.emotionalStateObserved,
        emotionalStateEnd: processEditor.emotionalStateEnd,
        sessionNarrative: processEditor.sessionNarrative,
        interventionsApplied: processEditor.interventionsApplied,
        followUpActions: processEditor.followUpActions,
        progressNoted:
          processEditor.progressNoted === '' ? undefined : processEditor.progressNoted === 'true',
        concernsFlagged:
          processEditor.concernsFlagged === '' ? undefined : processEditor.concernsFlagged === 'true',
        referralMade: processEditor.referralMade === '' ? undefined : processEditor.referralMade === 'true',
        notesRestricted: processEditor.notesRestricted,
      });
      const rows = await caseloadApi.processRecordings(detail.id);
      setProcessHistory(rows);
      setProcessEditor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update process recording.');
    } finally {
      setSavingEdit(false);
    }
  };

  const saveHomeEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!detail || !homeEditor) return;
    setSavingEdit(true);
    try {
      await caseloadApi.updateHomeVisitation(detail.id, homeEditor.recordKey, {
        visitDate: homeEditor.visitDate,
        socialWorker: homeEditor.socialWorker,
        visitType: homeEditor.visitType,
        locationVisited: homeEditor.locationVisited,
        familyMembersPresent: homeEditor.familyMembersPresent,
        purpose: homeEditor.purpose,
        observations: homeEditor.observations,
        familyCooperationLevel: homeEditor.familyCooperationLevel,
        safetyConcernsNoted:
          homeEditor.safetyConcernsNoted === '' ? undefined : homeEditor.safetyConcernsNoted === 'true',
        followUpNeeded: homeEditor.followUpNeeded === '' ? undefined : homeEditor.followUpNeeded === 'true',
        followUpNotes: homeEditor.followUpNotes,
        visitOutcome: homeEditor.visitOutcome,
      });
      const rows = await caseloadApi.homeVisitations(detail.id);
      setHomeHistory(rows);
      setHomeEditor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update home visitation.');
    } finally {
      setSavingEdit(false);
    }
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!detail) return;
    setSavingResident(true);
    setProfileSuccess(null);
    try {
      const toNullable = (value: string) => {
        const trimmed = value.trim();
        return trimmed.length === 0 ? undefined : trimmed;
      };

      await caseloadApi.updateResidentDetail(detail.id, {
        caseStatus: toNullable(profileForm.caseStatus),
        safehouseId:
          profileForm.safehouseId.trim() === '' || Number.isNaN(Number(profileForm.safehouseId))
            ? null
            : Number(profileForm.safehouseId),
        assignedSocialWorker: toNullable(profileForm.assignedSocialWorker),
        sex: toNullable(profileForm.sex),
        dateOfBirth: profileForm.dateOfBirth || undefined,
        placeOfBirth: toNullable(profileForm.placeOfBirth),
        religion: toNullable(profileForm.religion),
        caseCategory: toNullable(profileForm.caseCategory),
        referralSource: toNullable(profileForm.referralSource),
        dateAdmitted: profileForm.dateAdmitted || undefined,
        dateClosed: profileForm.dateClosed || undefined,
        reintegrationType: toNullable(profileForm.reintegrationType),
        reintegrationStatus: toNullable(profileForm.reintegrationStatus),
      });
      const resident = await caseloadApi.residentDetail(detail.id);
      setDetail(resident);
      setProfileSuccess('Personal information saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update resident profile.');
    } finally {
      setSavingResident(false);
    }
  };

  const deleteResident = async () => {
    if (!detail) return;
    if (!window.confirm('Delete this resident and all related process/home records? This cannot be undone.')) return;
    try {
      await caseloadApi.deleteResident(detail.id);
      window.location.href = '/caseload-inventory';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete resident.');
    }
  };

  const deleteProcess = async () => {
    if (!detail || !processEditor) return;
    if (!window.confirm('Delete this process recording?')) return;
    try {
      await caseloadApi.deleteProcessRecording(detail.id, processEditor.recordKey);
      const rows = await caseloadApi.processRecordings(detail.id);
      setProcessHistory(rows);
      setProcessEditor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete process recording.');
    }
  };

  const deleteHome = async () => {
    if (!detail || !homeEditor) return;
    if (!window.confirm('Delete this home visitation record?')) return;
    try {
      await caseloadApi.deleteHomeVisitation(detail.id, homeEditor.recordKey);
      const rows = await caseloadApi.homeVisitations(detail.id);
      setHomeHistory(rows);
      setHomeEditor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete home visitation.');
    }
  };

  if (loading) {
    return <section className="blank-page">Loading resident case file...</section>;
  }

  if (error) {
    return (
      <section className="blank-page">
        <p className="error-text">{error}</p>
        <Link to="/caseload-inventory">Back to Resident Services</Link>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="blank-page">
        <p className="error-text">Resident not found.</p>
        <Link to="/caseload-inventory">Back to Resident Services</Link>
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
            className={`donor-tab${activeTab === 'overview' ? ' donor-tab--active' : ''}`}
            aria-selected={activeTab === 'overview'}
            onClick={() => setActiveTab('overview')}
          >
            Health dashboard
          </button>
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
            Home visitations
          </button>
        </div>

        {activeTab === 'overview' && (
          <section className="resident-case-grid resident-case-grid--profile">
            <article className="resident-case-panel">
              <h2>Health & Well-being Dashboard</h2>
              {healthDashboard?.latest ? (
                <>
                  <section className="caseload-summary-grid" aria-label="Health summary metrics">
                    <article className="stat-card">
                      <p className="metric-label">General health</p>
                      <p className="metric-value">{formatScore(healthDashboard.latest.generalHealthScore)}</p>
                    </article>
                    <article className="stat-card">
                      <p className="metric-label">Nutrition</p>
                      <p className="metric-value">{formatScore(healthDashboard.latest.nutritionScore)}</p>
                    </article>
                    <article className="stat-card">
                      <p className="metric-label">Sleep quality</p>
                      <p className="metric-value">{formatScore(healthDashboard.latest.sleepQualityScore)}</p>
                    </article>
                    <article className="stat-card">
                      <p className="metric-label">Energy</p>
                      <p className="metric-value">{formatScore(healthDashboard.latest.energyLevelScore)}</p>
                    </article>
                  </section>

                  <section className="resident-info-grid" style={{ marginTop: '0.8rem' }}>
                    <label>Latest check date<input value={formatDate(healthDashboard.latest.recordDate)} readOnly /></label>
                    <label>BMI<input value={formatScore(healthDashboard.latest.bmi)} readOnly /></label>
                    <label>Height (cm)<input value={healthDashboard.latest.heightCm ?? '—'} readOnly /></label>
                    <label>Weight (kg)<input value={healthDashboard.latest.weightKg ?? '—'} readOnly /></label>
                    <label>Medical checkups done<input value={`${healthDashboard.medicalDoneCount}/${healthDashboard.totalRecords}`} readOnly /></label>
                    <label>Dental checkups done<input value={`${healthDashboard.dentalDoneCount}/${healthDashboard.totalRecords}`} readOnly /></label>
                    <label>Psychological checkups done<input value={`${healthDashboard.psychologicalDoneCount}/${healthDashboard.totalRecords}`} readOnly /></label>
                    <label>Latest notes<input value={healthDashboard.latest.notes ?? '—'} readOnly /></label>
                  </section>

                  <div className="resident-case-grid" style={{ marginTop: '0.8rem' }}>
                    <article className="resident-case-panel">
                      <h3>Nutrition trend</h3>
                      <div style={{ width: '100%', height: 220 }}>
                        <ResponsiveContainer>
                          <LineChart data={healthTrendData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                            <YAxis domain={([min, max]) => numericAxisDomain(min, max)} tickFormatter={(value: number) => value.toFixed(1)} width={36} />
                            <Tooltip />
                            <Line type="monotone" dataKey="nutrition" stroke="#0b5c97" strokeWidth={2} dot={{ r: 3 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </article>
                    <article className="resident-case-panel">
                      <h3>Sleep trend</h3>
                      <div style={{ width: '100%', height: 220 }}>
                        <ResponsiveContainer>
                          <LineChart data={healthTrendData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                            <YAxis domain={([min, max]) => numericAxisDomain(min, max)} tickFormatter={(value: number) => value.toFixed(1)} width={36} />
                            <Tooltip />
                            <Line type="monotone" dataKey="sleep" stroke="#3f8f5f" strokeWidth={2} dot={{ r: 3 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </article>
                    <article className="resident-case-panel">
                      <h3>Energy trend</h3>
                      <div style={{ width: '100%', height: 220 }}>
                        <ResponsiveContainer>
                          <LineChart data={healthTrendData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                            <YAxis domain={([min, max]) => numericAxisDomain(min, max)} tickFormatter={(value: number) => value.toFixed(1)} width={36} />
                            <Tooltip />
                            <Line type="monotone" dataKey="energy" stroke="#ad6f00" strokeWidth={2} dot={{ r: 3 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </article>
                    <article className="resident-case-panel">
                      <h3>BMI trend</h3>
                      <div style={{ width: '100%', height: 220 }}>
                        <ResponsiveContainer>
                          <LineChart data={healthTrendData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                            <YAxis domain={([min, max]) => numericAxisDomain(min, max)} tickFormatter={(value: number) => value.toFixed(1)} width={36} />
                            <Tooltip />
                            <Line type="monotone" dataKey="bmi" stroke="#6b4ea2" strokeWidth={2} dot={{ r: 3 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </article>
                  </div>
                </>
              ) : (
                <p className="auth-lead">No health & well-being records yet for this resident.</p>
              )}
            </article>
          </section>
        )}

        {activeTab === 'profile' && (
          <section className="resident-case-grid resident-case-grid--profile">
            <article className="resident-case-panel">
              <h2>Personal Information</h2>
              <form className="resident-info-grid" onSubmit={saveProfile}>
                <label>Resident ID<input value={detail.id} readOnly /></label>
                <label>Case control no<input value={detail.caseControlNo} readOnly /></label>
                <label>Case status<input value={profileForm.caseStatus} onChange={(event) => setProfileForm((current) => ({ ...current, caseStatus: event.target.value }))} /></label>
                <label>Safehouse ID<input value={profileForm.safehouseId} onChange={(event) => setProfileForm((current) => ({ ...current, safehouseId: event.target.value }))} /></label>
                <label>Assigned social worker<input value={profileForm.assignedSocialWorker} onChange={(event) => setProfileForm((current) => ({ ...current, assignedSocialWorker: event.target.value }))} /></label>
                <label>Sex<input value={profileForm.sex} onChange={(event) => setProfileForm((current) => ({ ...current, sex: event.target.value }))} /></label>
                <label>Date of birth<input type="date" value={profileForm.dateOfBirth} onChange={(event) => setProfileForm((current) => ({ ...current, dateOfBirth: event.target.value }))} /></label>
                <label>Place of birth<input value={profileForm.placeOfBirth} onChange={(event) => setProfileForm((current) => ({ ...current, placeOfBirth: event.target.value }))} /></label>
                <label>Religion<input value={profileForm.religion} onChange={(event) => setProfileForm((current) => ({ ...current, religion: event.target.value }))} /></label>
                <label>Case category<input value={profileForm.caseCategory} onChange={(event) => setProfileForm((current) => ({ ...current, caseCategory: event.target.value }))} /></label>
                <label>Referral source<input value={profileForm.referralSource} onChange={(event) => setProfileForm((current) => ({ ...current, referralSource: event.target.value }))} /></label>
                <label>Date admitted<input type="date" value={profileForm.dateAdmitted} onChange={(event) => setProfileForm((current) => ({ ...current, dateAdmitted: event.target.value }))} /></label>
                <label>Date closed<input type="date" value={profileForm.dateClosed} onChange={(event) => setProfileForm((current) => ({ ...current, dateClosed: event.target.value }))} /></label>
                <label>Reintegration type<input value={profileForm.reintegrationType} onChange={(event) => setProfileForm((current) => ({ ...current, reintegrationType: event.target.value }))} /></label>
                <label>Reintegration status<input value={profileForm.reintegrationStatus} onChange={(event) => setProfileForm((current) => ({ ...current, reintegrationStatus: event.target.value }))} /></label>
                {profileSuccess && <p className="success-text">{profileSuccess}</p>}
                <div className="resident-modal-actions resident-profile-actions">
                  <button type="button" className="btn-danger" onClick={deleteResident}>Delete resident</button>
                  <button type="submit" className="btn-primary" disabled={savingResident}>
                    {savingResident ? 'Saving...' : 'Save personal information'}
                  </button>
                </div>
              </form>
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
                <label>Session duration (minutes)<input type="number" min={1} value={processForm.sessionDurationMinutes} onChange={(event) => setProcessForm((current) => ({ ...current, sessionDurationMinutes: event.target.value }))} /></label>
                <label>Emotional state observed<input type="text" value={processForm.emotionalStateObserved} onChange={(event) => setProcessForm((current) => ({ ...current, emotionalStateObserved: event.target.value }))} /></label>
                <label>Emotional state end<input type="text" value={processForm.emotionalStateEnd} onChange={(event) => setProcessForm((current) => ({ ...current, emotionalStateEnd: event.target.value }))} /></label>
                <label>Session narrative<textarea required rows={3} value={processForm.sessionNarrative} onChange={(event) => setProcessForm((current) => ({ ...current, sessionNarrative: event.target.value }))} /></label>
                <label>Interventions applied<select value={processForm.interventionsApplied} onChange={(event) => setProcessForm((current) => ({ ...current, interventionsApplied: event.target.value }))}><option value="">Select...</option><option>Caring</option><option>Healing</option><option>Teaching</option><option>Life Skills</option><option>Legal Services</option><option>Referral to specialist</option></select></label>
                <label>Follow-up actions<input type="text" value={processForm.followUpActions} onChange={(event) => setProcessForm((current) => ({ ...current, followUpActions: event.target.value }))} /></label>
                <label>Progress noted<select value={processForm.progressNoted} onChange={(event) => setProcessForm((current) => ({ ...current, progressNoted: event.target.value as YesNoUnknown }))}><option value="">Select...</option><option value="true">Yes</option><option value="false">No</option></select></label>
                <label>Concerns flagged<select value={processForm.concernsFlagged} onChange={(event) => setProcessForm((current) => ({ ...current, concernsFlagged: event.target.value as YesNoUnknown }))}><option value="">Select...</option><option value="true">Yes</option><option value="false">No</option></select></label>
                <label>Referral made<select value={processForm.referralMade} onChange={(event) => setProcessForm((current) => ({ ...current, referralMade: event.target.value as YesNoUnknown }))}><option value="">Select...</option><option value="true">Yes</option><option value="false">No</option></select></label>
                <label>Notes (restricted)<textarea rows={2} value={processForm.notesRestricted} onChange={(event) => setProcessForm((current) => ({ ...current, notesRestricted: event.target.value }))} /></label>
                <button className="btn-primary resident-case-btn" type="submit" disabled={savingProcess}>{savingProcess ? 'Saving...' : 'Save process recording'}</button>
              </form>
            </article>
            <article className="resident-case-panel donor-table-wrap">
              <table className="donor-table">
                <thead><tr><th>Date</th><th>Type</th></tr></thead>
                <tbody>
                  {processHistory.map((row) => (
                    <tr
                      key={row.recordKey}
                      className="resident-record-row"
                      onClick={() =>
                        setProcessEditor({
                          recordKey: row.recordKey,
                          sessionDate: toDateInput(row.sessionDate),
                          socialWorker: row.socialWorker ?? '',
                          sessionType: row.sessionType,
                          sessionDurationMinutes:
                            row.sessionDurationMinutes == null ? '' : String(row.sessionDurationMinutes),
                          emotionalStateObserved: row.emotionalStateObserved ?? '',
                          emotionalStateEnd: row.emotionalStateEnd ?? '',
                          sessionNarrative: row.sessionNarrative ?? '',
                          interventionsApplied: row.interventionsApplied ?? '',
                          followUpActions: row.followUpActions ?? '',
                          progressNoted: row.progressNoted == null ? '' : row.progressNoted ? 'true' : 'false',
                          concernsFlagged:
                            row.concernsFlagged == null ? '' : row.concernsFlagged ? 'true' : 'false',
                          referralMade: row.referralMade == null ? '' : row.referralMade ? 'true' : 'false',
                          notesRestricted: row.notesRestricted ?? '',
                        })
                      }
                    >
                      <td>{formatDate(row.sessionDate)}</td>
                      <td>{row.sessionType}</td>
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
                <label>Social worker<input type="text" value={homeForm.socialWorker} onChange={(event) => setHomeForm((current) => ({ ...current, socialWorker: event.target.value }))} placeholder="SW-04" /></label>
                <label>Visit type<select value={homeForm.visitType} onChange={(event) => setHomeForm((current) => ({ ...current, visitType: event.target.value }))}><option>Initial assessment</option><option>Routine follow-up</option><option>Reintegration assessment</option><option>Post-placement monitoring</option><option>Emergency</option></select></label>
                <label>Location visited<input type="text" value={homeForm.locationVisited} onChange={(event) => setHomeForm((current) => ({ ...current, locationVisited: event.target.value }))} /></label>
                <label>Family members present<input type="text" value={homeForm.familyMembersPresent} onChange={(event) => setHomeForm((current) => ({ ...current, familyMembersPresent: event.target.value }))} /></label>
                <label>Purpose<input type="text" value={homeForm.purpose} onChange={(event) => setHomeForm((current) => ({ ...current, purpose: event.target.value }))} /></label>
                <label>Home environment observations<textarea required rows={3} value={homeForm.observations} onChange={(event) => setHomeForm((current) => ({ ...current, observations: event.target.value }))} /></label>
                <label>Family cooperation level<select value={homeForm.familyCooperationLevel} onChange={(event) => setHomeForm((current) => ({ ...current, familyCooperationLevel: event.target.value }))}><option>Uncooperative</option><option>Neutral</option><option>Cooperative</option><option>Highly Cooperative</option></select></label>
                <label>Safety concerns noted<select value={homeForm.safetyConcernsNoted} onChange={(event) => setHomeForm((current) => ({ ...current, safetyConcernsNoted: event.target.value as YesNoUnknown }))}><option value="">Select...</option><option value="true">Yes</option><option value="false">No</option></select></label>
                <label>Follow-up needed<select value={homeForm.followUpNeeded} onChange={(event) => setHomeForm((current) => ({ ...current, followUpNeeded: event.target.value as YesNoUnknown }))}><option value="">Select...</option><option value="true">Yes</option><option value="false">No</option></select></label>
                <label>Follow-up notes<textarea rows={2} value={homeForm.followUpNotes} onChange={(event) => setHomeForm((current) => ({ ...current, followUpNotes: event.target.value }))} /></label>
                <label>Visit outcome<select value={homeForm.visitOutcome} onChange={(event) => setHomeForm((current) => ({ ...current, visitOutcome: event.target.value }))}><option>Favorable</option><option>Unfavorable</option><option>Needs improvement</option><option>Inconclusive</option></select></label>
                <button className="btn-primary resident-case-btn" type="submit" disabled={savingHome}>{savingHome ? 'Saving...' : 'Save home visitation'}</button>
              </form>
            </article>
            <article className="resident-case-panel">
              <div className="donor-table-wrap">
                <table className="donor-table">
                  <thead><tr><th>Date</th><th>Visit type</th></tr></thead>
                  <tbody>
                    {homeHistory.map((row) => (
                      <tr
                        key={row.recordKey}
                        className="resident-record-row"
                        onClick={() =>
                          setHomeEditor({
                            recordKey: row.recordKey,
                            visitDate: toDateInput(row.visitDate),
                            socialWorker: row.socialWorker ?? '',
                            visitType: row.visitType,
                            locationVisited: row.locationVisited ?? '',
                            familyMembersPresent: row.familyMembersPresent ?? '',
                            purpose: row.purpose ?? '',
                            observations: row.observations ?? '',
                            familyCooperationLevel: row.familyCooperationLevel ?? '',
                            safetyConcernsNoted:
                              row.safetyConcernsNoted == null ? '' : row.safetyConcernsNoted ? 'true' : 'false',
                            followUpNeeded: row.followUpNeeded == null ? '' : row.followUpNeeded ? 'true' : 'false',
                            followUpNotes: row.followUpNotes ?? '',
                            visitOutcome: row.visitOutcome ?? 'Favorable',
                          })
                        }
                      >
                        <td>{formatDate(row.visitDate)}</td>
                        <td>{row.visitType}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        )}
      </article>

      {processEditor && (
        <div className="resident-modal-backdrop" role="presentation" onClick={() => setProcessEditor(null)}>
          <article className="resident-modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Edit process recording</h2>
            <form className="donor-entry-form" onSubmit={saveProcessEdit}>
              <label>Session date<input type="date" required value={processEditor.sessionDate} onChange={(event) => setProcessEditor((current) => current ? ({ ...current, sessionDate: event.target.value }) : current)} /></label>
              <label>Social worker<input type="text" value={processEditor.socialWorker} onChange={(event) => setProcessEditor((current) => current ? ({ ...current, socialWorker: event.target.value }) : current)} /></label>
              <label>Session type<select value={processEditor.sessionType} onChange={(event) => setProcessEditor((current) => current ? ({ ...current, sessionType: event.target.value }) : current)}><option>Individual</option><option>Group</option></select></label>
              <label>Session duration (minutes)<input type="number" min={1} value={processEditor.sessionDurationMinutes} onChange={(event) => setProcessEditor((current) => current ? ({ ...current, sessionDurationMinutes: event.target.value }) : current)} /></label>
              <label>Emotional state observed<input type="text" value={processEditor.emotionalStateObserved} onChange={(event) => setProcessEditor((current) => current ? ({ ...current, emotionalStateObserved: event.target.value }) : current)} /></label>
              <label>Emotional state end<input type="text" value={processEditor.emotionalStateEnd} onChange={(event) => setProcessEditor((current) => current ? ({ ...current, emotionalStateEnd: event.target.value }) : current)} /></label>
              <label>Session narrative<textarea rows={4} value={processEditor.sessionNarrative} onChange={(event) => setProcessEditor((current) => current ? ({ ...current, sessionNarrative: event.target.value }) : current)} /></label>
              <label>Interventions applied<select value={processEditor.interventionsApplied} onChange={(event) => setProcessEditor((current) => current ? ({ ...current, interventionsApplied: event.target.value }) : current)}><option value="">Select...</option><option>Caring</option><option>Healing</option><option>Teaching</option><option>Life Skills</option><option>Legal Services</option><option>Referral to specialist</option></select></label>
              <label>Follow-up actions<input type="text" value={processEditor.followUpActions} onChange={(event) => setProcessEditor((current) => current ? ({ ...current, followUpActions: event.target.value }) : current)} /></label>
              <label>Progress noted<select value={processEditor.progressNoted} onChange={(event) => setProcessEditor((current) => current ? ({ ...current, progressNoted: event.target.value as YesNoUnknown }) : current)}><option value="">Select...</option><option value="true">Yes</option><option value="false">No</option></select></label>
              <label>Concerns flagged<select value={processEditor.concernsFlagged} onChange={(event) => setProcessEditor((current) => current ? ({ ...current, concernsFlagged: event.target.value as YesNoUnknown }) : current)}><option value="">Select...</option><option value="true">Yes</option><option value="false">No</option></select></label>
              <label>Referral made<select value={processEditor.referralMade} onChange={(event) => setProcessEditor((current) => current ? ({ ...current, referralMade: event.target.value as YesNoUnknown }) : current)}><option value="">Select...</option><option value="true">Yes</option><option value="false">No</option></select></label>
              <label>Notes (restricted)<textarea rows={3} value={processEditor.notesRestricted} onChange={(event) => setProcessEditor((current) => current ? ({ ...current, notesRestricted: event.target.value }) : current)} /></label>
              <div className="resident-modal-actions">
                <button type="button" className="btn-secondary" onClick={deleteProcess}>Delete recording</button>
                <button type="button" className="btn-secondary" onClick={() => setProcessEditor(null)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={savingEdit}>{savingEdit ? 'Saving...' : 'Save changes'}</button>
              </div>
            </form>
          </article>
        </div>
      )}

      {homeEditor && (
        <div className="resident-modal-backdrop" role="presentation" onClick={() => setHomeEditor(null)}>
          <article className="resident-modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Edit home visitation</h2>
            <form className="donor-entry-form" onSubmit={saveHomeEdit}>
              <label>Visit date<input type="date" required value={homeEditor.visitDate} onChange={(event) => setHomeEditor((current) => current ? ({ ...current, visitDate: event.target.value }) : current)} /></label>
              <label>Social worker<input type="text" value={homeEditor.socialWorker} onChange={(event) => setHomeEditor((current) => current ? ({ ...current, socialWorker: event.target.value }) : current)} /></label>
              <label>Visit type<select value={homeEditor.visitType} onChange={(event) => setHomeEditor((current) => current ? ({ ...current, visitType: event.target.value }) : current)}><option>Initial assessment</option><option>Routine follow-up</option><option>Reintegration assessment</option><option>Post-placement monitoring</option><option>Emergency</option></select></label>
              <label>Location visited<input type="text" value={homeEditor.locationVisited} onChange={(event) => setHomeEditor((current) => current ? ({ ...current, locationVisited: event.target.value }) : current)} /></label>
              <label>Family members present<input type="text" value={homeEditor.familyMembersPresent} onChange={(event) => setHomeEditor((current) => current ? ({ ...current, familyMembersPresent: event.target.value }) : current)} /></label>
              <label>Purpose<input type="text" value={homeEditor.purpose} onChange={(event) => setHomeEditor((current) => current ? ({ ...current, purpose: event.target.value }) : current)} /></label>
              <label>Observations<textarea rows={4} value={homeEditor.observations} onChange={(event) => setHomeEditor((current) => current ? ({ ...current, observations: event.target.value }) : current)} /></label>
              <label>Family cooperation level<select value={homeEditor.familyCooperationLevel} onChange={(event) => setHomeEditor((current) => current ? ({ ...current, familyCooperationLevel: event.target.value }) : current)}><option>Uncooperative</option><option>Neutral</option><option>Cooperative</option><option>Highly Cooperative</option></select></label>
              <label>Safety concerns noted<select value={homeEditor.safetyConcernsNoted} onChange={(event) => setHomeEditor((current) => current ? ({ ...current, safetyConcernsNoted: event.target.value as YesNoUnknown }) : current)}><option value="">Select...</option><option value="true">Yes</option><option value="false">No</option></select></label>
              <label>Follow-up needed<select value={homeEditor.followUpNeeded} onChange={(event) => setHomeEditor((current) => current ? ({ ...current, followUpNeeded: event.target.value as YesNoUnknown }) : current)}><option value="">Select...</option><option value="true">Yes</option><option value="false">No</option></select></label>
              <label>Follow-up notes<textarea rows={3} value={homeEditor.followUpNotes} onChange={(event) => setHomeEditor((current) => current ? ({ ...current, followUpNotes: event.target.value }) : current)} /></label>
              <label>Visit outcome<select value={homeEditor.visitOutcome} onChange={(event) => setHomeEditor((current) => current ? ({ ...current, visitOutcome: event.target.value }) : current)}><option>Favorable</option><option>Unfavorable</option><option>Needs improvement</option><option>Inconclusive</option></select></label>
              <div className="resident-modal-actions">
                <button type="button" className="btn-secondary" onClick={deleteHome}>Delete visit</button>
                <button type="button" className="btn-secondary" onClick={() => setHomeEditor(null)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={savingEdit}>{savingEdit ? 'Saving...' : 'Save changes'}</button>
              </div>
            </form>
          </article>
        </div>
      )}
    </section>
  );
}
