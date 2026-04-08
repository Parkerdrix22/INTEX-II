const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL?.trim() ?? '').replace(/\/+$/, '');

type MeResponse = {
  isAuthenticated: boolean;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email: string | null;
  phone?: string | null;
  roles: string[];
  residentId?: string | null;
  supporterId?: string | null;
  staffMemberId?: string | null;
  twoFactorEnabled?: boolean;
  recoveryCodesLeft?: number;
};

export type LoginResponse = {
  message: string;
  requiresTwoFactor?: boolean;
  requiresTwoFactorSetup?: boolean;
  challengeToken?: string;
};

export type TwoFactorSetupStartResponse = {
  sharedKey: string;
  otpauthUri: string;
};

export type TwoFactorSetupVerifyResponse = {
  message: string;
  recoveryCodes: string[];
};

export type TwoFactorRegenerateResponse = {
  message: string;
  recoveryCodes: string[];
};

export type CaseloadResident = {
  id: number;
  displayName: string;
  caseControlNo: string;
  caseStatus: string;
  safehouseId: number | null;
  safehouseName: string | null;
  assignedSocialWorker: string | null;
  dateAdmitted: string | null;
  dateClosed: string | null;
};

export type ResidentDetail = {
  id: number;
  displayName: string;
  caseControlNo: string;
  caseStatus: string;
  safehouseId: number | null;
  safehouseName: string | null;
  sex: string | null;
  dateOfBirth: string | null;
  placeOfBirth: string | null;
  religion: string | null;
  caseCategory: string | null;
  assignedSocialWorker: string | null;
  referralSource: string | null;
  dateAdmitted: string | null;
  dateClosed: string | null;
  reintegrationType: string | null;
  reintegrationStatus: string | null;
  notesRestricted: string | null;
  educationGrade: string | null;
  schoolName: string | null;
  isEnrolled: boolean | null;
};

export type ProcessRecording = {
  id: number;
  recordKey: string;
  residentId: number;
  sessionDate: string;
  socialWorker: string | null;
  sessionType: string;
  sessionDurationMinutes: number | null;
  emotionalStateObserved: string | null;
  emotionalStateEnd: string | null;
  sessionNarrative: string | null;
  interventionsApplied: string | null;
  followUpActions: string | null;
  progressNoted: boolean | null;
  concernsFlagged: boolean | null;
  referralMade: boolean | null;
  notesRestricted: string | null;
};

export type HomeVisitation = {
  id: number;
  recordKey: string;
  residentId: number;
  visitDate: string;
  socialWorker: string | null;
  visitType: string;
  locationVisited: string | null;
  familyMembersPresent: string | null;
  purpose: string | null;
  observations: string | null;
  familyCooperationLevel: string | null;
  safetyConcernsNoted: boolean | null;
  followUpNeeded: boolean | null;
  followUpNotes: string | null;
  visitOutcome: string | null;
};

// Lean summary rows returned by the cross-resident list endpoints. Used by
// the standalone /process-recording and /home-visitation staff pages.
export type ProcessRecordingSummary = {
  recordKey: string;
  residentId: number;
  residentLabel: string;
  caseStatus: string | null;
  sessionDate: string;
  socialWorker: string | null;
  sessionType: string;
  emotionalStateObserved: string | null;
  concernsFlagged: boolean | null;
  progressNoted: boolean | null;
  narrativePreview: string | null;
};

export type HomeVisitationSummary = {
  recordKey: string;
  residentId: number;
  residentLabel: string;
  caseStatus: string | null;
  visitDate: string;
  socialWorker: string | null;
  visitType: string;
  familyCooperationLevel: string | null;
  safetyConcernsNoted: boolean | null;
  followUpNeeded: boolean | null;
  visitOutcome: string | null;
  observationsPreview: string | null;
};

