import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  caseloadApi,
  type HealthWellbeingDashboard,
  type HomeVisitation,
  type IncidentReport,
  type InterventionPlan,
  type ProcessRecording,
  type ResidentDetail,
  type UpdateResidentDetailPayload,
} from '../lib/api';

type CaseTab = 'overview' | 'profile' | 'process' | 'home' | 'incident' | 'plans';
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

/** Matches CaseloadController validation (lighthouse CSV / DSWD-style fields). */
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
const RESIDENT_RISK_LEVELS = [
  { value: '', label: '—' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
] as const;

function isoDateInput(value: string | null | undefined): string {
  if (!value) return '';
  return value.slice(0, 10);
}

type ProfileFormState = {
  caseStatus: string;
  safehouseId: string;
  assignedSocialWorker: string;
  sex: string;
  dateOfBirth: string;
  birthStatus: string;
  placeOfBirth: string;
  religion: string;
  caseCategory: string;
  subCatOrphaned: boolean;
  subCatTrafficked: boolean;
  subCatChildLabor: boolean;
  subCatPhysicalAbuse: boolean;
  subCatSexualAbuse: boolean;
  subCatOsaec: boolean;
  subCatCicl: boolean;
  subCatAtRisk: boolean;
  subCatStreetChild: boolean;
  subCatChildWithHiv: boolean;
  isPwd: boolean;
  pwdType: string;
  hasSpecialNeeds: boolean;
  specialNeedsDiagnosis: string;
  familyIs4Ps: boolean;
  familySoloParent: boolean;
  familyIndigenous: boolean;
  familyParentPwd: boolean;
  familyInformalSettler: boolean;
  referralSource: string;
  referringAgencyPerson: string;
  dateAdmitted: string;
  ageUponAdmission: string;
  presentAge: string;
  lengthOfStay: string;
  dateColbRegistered: string;
  dateColbObtained: string;
  dateEnrolled: string;
  initialCaseAssessment: string;
  dateCaseStudyPrepared: string;
  dateClosed: string;
  reintegrationType: string;
  reintegrationStatus: string;
  initialRiskLevel: string;
  currentRiskLevel: string;
  notesRestricted: string;
  educationGrade: string;
  schoolName: string;
  isEnrolled: string;
};

const EMPTY_PROFILE_FORM: ProfileFormState = {
  caseStatus: '',
  safehouseId: '',
  assignedSocialWorker: '',
  sex: '',
  dateOfBirth: '',
  birthStatus: '',
  placeOfBirth: '',
  religion: '',
  caseCategory: '',
  subCatOrphaned: false,
  subCatTrafficked: false,
  subCatChildLabor: false,
  subCatPhysicalAbuse: false,
  subCatSexualAbuse: false,
  subCatOsaec: false,
  subCatCicl: false,
  subCatAtRisk: false,
  subCatStreetChild: false,
  subCatChildWithHiv: false,
  isPwd: false,
  pwdType: '',
  hasSpecialNeeds: false,
  specialNeedsDiagnosis: '',
  familyIs4Ps: false,
  familySoloParent: false,
  familyIndigenous: false,
  familyParentPwd: false,
  familyInformalSettler: false,
  referralSource: '',
  referringAgencyPerson: '',
  dateAdmitted: '',
  ageUponAdmission: '',
  presentAge: '',
  lengthOfStay: '',
  dateColbRegistered: '',
  dateColbObtained: '',
  dateEnrolled: '',
  initialCaseAssessment: '',
  dateCaseStudyPrepared: '',
  dateClosed: '',
  reintegrationType: '',
  reintegrationStatus: '',
  initialRiskLevel: '',
  currentRiskLevel: '',
  notesRestricted: '',
  educationGrade: '',
  schoolName: '',
  isEnrolled: '',
};

function residentToProfileForm(r: ResidentDetail): ProfileFormState {
  return {
    caseStatus: r.caseStatus ?? '',
    safehouseId: r.safehouseId == null ? '' : String(r.safehouseId),
    assignedSocialWorker: r.assignedSocialWorker ?? '',
    sex: r.sex ?? '',
    dateOfBirth: isoDateInput(r.dateOfBirth),
    birthStatus: r.birthStatus ?? '',
    placeOfBirth: r.placeOfBirth ?? '',
    religion: r.religion ?? '',
    caseCategory: r.caseCategory ?? '',
    subCatOrphaned: r.subCatOrphaned === true,
    subCatTrafficked: r.subCatTrafficked === true,
    subCatChildLabor: r.subCatChildLabor === true,
    subCatPhysicalAbuse: r.subCatPhysicalAbuse === true,
    subCatSexualAbuse: r.subCatSexualAbuse === true,
    subCatOsaec: r.subCatOsaec === true,
    subCatCicl: r.subCatCicl === true,
    subCatAtRisk: r.subCatAtRisk === true,
    subCatStreetChild: r.subCatStreetChild === true,
    subCatChildWithHiv: r.subCatChildWithHiv === true,
    isPwd: r.isPwd === true,
    pwdType: r.pwdType ?? '',
    hasSpecialNeeds: r.hasSpecialNeeds === true,
    specialNeedsDiagnosis: r.specialNeedsDiagnosis ?? '',
    familyIs4Ps: r.familyIs4Ps === true,
    familySoloParent: r.familySoloParent === true,
    familyIndigenous: r.familyIndigenous === true,
    familyParentPwd: r.familyParentPwd === true,
    familyInformalSettler: r.familyInformalSettler === true,
    referralSource: r.referralSource ?? '',
    referringAgencyPerson: r.referringAgencyPerson ?? '',
    dateAdmitted: isoDateInput(r.dateAdmitted),
    ageUponAdmission: r.ageUponAdmission ?? '',
    presentAge: r.presentAge ?? '',
    lengthOfStay: r.lengthOfStay ?? '',
    dateColbRegistered: isoDateInput(r.dateColbRegistered),
    dateColbObtained: isoDateInput(r.dateColbObtained),
    dateEnrolled: isoDateInput(r.dateEnrolled),
    initialCaseAssessment: r.initialCaseAssessment ?? '',
    dateCaseStudyPrepared: isoDateInput(r.dateCaseStudyPrepared),
    dateClosed: isoDateInput(r.dateClosed),
    reintegrationType: r.reintegrationType ?? '',
    reintegrationStatus: r.reintegrationStatus ?? '',
    initialRiskLevel: (r.initialRiskLevel ?? '').trim().toLowerCase(),
    currentRiskLevel: (r.currentRiskLevel ?? '').trim().toLowerCase(),
    notesRestricted: r.notesRestricted ?? '',
    educationGrade: r.educationGrade ?? '',
    schoolName: r.schoolName ?? '',
    isEnrolled: r.isEnrolled == null ? '' : r.isEnrolled ? 'Yes' : 'No',
  };
}

function ProfileSection({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="resident-profile-card" aria-labelledby={id}>
      <header className="resident-profile-card__header">
        <h3 className="resident-profile-card__title" id={id}>
          {title}
        </h3>
        {hint ? <p className="resident-profile-card__hint">{hint}</p> : null}
      </header>
      <div className="resident-profile-card__fields resident-info-grid">{children}</div>
    </section>
  );
}

export function ResidentCasePage() {
  const { residentId } = useParams();
  const numericId = Number(residentId);
  const [activeTab, setActiveTab] = useState<CaseTab>('overview');
  const [detail, setDetail] = useState<ResidentDetail | null>(null);
  const [healthDashboard, setHealthDashboard] = useState<HealthWellbeingDashboard | null>(null);
  const [processHistory, setProcessHistory] = useState<ProcessRecording[]>([]);
  const [homeHistory, setHomeHistory] = useState<HomeVisitation[]>([]);
  const [incidentHistory, setIncidentHistory] = useState<IncidentReport[]>([]);
  const [interventionPlans, setInterventionPlans] = useState<InterventionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingProcess, setSavingProcess] = useState(false);
  const [savingHome, setSavingHome] = useState(false);
  const [savingIncident, setSavingIncident] = useState(false);
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
  const [incidentEditor, setIncidentEditor] = useState<{
    recordKey: string;
    safehouseId: string;
    incidentDate: string;
    incidentType: string;
    severity: string;
    description: string;
    responseTaken: string;
    resolved: YesNoUnknown;
    resolutionDate: string;
    reportedBy: string;
    followUpRequired: YesNoUnknown;
  } | null>(null);
  const [planEditor, setPlanEditor] = useState<{
    recordKey: string;
    planCategory: string;
    planDescription: string;
    servicesProvided: string;
    targetValue: string;
    targetDate: string;
    status: string;
    caseConferenceDate: string;
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
  const [incidentForm, setIncidentForm] = useState({
    safehouseId: '',
    incidentDate: '',
    incidentType: 'Medical',
    severity: 'Medium',
    description: '',
    responseTaken: '',
    resolved: '' as YesNoUnknown,
    resolutionDate: '',
    reportedBy: '',
    followUpRequired: '' as YesNoUnknown,
  });
  const [planForm, setPlanForm] = useState({
    planCategory: 'Safety',
    planDescription: '',
    servicesProvided: '',
    targetValue: '',
    targetDate: '',
    status: 'Open',
    caseConferenceDate: '',
  });
  const [profileForm, setProfileForm] = useState<ProfileFormState>(EMPTY_PROFILE_FORM);

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

  const conferenceBuckets = useMemo(() => {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const withConference = interventionPlans.filter((plan) => !!plan.caseConferenceDate);
    const upcoming = withConference
      .filter((plan) => {
        const time = new Date(plan.caseConferenceDate as string).getTime();
        return !Number.isNaN(time) && time >= todayStart;
      })
      .sort((a, b) => new Date(a.caseConferenceDate as string).getTime() - new Date(b.caseConferenceDate as string).getTime());
    const past = withConference
      .filter((plan) => {
        const time = new Date(plan.caseConferenceDate as string).getTime();
        return !Number.isNaN(time) && time < todayStart;
      })
      .sort((a, b) => new Date(b.caseConferenceDate as string).getTime() - new Date(a.caseConferenceDate as string).getTime());
    return { upcoming, past };
  }, [interventionPlans]);

  const openPlanEditor = (row: InterventionPlan) => {
    setPlanEditor({
      recordKey: row.recordKey,
      planCategory: row.planCategory ?? 'Safety',
      planDescription: row.planDescription ?? '',
      servicesProvided: row.servicesProvided ?? '',
      targetValue: row.targetValue == null ? '' : String(row.targetValue),
      targetDate: row.targetDate ? toDateInput(row.targetDate) : '',
      status: row.status ?? 'Open',
      caseConferenceDate: row.caseConferenceDate ? toDateInput(row.caseConferenceDate) : '',
    });
  };

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
        const [resident, health, processRows, homeRows, incidentRows, planRows] = await Promise.all([
          caseloadApi.residentDetail(numericId),
          caseloadApi.healthWellbeing(numericId),
          caseloadApi.processRecordings(numericId),
          caseloadApi.homeVisitations(numericId),
          caseloadApi.incidentReports(numericId),
          caseloadApi.interventionPlans(numericId),
        ]);
        setDetail(resident);
        setHealthDashboard(health);
        setProfileForm(residentToProfileForm(resident));
        setProcessHistory(processRows);
        setHomeHistory(homeRows);
        setIncidentHistory(incidentRows);
        setInterventionPlans(planRows);
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

  const submitIncidentReport = async (event: FormEvent) => {
    event.preventDefault();
    if (!detail) return;
    setSavingIncident(true);
    try {
      await caseloadApi.addIncidentReport(detail.id, {
        safehouseId:
          incidentForm.safehouseId.trim() === '' || Number.isNaN(Number(incidentForm.safehouseId))
            ? undefined
            : Number(incidentForm.safehouseId),
        incidentDate: incidentForm.incidentDate,
        incidentType: incidentForm.incidentType,
        severity: incidentForm.severity,
        description: incidentForm.description,
        responseTaken: incidentForm.responseTaken,
        resolved: incidentForm.resolved === '' ? undefined : incidentForm.resolved === 'true',
        resolutionDate: incidentForm.resolutionDate || undefined,
        reportedBy: incidentForm.reportedBy,
        followUpRequired:
          incidentForm.followUpRequired === '' ? undefined : incidentForm.followUpRequired === 'true',
      });
      const rows = await caseloadApi.incidentReports(detail.id);
      setIncidentHistory(rows);
      setIncidentForm({
        safehouseId: '',
        incidentDate: '',
        incidentType: 'Medical',
        severity: 'Medium',
        description: '',
        responseTaken: '',
        resolved: '',
        resolutionDate: '',
        reportedBy: '',
        followUpRequired: '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save incident report.');
    } finally {
      setSavingIncident(false);
    }
  };

  const saveIncidentEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!detail || !incidentEditor) return;
    setSavingEdit(true);
    try {
      await caseloadApi.updateIncidentReport(detail.id, incidentEditor.recordKey, {
        safehouseId:
          incidentEditor.safehouseId.trim() === '' || Number.isNaN(Number(incidentEditor.safehouseId))
            ? undefined
            : Number(incidentEditor.safehouseId),
        incidentDate: incidentEditor.incidentDate,
        incidentType: incidentEditor.incidentType,
        severity: incidentEditor.severity,
        description: incidentEditor.description,
        responseTaken: incidentEditor.responseTaken,
        resolved: incidentEditor.resolved === '' ? undefined : incidentEditor.resolved === 'true',
        resolutionDate: incidentEditor.resolutionDate || undefined,
        reportedBy: incidentEditor.reportedBy,
        followUpRequired:
          incidentEditor.followUpRequired === '' ? undefined : incidentEditor.followUpRequired === 'true',
      });
      const rows = await caseloadApi.incidentReports(detail.id);
      setIncidentHistory(rows);
      setIncidentEditor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update incident report.');
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

      const payload: UpdateResidentDetailPayload = {
        caseStatus: toNullable(profileForm.caseStatus) ?? detail.caseStatus,
        safehouseId:
          profileForm.safehouseId.trim() === '' || Number.isNaN(Number(profileForm.safehouseId))
            ? null
            : Number(profileForm.safehouseId),
        assignedSocialWorker: toNullable(profileForm.assignedSocialWorker),
        sex: toNullable(profileForm.sex),
        dateOfBirth: profileForm.dateOfBirth || undefined,
        birthStatus: toNullable(profileForm.birthStatus),
        placeOfBirth: toNullable(profileForm.placeOfBirth),
        religion: toNullable(profileForm.religion),
        caseCategory: toNullable(profileForm.caseCategory),
        subCatOrphaned: profileForm.subCatOrphaned,
        subCatTrafficked: profileForm.subCatTrafficked,
        subCatChildLabor: profileForm.subCatChildLabor,
        subCatPhysicalAbuse: profileForm.subCatPhysicalAbuse,
        subCatSexualAbuse: profileForm.subCatSexualAbuse,
        subCatOsaec: profileForm.subCatOsaec,
        subCatCicl: profileForm.subCatCicl,
        subCatAtRisk: profileForm.subCatAtRisk,
        subCatStreetChild: profileForm.subCatStreetChild,
        subCatChildWithHiv: profileForm.subCatChildWithHiv,
        isPwd: profileForm.isPwd,
        pwdType: toNullable(profileForm.pwdType),
        hasSpecialNeeds: profileForm.hasSpecialNeeds,
        specialNeedsDiagnosis: toNullable(profileForm.specialNeedsDiagnosis),
        familyIs4Ps: profileForm.familyIs4Ps,
        familySoloParent: profileForm.familySoloParent,
        familyIndigenous: profileForm.familyIndigenous,
        familyParentPwd: profileForm.familyParentPwd,
        familyInformalSettler: profileForm.familyInformalSettler,
        referralSource: toNullable(profileForm.referralSource),
        referringAgencyPerson: toNullable(profileForm.referringAgencyPerson),
        dateAdmitted: profileForm.dateAdmitted || undefined,
        ageUponAdmission: toNullable(profileForm.ageUponAdmission),
        presentAge: toNullable(profileForm.presentAge),
        lengthOfStay: toNullable(profileForm.lengthOfStay),
        dateColbRegistered: profileForm.dateColbRegistered || undefined,
        dateColbObtained: profileForm.dateColbObtained || undefined,
        dateEnrolled: profileForm.dateEnrolled || undefined,
        initialCaseAssessment: toNullable(profileForm.initialCaseAssessment),
        dateCaseStudyPrepared: profileForm.dateCaseStudyPrepared || undefined,
        dateClosed: profileForm.dateClosed || undefined,
        reintegrationType: toNullable(profileForm.reintegrationType),
        reintegrationStatus: toNullable(profileForm.reintegrationStatus),
        initialRiskLevel: profileForm.initialRiskLevel || undefined,
        currentRiskLevel: profileForm.currentRiskLevel || undefined,
        notesRestricted: toNullable(profileForm.notesRestricted),
      };

      await caseloadApi.updateResidentDetail(detail.id, payload);
      const resident = await caseloadApi.residentDetail(detail.id);
      setDetail(resident);
      setProfileForm(residentToProfileForm(resident));
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

  const deleteIncident = async () => {
    if (!detail || !incidentEditor) return;
    if (!window.confirm('Delete this incident report?')) return;
    try {
      await caseloadApi.deleteIncidentReport(detail.id, incidentEditor.recordKey);
      const rows = await caseloadApi.incidentReports(detail.id);
      setIncidentHistory(rows);
      setIncidentEditor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete incident report.');
    }
  };

  const submitInterventionPlan = async (event: FormEvent) => {
    event.preventDefault();
    if (!detail) return;
    try {
      await caseloadApi.addInterventionPlan(detail.id, {
        planCategory: planForm.planCategory,
        planDescription: planForm.planDescription,
        servicesProvided: planForm.servicesProvided,
        targetValue: planForm.targetValue.trim() === '' ? undefined : Number(planForm.targetValue),
        targetDate: planForm.targetDate || undefined,
        status: planForm.status,
        caseConferenceDate: planForm.caseConferenceDate || undefined,
      });
      const rows = await caseloadApi.interventionPlans(detail.id);
      setInterventionPlans(rows);
      setPlanForm({
        planCategory: 'Safety',
        planDescription: '',
        servicesProvided: '',
        targetValue: '',
        targetDate: '',
        status: 'Open',
        caseConferenceDate: '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save intervention plan.');
    }
  };

  const savePlanEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!detail || !planEditor) return;
    setSavingEdit(true);
    try {
      await caseloadApi.updateInterventionPlan(detail.id, planEditor.recordKey, {
        planCategory: planEditor.planCategory,
        planDescription: planEditor.planDescription,
        servicesProvided: planEditor.servicesProvided,
        targetValue: planEditor.targetValue.trim() === '' ? undefined : Number(planEditor.targetValue),
        targetDate: planEditor.targetDate || undefined,
        status: planEditor.status,
        caseConferenceDate: planEditor.caseConferenceDate || undefined,
      });
      const rows = await caseloadApi.interventionPlans(detail.id);
      setInterventionPlans(rows);
      setPlanEditor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update intervention plan.');
    } finally {
      setSavingEdit(false);
    }
  };

  const deletePlan = async () => {
    if (!detail || !planEditor) return;
    if (!window.confirm('Delete this intervention plan?')) return;
    try {
      await caseloadApi.deleteInterventionPlan(detail.id, planEditor.recordKey);
      const rows = await caseloadApi.interventionPlans(detail.id);
      setInterventionPlans(rows);
      setPlanEditor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete intervention plan.');
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
            Case record
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
          <button
            type="button"
            className={`donor-tab${activeTab === 'incident' ? ' donor-tab--active' : ''}`}
            aria-selected={activeTab === 'incident'}
            onClick={() => setActiveTab('incident')}
          >
            Incident reports
          </button>
          <button
            type="button"
            className={`donor-tab${activeTab === 'plans' ? ' donor-tab--active' : ''}`}
            aria-selected={activeTab === 'plans'}
            onClick={() => setActiveTab('plans')}
          >
            Intervention plans
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
                        <ResponsiveContainer debounce={1}>
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
                        <ResponsiveContainer debounce={1}>
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
                        <ResponsiveContainer debounce={1}>
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
                        <ResponsiveContainer debounce={1}>
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
            <article className="resident-case-panel resident-case-panel--profile-form">
              <form className="resident-profile-form" onSubmit={saveProfile}>
                <header className="resident-profile-intro">
                  <h2 className="resident-profile-intro__title">Case record</h2>
                  <p className="resident-profile-intro__lead">
                    Review and update intake information in one place. These fields align with Philippine social-welfare
                    case records; saving updates this resident in your database.
                  </p>
                </header>

                <ProfileSection
                  id="profile-section-identifiers"
                  title="Case & placement"
                  hint="System identifiers, facility assignment, and the social worker responsible for this file."
                >
                <label>
                  Resident ID
                  <input value={detail.id} readOnly className="resident-profile-input--readonly" />
                </label>
                <label>
                  Case control number
                  <input value={detail.caseControlNo} readOnly className="resident-profile-input--readonly" />
                </label>
                <label>
                  Case status
                  <select
                    value={profileForm.caseStatus}
                    onChange={(event) => setProfileForm((c) => ({ ...c, caseStatus: event.target.value }))}
                  >
                    <option value="">—</option>
                    {RESIDENT_CASE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                    {profileForm.caseStatus &&
                      !RESIDENT_CASE_STATUSES.includes(
                        profileForm.caseStatus as (typeof RESIDENT_CASE_STATUSES)[number],
                      ) && (
                        <option value={profileForm.caseStatus}>{profileForm.caseStatus} (from record)</option>
                      )}
                  </select>
                </label>
                <label>
                  Safehouse ID
                  <span className="resident-profile-field-hint">Which shelter or residential facility this case is tied to.</span>
                  <input
                    inputMode="numeric"
                    value={profileForm.safehouseId}
                    onChange={(event) => setProfileForm((c) => ({ ...c, safehouseId: event.target.value }))}
                  />
                </label>
                <label>
                  Assigned social worker
                  <input
                    value={profileForm.assignedSocialWorker}
                    onChange={(event) => setProfileForm((c) => ({ ...c, assignedSocialWorker: event.target.value }))}
                    placeholder="e.g. SW-16"
                  />
                </label>
                </ProfileSection>

                <ProfileSection
                  id="profile-section-demographics"
                  title="Demographics"
                  hint="Basic identity details for the person in care."
                >
                <label>
                  Sex
                  <select
                    value={profileForm.sex}
                    onChange={(event) => setProfileForm((c) => ({ ...c, sex: event.target.value }))}
                  >
                    <option value="">—</option>
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
                    type="date"
                    value={profileForm.dateOfBirth}
                    onChange={(event) => setProfileForm((c) => ({ ...c, dateOfBirth: event.target.value }))}
                  />
                </label>
                <label>
                  Birth status
                  <span className="resident-profile-field-hint">Optional context (e.g. birth registration or living status).</span>
                  <input
                    value={profileForm.birthStatus}
                    onChange={(event) => setProfileForm((c) => ({ ...c, birthStatus: event.target.value }))}
                    placeholder="e.g. registered, living"
                  />
                </label>
                <label>
                  Place of birth
                  <input
                    value={profileForm.placeOfBirth}
                    onChange={(event) => setProfileForm((c) => ({ ...c, placeOfBirth: event.target.value }))}
                  />
                </label>
                <label>
                  Religion
                  <select
                    value={profileForm.religion}
                    onChange={(event) => setProfileForm((c) => ({ ...c, religion: event.target.value }))}
                  >
                    <option value="">—</option>
                    {RESIDENT_RELIGIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                    {profileForm.religion &&
                      !RESIDENT_RELIGIONS.includes(
                        profileForm.religion as (typeof RESIDENT_RELIGIONS)[number],
                      ) && (
                        <option value={profileForm.religion}>{profileForm.religion} (from record)</option>
                      )}
                  </select>
                </label>
                </ProfileSection>

                <ProfileSection
                  id="profile-section-classification"
                  title="Case type & vulnerabilities"
                  hint="Choose the main case category, then mark any specific vulnerability flags that apply."
                >
                <label>
                  Primary case category
                  <select
                    value={profileForm.caseCategory}
                    onChange={(event) => setProfileForm((c) => ({ ...c, caseCategory: event.target.value }))}
                  >
                    <option value="">—</option>
                    {RESIDENT_CASE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    {profileForm.caseCategory &&
                      !RESIDENT_CASE_CATEGORIES.includes(
                        profileForm.caseCategory as (typeof RESIDENT_CASE_CATEGORIES)[number],
                      ) && (
                        <option value={profileForm.caseCategory}>{profileForm.caseCategory} (from record)</option>
                      )}
                  </select>
                </label>
                <p className="resident-profile-explainer resident-profile-full-width">
                  <strong>Vulnerability flags</strong> — select all that apply.{' '}
                  <span className="resident-profile-explainer__muted">
                    OSAEC: online sexual abuse & exploitation of children. CICL: child in conflict with the law.
                  </span>
                </p>
                <div className="resident-profile-check-row resident-profile-check-row--boxed" aria-label="Case sub-categories">
                  <label>
                    <input
                      type="checkbox"
                      checked={profileForm.subCatOrphaned}
                      onChange={(e) => setProfileForm((c) => ({ ...c, subCatOrphaned: e.target.checked }))}
                    />
                    Orphaned
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={profileForm.subCatTrafficked}
                      onChange={(e) => setProfileForm((c) => ({ ...c, subCatTrafficked: e.target.checked }))}
                    />
                    Trafficked
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={profileForm.subCatChildLabor}
                      onChange={(e) => setProfileForm((c) => ({ ...c, subCatChildLabor: e.target.checked }))}
                    />
                    Child labor
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={profileForm.subCatPhysicalAbuse}
                      onChange={(e) => setProfileForm((c) => ({ ...c, subCatPhysicalAbuse: e.target.checked }))}
                    />
                    Physical abuse
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={profileForm.subCatSexualAbuse}
                      onChange={(e) => setProfileForm((c) => ({ ...c, subCatSexualAbuse: e.target.checked }))}
                    />
                    Sexual abuse
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={profileForm.subCatOsaec}
                      onChange={(e) => setProfileForm((c) => ({ ...c, subCatOsaec: e.target.checked }))}
                    />
                    OSAEC
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={profileForm.subCatCicl}
                      onChange={(e) => setProfileForm((c) => ({ ...c, subCatCicl: e.target.checked }))}
                    />
                    CICL
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={profileForm.subCatAtRisk}
                      onChange={(e) => setProfileForm((c) => ({ ...c, subCatAtRisk: e.target.checked }))}
                    />
                    At risk
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={profileForm.subCatStreetChild}
                      onChange={(e) => setProfileForm((c) => ({ ...c, subCatStreetChild: e.target.checked }))}
                    />
                    Street child
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={profileForm.subCatChildWithHiv}
                      onChange={(e) => setProfileForm((c) => ({ ...c, subCatChildWithHiv: e.target.checked }))}
                    />
                    Child with HIV
                  </label>
                </div>
                </ProfileSection>

                <ProfileSection
                  id="profile-section-disability"
                  title="Disability & special needs"
                  hint="Document disability status and any learning or developmental needs."
                >
                <label className="resident-profile-inline-label resident-profile-full-width">
                  <input
                    type="checkbox"
                    checked={profileForm.isPwd}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setProfileForm((c) => ({ ...c, isPwd: checked, pwdType: checked ? c.pwdType : '' }));
                    }}
                  />
                  Person with disability (PWD)
                </label>
                {profileForm.isPwd && (
                  <label className="resident-profile-full-width">
                    Type of disability (PWD)
                    <span className="resident-profile-field-hint">Optional detail to support accommodations.</span>
                    <input
                      value={profileForm.pwdType}
                      onChange={(event) => setProfileForm((c) => ({ ...c, pwdType: event.target.value }))}
                      placeholder="e.g. physical, psychosocial"
                    />
                  </label>
                )}

                <label className="resident-profile-inline-label resident-profile-full-width">
                  <input
                    type="checkbox"
                    checked={profileForm.hasSpecialNeeds}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setProfileForm((c) => ({
                        ...c,
                        hasSpecialNeeds: checked,
                        specialNeedsDiagnosis: checked ? c.specialNeedsDiagnosis : '',
                      }));
                    }}
                  />
                  Has special needs
                </label>
                {profileForm.hasSpecialNeeds && (
                  <label className="resident-profile-full-width">
                    Special needs — diagnosis or notes
                    <textarea
                      rows={2}
                      value={profileForm.specialNeedsDiagnosis}
                      onChange={(event) =>
                        setProfileForm((c) => ({ ...c, specialNeedsDiagnosis: event.target.value }))
                      }
                      placeholder="Brief notes from assessment or school"
                    />
                  </label>
                )}
                </ProfileSection>

                <ProfileSection
                  id="profile-section-family"
                  title="Family & household context"
                  hint="Indicators often recorded for social-welfare reporting (4Ps is the Philippine conditional cash-transfer program). Select all that fit."
                >
                <div className="resident-profile-check-row resident-profile-check-row--boxed">
                  <label>
                    <input
                      type="checkbox"
                      checked={profileForm.familyIs4Ps}
                      onChange={(e) => setProfileForm((c) => ({ ...c, familyIs4Ps: e.target.checked }))}
                    />
                    4Ps beneficiary household
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={profileForm.familySoloParent}
                      onChange={(e) => setProfileForm((c) => ({ ...c, familySoloParent: e.target.checked }))}
                    />
                    Solo parent
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={profileForm.familyIndigenous}
                      onChange={(e) => setProfileForm((c) => ({ ...c, familyIndigenous: e.target.checked }))}
                    />
                    Indigenous group
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={profileForm.familyParentPwd}
                      onChange={(e) => setProfileForm((c) => ({ ...c, familyParentPwd: e.target.checked }))}
                    />
                    Parent / guardian PWD
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={profileForm.familyInformalSettler}
                      onChange={(e) => setProfileForm((c) => ({ ...c, familyInformalSettler: e.target.checked }))}
                    />
                    Informal settler
                  </label>
                </div>
                </ProfileSection>

                <ProfileSection
                  id="profile-section-referral"
                  title="How they arrived & admission timeline"
                  hint="Referral pathway, important people involved, and key dates. COLB milestones refer to the Certificate of Live Birth (registration and when a copy was obtained)."
                >
                <label>
                  Referral source
                  <select
                    value={profileForm.referralSource}
                    onChange={(event) => setProfileForm((c) => ({ ...c, referralSource: event.target.value }))}
                  >
                    <option value="">—</option>
                    {RESIDENT_REFERRAL_SOURCES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                    {profileForm.referralSource &&
                      !RESIDENT_REFERRAL_SOURCES.includes(
                        profileForm.referralSource as (typeof RESIDENT_REFERRAL_SOURCES)[number],
                      ) && (
                        <option value={profileForm.referralSource}>
                          {profileForm.referralSource} (from record)
                        </option>
                      )}
                  </select>
                </label>
                <label>
                  Referring agency or contact person
                  <input
                    value={profileForm.referringAgencyPerson}
                    onChange={(event) =>
                      setProfileForm((c) => ({ ...c, referringAgencyPerson: event.target.value }))
                    }
                    placeholder="Name or agency"
                  />
                </label>
                <label>
                  Date admitted
                  <input
                    type="date"
                    value={profileForm.dateAdmitted}
                    onChange={(event) => setProfileForm((c) => ({ ...c, dateAdmitted: event.target.value }))}
                  />
                </label>
                <label>
                  Age upon admission
                  <span className="resident-profile-field-hint">As recorded at intake (free text, e.g. years and months).</span>
                  <input
                    value={profileForm.ageUponAdmission}
                    onChange={(event) => setProfileForm((c) => ({ ...c, ageUponAdmission: event.target.value }))}
                  />
                </label>
                <label>
                  Present age (on file)
                  <input
                    value={profileForm.presentAge}
                    onChange={(event) => setProfileForm((c) => ({ ...c, presentAge: event.target.value }))}
                  />
                </label>
                <label>
                  Length of stay
                  <span className="resident-profile-field-hint">Optional summary (e.g. X years Y months).</span>
                  <input
                    value={profileForm.lengthOfStay}
                    onChange={(event) => setProfileForm((c) => ({ ...c, lengthOfStay: event.target.value }))}
                  />
                </label>
                <label>
                  COLB registered
                  <span className="resident-profile-field-hint">Certificate of Live Birth — registration date.</span>
                  <input
                    type="date"
                    value={profileForm.dateColbRegistered}
                    onChange={(event) => setProfileForm((c) => ({ ...c, dateColbRegistered: event.target.value }))}
                  />
                </label>
                <label>
                  COLB obtained
                  <span className="resident-profile-field-hint">When the certificate copy was secured.</span>
                  <input
                    type="date"
                    value={profileForm.dateColbObtained}
                    onChange={(event) => setProfileForm((c) => ({ ...c, dateColbObtained: event.target.value }))}
                  />
                </label>
                <label>
                  Program enrollment date
                  <input
                    type="date"
                    value={profileForm.dateEnrolled}
                    onChange={(event) => setProfileForm((c) => ({ ...c, dateEnrolled: event.target.value }))}
                  />
                </label>
                <label className="resident-profile-full-width">
                  Initial case assessment summary
                  <textarea
                    rows={3}
                    value={profileForm.initialCaseAssessment}
                    onChange={(event) =>
                      setProfileForm((c) => ({ ...c, initialCaseAssessment: event.target.value }))
                    }
                    placeholder="Brief narrative or disposition (e.g. for continued care)"
                  />
                </label>
                <label>
                  Case study prepared
                  <input
                    type="date"
                    value={profileForm.dateCaseStudyPrepared}
                    onChange={(event) =>
                      setProfileForm((c) => ({ ...c, dateCaseStudyPrepared: event.target.value }))
                    }
                  />
                </label>
                </ProfileSection>

                <ProfileSection
                  id="profile-section-reintegration"
                  title="Reintegration & case closure"
                  hint="Plan for reunification, adoption, independent living, or other path. Add a closure date when the case leaves active care."
                >
                <label>
                  Reintegration plan type
                  <select
                    value={profileForm.reintegrationType}
                    onChange={(event) => setProfileForm((c) => ({ ...c, reintegrationType: event.target.value }))}
                  >
                    <option value="">—</option>
                    {RESIDENT_REINTEGRATION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                    {profileForm.reintegrationType &&
                      !RESIDENT_REINTEGRATION_TYPES.includes(
                        profileForm.reintegrationType as (typeof RESIDENT_REINTEGRATION_TYPES)[number],
                      ) && (
                        <option value={profileForm.reintegrationType}>
                          {profileForm.reintegrationType} (from record)
                        </option>
                      )}
                  </select>
                </label>
                <label>
                  Reintegration progress
                  <select
                    value={profileForm.reintegrationStatus}
                    onChange={(event) =>
                      setProfileForm((c) => ({ ...c, reintegrationStatus: event.target.value }))
                    }
                  >
                    <option value="">—</option>
                    {RESIDENT_REINTEGRATION_STATUSES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                    {profileForm.reintegrationStatus &&
                      !RESIDENT_REINTEGRATION_STATUSES.includes(
                        profileForm.reintegrationStatus as (typeof RESIDENT_REINTEGRATION_STATUSES)[number],
                      ) && (
                        <option value={profileForm.reintegrationStatus}>
                          {profileForm.reintegrationStatus} (from record)
                        </option>
                      )}
                  </select>
                </label>
                <label>
                  Case closed on
                  <span className="resident-profile-field-hint">Leave empty while the case is active.</span>
                  <input
                    type="date"
                    value={profileForm.dateClosed}
                    onChange={(event) => setProfileForm((c) => ({ ...c, dateClosed: event.target.value }))}
                  />
                </label>
                </ProfileSection>

                <ProfileSection
                  id="profile-section-risk"
                  title="Risk level"
                  hint="Snapshot of assessed risk at intake versus the current review. Used for triage and reporting."
                >
                <label>
                  Risk at intake
                  <select
                    value={profileForm.initialRiskLevel}
                    onChange={(event) =>
                      setProfileForm((c) => ({ ...c, initialRiskLevel: event.target.value }))
                    }
                  >
                    {RESIDENT_RISK_LEVELS.map((o) => (
                      <option key={o.value || 'unset'} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Current risk level
                  <span className="resident-profile-field-hint">Most recent assessment or review.</span>
                  <select
                    value={profileForm.currentRiskLevel}
                    onChange={(event) =>
                      setProfileForm((c) => ({ ...c, currentRiskLevel: event.target.value }))
                    }
                  >
                    {RESIDENT_RISK_LEVELS.map((o) => (
                      <option key={`c-${o.value || 'unset'}`} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                </ProfileSection>

                <ProfileSection
                  id="profile-section-notes"
                  title="Confidential notes"
                  hint="Restricted case notes — share only with authorized staff."
                >
                <label className="resident-profile-full-width">
                  Notes (restricted access)
                  <textarea
                    rows={4}
                    value={profileForm.notesRestricted}
                    onChange={(event) => setProfileForm((c) => ({ ...c, notesRestricted: event.target.value }))}
                    placeholder="Internal notes not shown to donors or the public site"
                  />
                </label>
                </ProfileSection>

                <ProfileSection
                  id="profile-section-education"
                  title="Education snapshot"
                  hint="Latest values from the education record in the database. To change grade or school, add or update education entries elsewhere in the case workflow when that feature is used."
                >
                <label>
                  Grade or level
                  <input value={profileForm.educationGrade} readOnly className="resident-profile-input--readonly" />
                </label>
                <label>
                  School name
                  <input value={profileForm.schoolName} readOnly className="resident-profile-input--readonly" />
                </label>
                <label>
                  Enrollment status
                  <input value={profileForm.isEnrolled} readOnly className="resident-profile-input--readonly" />
                </label>
                </ProfileSection>

                <footer className="resident-profile-footer">
                {profileSuccess && <p className="success-text resident-profile-footer__message">{profileSuccess}</p>}
                <div className="resident-modal-actions resident-profile-actions resident-profile-footer__actions">
                  <button type="button" className="btn-danger" onClick={deleteResident}>
                    Delete resident
                  </button>
                  <button type="submit" className="btn-primary" disabled={savingResident}>
                    {savingResident ? 'Saving…' : 'Save all changes'}
                  </button>
                </div>
                </footer>
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

        {activeTab === 'incident' && (
          <section className="resident-case-grid">
            <article className="resident-case-panel">
              <form className="donor-entry-form" onSubmit={submitIncidentReport}>
                <h2>New incident report</h2>
                <label>Incident date<input type="date" required value={incidentForm.incidentDate} onChange={(event) => setIncidentForm((current) => ({ ...current, incidentDate: event.target.value }))} /></label>
                <label>Incident type<select value={incidentForm.incidentType} onChange={(event) => setIncidentForm((current) => ({ ...current, incidentType: event.target.value }))}><option>Medical</option><option>Security</option><option>RunawayAttempt</option><option>Behavioral</option><option>SelfHarm</option><option>ConflictWithPeer</option></select></label>
                <label>Severity<select value={incidentForm.severity} onChange={(event) => setIncidentForm((current) => ({ ...current, severity: event.target.value }))}><option>Low</option><option>Medium</option><option>High</option></select></label>
                <label>Safehouse ID<input value={incidentForm.safehouseId} onChange={(event) => setIncidentForm((current) => ({ ...current, safehouseId: event.target.value }))} /></label>
                <label>Description<textarea rows={3} value={incidentForm.description} onChange={(event) => setIncidentForm((current) => ({ ...current, description: event.target.value }))} /></label>
                <label>Response taken<textarea rows={2} value={incidentForm.responseTaken} onChange={(event) => setIncidentForm((current) => ({ ...current, responseTaken: event.target.value }))} /></label>
                <label>Reported by<input value={incidentForm.reportedBy} onChange={(event) => setIncidentForm((current) => ({ ...current, reportedBy: event.target.value }))} /></label>
                <label>Resolved<select value={incidentForm.resolved} onChange={(event) => setIncidentForm((current) => ({ ...current, resolved: event.target.value as YesNoUnknown }))}><option value="">Select...</option><option value="true">Yes</option><option value="false">No</option></select></label>
                <label>Resolution date<input type="date" value={incidentForm.resolutionDate} onChange={(event) => setIncidentForm((current) => ({ ...current, resolutionDate: event.target.value }))} /></label>
                <label>Follow-up required<select value={incidentForm.followUpRequired} onChange={(event) => setIncidentForm((current) => ({ ...current, followUpRequired: event.target.value as YesNoUnknown }))}><option value="">Select...</option><option value="true">Yes</option><option value="false">No</option></select></label>
                <button className="btn-primary resident-case-btn" type="submit" disabled={savingIncident}>{savingIncident ? 'Saving...' : 'Save incident report'}</button>
              </form>
            </article>
            <article className="resident-case-panel">
              <div className="donor-table-wrap">
                <table className="donor-table">
                  <thead><tr><th>Date</th><th>Type</th><th>Severity</th></tr></thead>
                  <tbody>
                    {incidentHistory.map((row) => (
                      <tr
                        key={row.recordKey}
                        className="resident-record-row"
                        onClick={() =>
                          setIncidentEditor({
                            recordKey: row.recordKey,
                            safehouseId: row.safehouseId == null ? '' : String(row.safehouseId),
                            incidentDate: toDateInput(row.incidentDate),
                            incidentType: row.incidentType,
                            severity: row.severity ?? 'Medium',
                            description: row.description ?? '',
                            responseTaken: row.responseTaken ?? '',
                            resolved: row.resolved == null ? '' : row.resolved ? 'true' : 'false',
                            resolutionDate: row.resolutionDate ? toDateInput(row.resolutionDate) : '',
                            reportedBy: row.reportedBy ?? '',
                            followUpRequired:
                              row.followUpRequired == null ? '' : row.followUpRequired ? 'true' : 'false',
                          })
                        }
                      >
                        <td>{formatDate(row.incidentDate)}</td>
                        <td>{row.incidentType}</td>
                        <td>{row.severity ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        )}

        {activeTab === 'plans' && (
          <section className="resident-case-grid">
            <article className="resident-case-panel">
              <form className="donor-entry-form" onSubmit={submitInterventionPlan}>
                <h2>New intervention plan</h2>
                <label>Plan category<select value={planForm.planCategory} onChange={(event) => setPlanForm((current) => ({ ...current, planCategory: event.target.value }))}><option>Safety</option><option>Education</option><option>Physical Health</option><option>Mental Health</option><option>Reintegration</option></select></label>
                <label>Plan description<textarea rows={3} value={planForm.planDescription} onChange={(event) => setPlanForm((current) => ({ ...current, planDescription: event.target.value }))} /></label>
                <label>Services provided<input value={planForm.servicesProvided} onChange={(event) => setPlanForm((current) => ({ ...current, servicesProvided: event.target.value }))} placeholder="Caring, Healing, Teaching" /></label>
                <label>Target value<input type="number" step="0.01" value={planForm.targetValue} onChange={(event) => setPlanForm((current) => ({ ...current, targetValue: event.target.value }))} /></label>
                <label>Target date<input type="date" value={planForm.targetDate} onChange={(event) => setPlanForm((current) => ({ ...current, targetDate: event.target.value }))} /></label>
                <label>Status<select value={planForm.status} onChange={(event) => setPlanForm((current) => ({ ...current, status: event.target.value }))}><option>Open</option><option>In Progress</option><option>On Hold</option><option>Achieved</option></select></label>
                <label>Case conference date<input type="date" value={planForm.caseConferenceDate} onChange={(event) => setPlanForm((current) => ({ ...current, caseConferenceDate: event.target.value }))} /></label>
                <button className="btn-primary resident-case-btn" type="submit">Save intervention plan</button>
              </form>
            </article>
            <article className="resident-case-panel">
              <h2>Plan board</h2>
              <div className="donor-table-wrap">
                <table className="donor-table">
                  <thead><tr><th>Category</th><th>Status</th><th>Conference</th><th>Target</th></tr></thead>
                  <tbody>
                    {interventionPlans.map((row) => (
                      <tr
                        key={row.recordKey}
                        className="resident-record-row"
                        onClick={() => openPlanEditor(row)}
                      >
                        <td>{row.planCategory ?? '—'}</td>
                        <td>{row.status ?? '—'}</td>
                        <td>{formatDate(row.caseConferenceDate)}</td>
                        <td>{row.targetDate ? formatDate(row.targetDate) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {interventionPlans.length === 0 && (
                <p className="auth-lead">No intervention plans yet for this resident.</p>
              )}
            </article>
            <article className="resident-case-panel">
              <h2>Upcoming case conferences</h2>
              <div className="donor-table-wrap">
                <table className="donor-table">
                  <thead><tr><th>Conference date</th><th>Category</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {conferenceBuckets.upcoming.map((row) => (
                      <tr key={`upcoming-${row.recordKey}`}>
                        <td>{formatDate(row.caseConferenceDate)}</td>
                        <td>{row.planCategory ?? '—'}</td>
                        <td>{row.status ?? '—'}</td>
                        <td><button type="button" className="btn-secondary" onClick={() => openPlanEditor(row)}>Edit</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {conferenceBuckets.upcoming.length === 0 && <p className="auth-lead">No upcoming case conferences.</p>}
            </article>
            <article className="resident-case-panel">
              <h2>Past case conferences</h2>
              <div className="donor-table-wrap">
                <table className="donor-table">
                  <thead><tr><th>Conference date</th><th>Category</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {conferenceBuckets.past.map((row) => (
                      <tr key={`past-${row.recordKey}`}>
                        <td>{formatDate(row.caseConferenceDate)}</td>
                        <td>{row.planCategory ?? '—'}</td>
                        <td>{row.status ?? '—'}</td>
                        <td><button type="button" className="btn-secondary" onClick={() => openPlanEditor(row)}>Edit</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {conferenceBuckets.past.length === 0 && <p className="auth-lead">No past case conferences.</p>}
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

      {incidentEditor && (
        <div className="resident-modal-backdrop" role="presentation" onClick={() => setIncidentEditor(null)}>
          <article className="resident-modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Edit incident report</h2>
            <form className="donor-entry-form" onSubmit={saveIncidentEdit}>
              <label>Incident date<input type="date" required value={incidentEditor.incidentDate} onChange={(event) => setIncidentEditor((current) => current ? ({ ...current, incidentDate: event.target.value }) : current)} /></label>
              <label>Incident type<select value={incidentEditor.incidentType} onChange={(event) => setIncidentEditor((current) => current ? ({ ...current, incidentType: event.target.value }) : current)}><option>Medical</option><option>Security</option><option>RunawayAttempt</option><option>Behavioral</option><option>SelfHarm</option><option>ConflictWithPeer</option></select></label>
              <label>Severity<select value={incidentEditor.severity} onChange={(event) => setIncidentEditor((current) => current ? ({ ...current, severity: event.target.value }) : current)}><option>Low</option><option>Medium</option><option>High</option></select></label>
              <label>Safehouse ID<input value={incidentEditor.safehouseId} onChange={(event) => setIncidentEditor((current) => current ? ({ ...current, safehouseId: event.target.value }) : current)} /></label>
              <label>Description<textarea rows={3} value={incidentEditor.description} onChange={(event) => setIncidentEditor((current) => current ? ({ ...current, description: event.target.value }) : current)} /></label>
              <label>Response taken<textarea rows={2} value={incidentEditor.responseTaken} onChange={(event) => setIncidentEditor((current) => current ? ({ ...current, responseTaken: event.target.value }) : current)} /></label>
              <label>Reported by<input value={incidentEditor.reportedBy} onChange={(event) => setIncidentEditor((current) => current ? ({ ...current, reportedBy: event.target.value }) : current)} /></label>
              <label>Resolved<select value={incidentEditor.resolved} onChange={(event) => setIncidentEditor((current) => current ? ({ ...current, resolved: event.target.value as YesNoUnknown }) : current)}><option value="">Select...</option><option value="true">Yes</option><option value="false">No</option></select></label>
              <label>Resolution date<input type="date" value={incidentEditor.resolutionDate} onChange={(event) => setIncidentEditor((current) => current ? ({ ...current, resolutionDate: event.target.value }) : current)} /></label>
              <label>Follow-up required<select value={incidentEditor.followUpRequired} onChange={(event) => setIncidentEditor((current) => current ? ({ ...current, followUpRequired: event.target.value as YesNoUnknown }) : current)}><option value="">Select...</option><option value="true">Yes</option><option value="false">No</option></select></label>
              <div className="resident-modal-actions">
                <button type="button" className="btn-secondary" onClick={deleteIncident}>Delete incident</button>
                <button type="button" className="btn-secondary" onClick={() => setIncidentEditor(null)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={savingEdit}>{savingEdit ? 'Saving...' : 'Save changes'}</button>
              </div>
            </form>
          </article>
        </div>
      )}

      {planEditor && (
        <div className="resident-modal-backdrop" role="presentation" onClick={() => setPlanEditor(null)}>
          <article className="resident-modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Edit intervention plan</h2>
            <form className="donor-entry-form" onSubmit={savePlanEdit}>
              <label>Plan category<select value={planEditor.planCategory} onChange={(event) => setPlanEditor((current) => current ? ({ ...current, planCategory: event.target.value }) : current)}><option>Safety</option><option>Education</option><option>Physical Health</option><option>Mental Health</option><option>Reintegration</option></select></label>
              <label>Plan description<textarea rows={3} value={planEditor.planDescription} onChange={(event) => setPlanEditor((current) => current ? ({ ...current, planDescription: event.target.value }) : current)} /></label>
              <label>Services provided<input value={planEditor.servicesProvided} onChange={(event) => setPlanEditor((current) => current ? ({ ...current, servicesProvided: event.target.value }) : current)} /></label>
              <label>Target value<input type="number" step="0.01" value={planEditor.targetValue} onChange={(event) => setPlanEditor((current) => current ? ({ ...current, targetValue: event.target.value }) : current)} /></label>
              <label>Target date<input type="date" value={planEditor.targetDate} onChange={(event) => setPlanEditor((current) => current ? ({ ...current, targetDate: event.target.value }) : current)} /></label>
              <label>Status<select value={planEditor.status} onChange={(event) => setPlanEditor((current) => current ? ({ ...current, status: event.target.value }) : current)}><option>Open</option><option>In Progress</option><option>On Hold</option><option>Achieved</option></select></label>
              <label>Case conference date<input type="date" value={planEditor.caseConferenceDate} onChange={(event) => setPlanEditor((current) => current ? ({ ...current, caseConferenceDate: event.target.value }) : current)} /></label>
              <div className="resident-modal-actions">
                <button type="button" className="btn-secondary" onClick={deletePlan}>Delete plan</button>
                <button type="button" className="btn-secondary" onClick={() => setPlanEditor(null)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={savingEdit}>{savingEdit ? 'Saving...' : 'Save changes'}</button>
              </div>
            </form>
          </article>
        </div>
      )}
    </section>
  );
}