export type IncidentReport = {
  id: number;
  recordKey: string;
  residentId: number;
  safehouseId: number | null;
  incidentDate: string;
  incidentType: string;
  severity: string | null;
  description: string | null;
  responseTaken: string | null;
  resolved: boolean | null;
  resolutionDate: string | null;
  reportedBy: string | null;
  followUpRequired: boolean | null;
};

export type InterventionPlan = {
  id: number;
  recordKey: string;
  residentId: number;
  planCategory: string | null;
  planDescription: string | null;
  servicesProvided: string | null;
  targetValue: number | null;
  targetDate: string | null;
  status: string | null;
  caseConferenceDate: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type HealthWellbeingRow = {
  recordDate: string | null;
  generalHealthScore: number | null;
  nutritionScore: number | null;
  sleepQualityScore: number | null;
  energyLevelScore: number | null;
  heightCm: number | null;
  weightKg: number | null;
  bmi: number | null;
  medicalCheckupDone: boolean | null;
  dentalCheckupDone: boolean | null;
  psychologicalCheckupDone: boolean | null;
  notes: string | null;
};

export type HealthWellbeingDashboard = {
  latest: HealthWellbeingRow | null;
  totalRecords: number;
  medicalDoneCount: number;
  dentalDoneCount: number;
  psychologicalDoneCount: number;
  recent: HealthWellbeingRow[];
};

export type DonorsContributionsDashboard = {
  summary: {
    activeSupporters: number;
    newThisMonth: number;
    contributionsMtd: number;
    totalContributions: number;
  };
  supporters: Array<{
    id: number;
    displayName: string;
    supporterType: string;
    status: string;
    createdAt: string | null;
    lastDonationAt: string | null;
  }>;
  contributions: Array<{
    id: number;
    supporterId: number | null;
    supporterName: string;
    donationType: string;
    donationDate: string | null;
    estimatedValue: number | null;
    campaignName: string | null;
  }>;
  allocations: Array<{
    area: string;
    caringPct: number;
    healingPct: number;
    teachingPct: number;
  }>;
  activity: Array<{
    id: number;
    at: string | null;
    action: string;
    details: string;
  }>;
};

export type SupporterDonation = {
  id: number;
  supporterId: number | null;
  donationType: string;
  donationDate: string | null;
  estimatedValue: number | null;
  campaignName: string | null;
};

export type HomeStats = {
  safehomesSupported: number;
  activeResidentCases: number;
  communityPartners: number;
};

export type ImpactStats = {
  activeResidents: number;
  counselingSessionsFunded: number;
  schoolReintegrationRate: number;
};

export type HealthImpact = {
  monthly: Array<{
    monthKey: string;
    generalHealthScore: number;
    nutritionScore: number;
    sleepQualityScore: number;
    energyLevelScore: number;
  }>;
  averageScoreChange: number;
  improvedResidentPct: number;
};

export type ReportsAnalyticsDashboard = {
  serviceVolumeOverTime: Array<{
    monthKey: string;
    processRecordings: number;
    homeVisitations: number;
    incidents: number;
  }>;
  safehouseComparison: Array<{
    safehouseId: number;
    safehouseName: string;
    activeResidents: number;
    avgHealthScore: number;
    avgEducationProgress: number;
    incidentCount: number;
  }>;
  residentOutcomes: {
    avgHealthScore: number;
    avgEducationProgress: number;
    totalProcessRecordings: number;
    totalHomeVisitations: number;
  };
  reintegration: {
    overallRate: number;
    residentsWithReintegrationStatus: number;
  };
  reintegrationBreakdown: Array<{
    label: string;
    count: number;
  }>;
  incidentTypeBreakdown: Array<{
    label: string;
    count: number;
  }>;
  interventionPlanStatus: Array<{
    label: string;
    count: number;
  }>;
  educationLevelBreakdown: Array<{
    label: string;
    count: number;
  }>;
  conferenceSummary: {
    upcoming: number;
    past: number;
  };
};

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const requestUrl = `${API_BASE_URL}${path}`;
  let response: Response;

  try {
    response = await fetch(requestUrl, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    if (error instanceof TypeError) {
      const endpointHint = API_BASE_URL.length > 0 ? API_BASE_URL : 'this website';
      throw new Error(
        `Unable to reach the server at ${endpointHint}. If you are running locally, start the API and try again.`,
      );
    }

    throw error;
  }

  if (!response.ok) {
    const fallback = `Request failed with status ${response.status}`;
    let message = fallback;

    try {
      const data = (await response.json()) as {
        message?: string;
        title?: string;
        detail?: string;
        error?: string;
        errors?: Record<string, string[]>;
      };

      if (data.message) {
        message = data.message;
      } else if (data.error) {
        message = data.error;
      } else if (data.detail) {
        message = data.detail;
      } else if (data.errors && Object.keys(data.errors).length > 0) {
        const firstKey = Object.keys(data.errors)[0];
        const firstError = data.errors[firstKey]?.[0];
        message = firstError ?? data.title ?? fallback;
      } else {
        message = data.title ?? fallback;
      }
    } catch {
      message = fallback;
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return {} as T;
  }

  const raw = await response.text();
  if (!raw.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error('Received invalid JSON response from server.');
  }
}

export const authApi = {
  login: (login: string, password: string, rememberMe: boolean) =>
    apiFetch<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ login, password, rememberMe }),
    }),
  register: (firstName: string, lastName: string, email: string, password: string, role: 'Resident' | 'Donor') =>
    apiFetch<{ message: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ firstName, lastName, email, password, role }),
    }),
  registerStaff: (
    firstName: string,
    lastName: string,
    email: string,
    password: string,
    username?: string,
  ) =>
    apiFetch<{ message: string }>('/api/auth/register-staff', {
      method: 'POST',
      body: JSON.stringify({
        firstName,
        lastName,
        email,
        password,
        role: 'Staff',
        ...(username?.trim() ? { username: username.trim() } : {}),
      }),
    }),
  reissueSession: () =>
    apiFetch<{ message: string }>('/api/auth/reissue-session', {
      method: 'POST',
    }),
  logout: () =>
    apiFetch<{ message: string }>('/api/auth/logout', {
      method: 'POST',
    }),
  me: () => apiFetch<MeResponse>('/api/auth/me', { method: 'GET' }),
  providers: () =>
    apiFetch<Array<{ name: string; displayName: string }>>('/api/auth/providers', { method: 'GET' }),
  externalLoginUrl: (provider: string, returnPath = '/', flow: 'login' | 'signup' = 'login') =>
    `${API_BASE_URL}/api/auth/external-login?provider=${encodeURIComponent(provider)}&returnPath=${encodeURIComponent(returnPath)}&flow=${encodeURIComponent(flow)}`,
  twoFactorChallenge: (challengeToken: string, code: string) =>
    apiFetch<{ message: string }>('/api/auth/2fa/challenge', {
      method: 'POST',
      body: JSON.stringify({ challengeToken, code }),
    }),
  twoFactorSetupStart: () =>
    apiFetch<TwoFactorSetupStartResponse>('/api/auth/2fa/setup/start', {
      method: 'POST',
    }),
  twoFactorSetupVerify: (code: string) =>
    apiFetch<TwoFactorSetupVerifyResponse>('/api/auth/2fa/setup/verify', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
  twoFactorDisable: () =>
    apiFetch<{ message: string }>('/api/auth/2fa/disable', {
      method: 'POST',
    }),
  twoFactorRecoveryCodesRegenerate: () =>
    apiFetch<TwoFactorRegenerateResponse>('/api/auth/2fa/recovery-codes/regenerate', {
      method: 'POST',
    }),
  changeEmail: (newEmail: string, currentPassword: string) =>
    apiFetch<{ message: string; email: string }>('/api/auth/change-email', {
      method: 'POST',
      body: JSON.stringify({ newEmail, currentPassword }),
    }),
};

export type DonorAccountRow = {
  id: number;
  email: string | null;
  firstName: string;
  lastName: string;
  loginId: string | null;
  supporterId: number | null;
};

export type AdminAccountRow = {
  id: number;
  email: string | null;
  firstName: string;
  lastName: string;
  loginId: string | null;
  staffMemberId: number | null;
};

export type ManageableUserRow = {
  id: number;
  email: string | null;
  firstName: string;
  lastName: string;
  loginId: string | null;
  role: string;
  residentId: number | null;
  supporterId: number | null;
  staffMemberId: number | null;
};

export type ManageableRole = 'Resident' | 'Donor' | 'Staff';

export const userAccountsApi = {
  donorAccounts: () => apiFetch<DonorAccountRow[]>('/api/user-accounts/donors', { method: 'GET' }),
  admins: () => apiFetch<AdminAccountRow[]>('/api/user-accounts/admins', { method: 'GET' }),
  manageableUsers: () => apiFetch<ManageableUserRow[]>('/api/user-accounts/manageable', { method: 'GET' }),
  createUser: (payload: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    role: ManageableRole;
  }) =>
    apiFetch<{ message: string }>('/api/user-accounts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateUser: (
    userId: number,
    payload: { firstName: string; lastName: string; email: string; role: ManageableRole },
  ) =>
    apiFetch<{ message: string }>(`/api/user-accounts/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteUser: (userId: number) =>
    apiFetch<{ message: string }>(`/api/user-accounts/${userId}`, { method: 'DELETE' }),
  promoteToAdmin: (userId: number) =>
    apiFetch<{ message: string }>(`/api/user-accounts/${userId}/promote-to-admin`, { method: 'POST' }),
  demoteFromAdmin: (userId: number, targetRole: 'Staff' | 'Donor') =>
    apiFetch<{ message: string }>(`/api/user-accounts/${userId}/demote-from-admin`, {
      method: 'POST',
      body: JSON.stringify({ targetRole }),
    }),
};

export const donorVolunteerApi = {
  submitVolunteerInterest: (payload: {
    flexibleOnDays: boolean;
    days: string[];
    timesOfDay: string[];
    focusAreas: string[];
    notes: string;
  }) =>
    apiFetch<{ message: string }>('/api/donor/volunteer-interest', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

export const caseloadApi = {
  residents: () => apiFetch<CaseloadResident[]>('/api/caseload/residents', { method: 'GET' }),
  createResident: (payload: {
    caseControlNo: string;
    internalCode: string;
    caseStatus: string;
    safehouseId?: number | null;
    sex?: string;
    dateOfBirth?: string;
    placeOfBirth?: string;
    religion?: string;
    caseCategory?: string;
    assignedSocialWorker?: string;
    referralSource?: string;
    dateAdmitted?: string;
    dateClosed?: string;
    reintegrationType?: string;
    reintegrationStatus?: string;
  }) =>
    apiFetch<{ message: string; residentId: number }>('/api/caseload/residents', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  residentDetail: (residentId: number) =>
    apiFetch<ResidentDetail>(`/api/caseload/residents/${residentId}`, { method: 'GET' }),
  updateResidentDetail: (
    residentId: number,
    payload: {
      caseStatus?: string;
      safehouseId?: number | null;
      sex?: string;
      dateOfBirth?: string;
      placeOfBirth?: string;
      religion?: string;
      caseCategory?: string;
      assignedSocialWorker?: string;
      referralSource?: string;
      dateAdmitted?: string;
      dateClosed?: string;
      reintegrationType?: string;
      reintegrationStatus?: string;
    },
  ) =>
    apiFetch<{ message: string }>(`/api/caseload/residents/${residentId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteResident: (residentId: number) =>
    apiFetch<{ message: string }>(`/api/caseload/residents/${residentId}`, {
      method: 'DELETE',
    }),
  // Cross-resident list — powers the standalone /process-recording page.
  listAllProcessRecordings: () =>
    apiFetch<ProcessRecordingSummary[]>(`/api/caseload/process-recordings`, { method: 'GET' }),
  // Cross-resident list — powers the standalone /home-visitation page.
  listAllHomeVisitations: () =>
    apiFetch<HomeVisitationSummary[]>(`/api/caseload/home-visitations`, { method: 'GET' }),
  processRecordings: (residentId: number) =>
    apiFetch<ProcessRecording[]>(`/api/caseload/residents/${residentId}/process-recordings`, { method: 'GET' }),
  addProcessRecording: (
    residentId: number,
    payload: {
      sessionDate: string;
      sessionType: string;
      socialWorker?: string;
      sessionDurationMinutes?: number;
      emotionalStateObserved?: string;
      emotionalStateEnd?: string;
      sessionNarrative?: string;
      interventionsApplied?: string;
      followUpActions?: string;
      progressNoted?: boolean;
      concernsFlagged?: boolean;
      referralMade?: boolean;
      notesRestricted?: string;
    },
  ) =>
    apiFetch<{ message: string }>(`/api/caseload/residents/${residentId}/process-recordings`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateProcessRecording: (
    residentId: number,
    recordKey: string,
    payload: {
      sessionDate: string;
      sessionType: string;
      socialWorker?: string;
      sessionDurationMinutes?: number;
      emotionalStateObserved?: string;
      emotionalStateEnd?: string;
      sessionNarrative?: string;
      interventionsApplied?: string;
      followUpActions?: string;
      progressNoted?: boolean;
      concernsFlagged?: boolean;
      referralMade?: boolean;
      notesRestricted?: string;
    },
  ) =>
    apiFetch<{ message: string }>(
      `/api/caseload/residents/${residentId}/process-recordings/${encodeURIComponent(recordKey)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    ),
  deleteProcessRecording: (residentId: number, recordKey: string) =>
    apiFetch<{ message: string }>(
      `/api/caseload/residents/${residentId}/process-recordings/${encodeURIComponent(recordKey)}`,
      {
        method: 'DELETE',
      },
    ),
  homeVisitations: (residentId: number) =>
    apiFetch<HomeVisitation[]>(`/api/caseload/residents/${residentId}/home-visitations`, { method: 'GET' }),
  addHomeVisitation: (
    residentId: number,
    payload: {
      visitDate: string;
      socialWorker?: string;
      visitType: string;
      locationVisited?: string;
      familyMembersPresent?: string;
      purpose?: string;
      observations?: string;
      familyCooperationLevel?: string;
      safetyConcernsNoted?: boolean;
      followUpNeeded?: boolean;
      followUpNotes?: string;
      visitOutcome?: string;
    },
  ) =>
    apiFetch<{ message: string }>(`/api/caseload/residents/${residentId}/home-visitations`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateHomeVisitation: (
    residentId: number,
    recordKey: string,
    payload: {
      visitDate: string;
      visitType: string;
      socialWorker?: string;
      locationVisited?: string;
      familyMembersPresent?: string;
      purpose?: string;
      observations?: string;
      familyCooperationLevel?: string;
      safetyConcernsNoted?: boolean;
      followUpNeeded?: boolean;
      followUpNotes?: string;
      visitOutcome?: string;
    },
  ) =>
    apiFetch<{ message: string }>(
      `/api/caseload/residents/${residentId}/home-visitations/${encodeURIComponent(recordKey)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    ),
  deleteHomeVisitation: (residentId: number, recordKey: string) =>
    apiFetch<{ message: string }>(
      `/api/caseload/residents/${residentId}/home-visitations/${encodeURIComponent(recordKey)}`,
      {
        method: 'DELETE',
      },
    ),
  incidentReports: (residentId: number) =>
    apiFetch<IncidentReport[]>(`/api/caseload/residents/${residentId}/incident-reports`, {
      method: 'GET',
    }),
  addIncidentReport: (
    residentId: number,
    payload: {
      incidentDate: string;
      incidentType: string;
      safehouseId?: number | null;
      severity?: string;
      description?: string;
      responseTaken?: string;
      resolved?: boolean;
      resolutionDate?: string;
      reportedBy?: string;
      followUpRequired?: boolean;
    },
  ) =>
    apiFetch<{ message: string }>(`/api/caseload/residents/${residentId}/incident-reports`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateIncidentReport: (
    residentId: number,
    recordKey: string,
    payload: {
      incidentDate: string;
      incidentType: string;
      safehouseId?: number | null;
      severity?: string;
      description?: string;
      responseTaken?: string;
      resolved?: boolean;
      resolutionDate?: string;
      reportedBy?: string;
      followUpRequired?: boolean;
    },
  ) =>
    apiFetch<{ message: string }>(
      `/api/caseload/residents/${residentId}/incident-reports/${encodeURIComponent(recordKey)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    ),
  deleteIncidentReport: (residentId: number, recordKey: string) =>
    apiFetch<{ message: string }>(
      `/api/caseload/residents/${residentId}/incident-reports/${encodeURIComponent(recordKey)}`,
      {
        method: 'DELETE',
      },
    ),
  interventionPlans: (residentId: number) =>
    apiFetch<InterventionPlan[]>(`/api/caseload/residents/${residentId}/intervention-plans`, {
      method: 'GET',
    }),
  addInterventionPlan: (
    residentId: number,
    payload: {
      planCategory?: string;
      planDescription?: string;
      servicesProvided?: string;
      targetValue?: number;
      targetDate?: string;
      status?: string;
      caseConferenceDate?: string;
    },
  ) =>
    apiFetch<{ message: string }>(`/api/caseload/residents/${residentId}/intervention-plans`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateInterventionPlan: (
    residentId: number,
    recordKey: string,
    payload: {
      planCategory?: string;
      planDescription?: string;
      servicesProvided?: string;
      targetValue?: number;
      targetDate?: string;
      status?: string;
      caseConferenceDate?: string;
    },
  ) =>
    apiFetch<{ message: string }>(
      `/api/caseload/residents/${residentId}/intervention-plans/${encodeURIComponent(recordKey)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    ),
  deleteInterventionPlan: (residentId: number, recordKey: string) =>
    apiFetch<{ message: string }>(
      `/api/caseload/residents/${residentId}/intervention-plans/${encodeURIComponent(recordKey)}`,
      {
        method: 'DELETE',
      },
    ),
  healthWellbeing: (residentId: number) =>
    apiFetch<HealthWellbeingDashboard>(`/api/caseload/residents/${residentId}/health-wellbeing`, {
      method: 'GET',
    }),
};

export const donorsContributionsApi = {
  dashboard: () =>
    apiFetch<DonorsContributionsDashboard>('/api/donors-contributions/dashboard', { method: 'GET' }),
  createSupporter: (payload: {
    supporterType: string;
    displayName?: string;
    organizationName?: string;
    firstName?: string;
    lastName?: string;
    relationshipType: string;
    region: string;
    country: string;
    email?: string;
    phone?: string;
    status: string;
    createdAt?: string;
    firstDonationDate?: string;
    acquisitionChannel: string;
  }) =>
    apiFetch<{ message: string; supporterId: number }>('/api/donors-contributions/supporters', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  supporterDonations: (supporterId: number) =>
    apiFetch<SupporterDonation[]>(`/api/donors-contributions/supporters/${supporterId}/donations`, {
      method: 'GET',
    }),
  createSupporterDonation: (
    supporterId: number,
    payload: {
      donationType: string;
      estimatedValue: number;
      donationDate?: string;
      campaignName?: string;
    },
  ) =>
    apiFetch<{ message: string; donationId: number }>(
      `/api/donors-contributions/supporters/${supporterId}/donations`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),
  updateDonation: (
    donationId: number,
    payload: {
      donationType: string;
      estimatedValue: number;
      donationDate: string;
      campaignName?: string;
    },
  ) =>
    apiFetch<{ message: string }>(`/api/donors-contributions/donations/${donationId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteDonation: (donationId: number) =>
    apiFetch<{ message: string }>(`/api/donors-contributions/donations/${donationId}`, {
      method: 'DELETE',
    }),
};

// Pipeline 8: Need-Based Donation Routing
export type SafehouseAllocation = {
  safehouseId: number;
  safehouseName: string;
  programArea: string;
  amount: number;
  needScore: number;
};

export type AllocationPlan = {
  totalAmount: number;
  generalFundAmount: number;
  rainyDayAmount: number;
  programArea: string;
  safehouseAllocations: SafehouseAllocation[];
};

export type DonationValuation = {
  canonicalType: string;   // Monetary | Time | Skills | InKind | SocialMedia
  impactUnit: string;      // hours | items | campaigns | USD
  rawAmount: number;       // what the donor typed
  estimatedValue: number;  // computed dollar equivalent
  ratePerUnit: number;     // multiplier used
  rateSource: string;      // human-readable source
};

export type CreateDonationResponse = {
  message: string;
  donationId: number;
  valuation: DonationValuation;
  allocation: AllocationPlan;
};

export const PROGRAM_AREAS = [
  'Education',
  'Wellbeing',
  'Operations',
  'Outreach',
  'Transport',
  'Maintenance',
] as const;

export type ProgramArea = (typeof PROGRAM_AREAS)[number];

export const donationsApi = {
  create: (payload: {
    amount: number;
    donationType: string;
    frequency: 'one-time' | 'monthly';
    currency: string;
    donationDate?: string;
    campaignName?: string;
    donorName?: string;
    programArea?: ProgramArea;
  }) =>
    apiFetch<CreateDonationResponse>('/api/donations', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  createInKind: (payload: {
    itemName: string;
    itemCategory: string;
    quantity: number;
    unitOfMeasure: string;
    estimatedTotalValue: number;
    intendedUse: string;
    receivedCondition: string;
    currency: string;
    donationDate?: string;
    campaignName?: string;
    donorName?: string;
  }) =>
    apiFetch<{ message: string; donationId: number }>('/api/donations/in-kind', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

export const chatApi = {
  ask: (message: string) =>
    apiFetch<{ answer: string }>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
};

// Donor impact — current logged-in donor's personalized data.
// The supporter_id is read server-side from the cookie claim, so the frontend
// never has to know it (and donor B can never see donor A's data).
export type DonorImpactProgramArea = {
  name: string;
  amount: number;
  percent: number;
};

export type DonorImpactSafehouse = {
  safehouseId: number;
  name: string;
  city: string;
  province: string;
  country: string;
  amountAllocated: number;
};

export type DonorImpactMonthly = {
  month: string;
  amount: number;
  count: number;
};

export type DonorImpactReport = {
  supporterId: number;
  displayName: string;
  supporterType: string;
  country: string;
  region: string;
  totalContributed: number;
  totalAllocated: number;
  donationCount: number;
  firstDonationDate: string | null;
  lastDonationDate: string | null;
  programAreaBreakdown: DonorImpactProgramArea[];
  safehousesSupported: DonorImpactSafehouse[];
  monthlyTimeline: DonorImpactMonthly[];
  avgHealthScore: number | null;
  avgEducationProgress: number | null;
  avgActiveResidents: number | null;
  message?: string;
};

export const donorImpactApi = {
  me: () => apiFetch<DonorImpactReport>('/api/donor-impact/me', { method: 'GET' }),
};

export const reportsAnalyticsApi = {
  dashboard: () =>
    apiFetch<ReportsAnalyticsDashboard>('/api/reports-analytics/dashboard', { method: 'GET' }),
};

export const publicApi = {
  homeStats: () => apiFetch<HomeStats>('/api/public/home-stats', { method: 'GET' }),
  impactStats: () => apiFetch<ImpactStats>('/api/public/impact-stats', { method: 'GET' }),
  healthImpact: () => apiFetch<HealthImpact>('/api/public/health-wellbeing-impact', { method: 'GET' }),
};
