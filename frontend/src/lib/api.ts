const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

type MeResponse = {
  isAuthenticated: boolean;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email: string | null;
  roles: string[];
  residentId?: string | null;
  supporterId?: string | null;
  staffMemberId?: string | null;
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
    at: string | null;
    action: string;
    details: string;
  }>;
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

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const fallback = `Request failed with status ${response.status}`;
    let message = fallback;

    try {
      const data = (await response.json()) as {
        message?: string;
        title?: string;
        detail?: string;
        errors?: Record<string, string[]>;
      };

      if (data.message) {
        message = data.message;
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
    apiFetch<{ message: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ login, password, rememberMe }),
    }),
  register: (firstName: string, lastName: string, email: string, password: string, role: 'Resident' | 'Donor') =>
    apiFetch<{ message: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ firstName, lastName, email, password, role }),
    }),
  registerStaff: (firstName: string, lastName: string, email: string, password: string, role: 'Admin' | 'Staff') =>
    apiFetch<{ message: string }>('/api/auth/register-staff', {
      method: 'POST',
      body: JSON.stringify({ firstName, lastName, email, password, role }),
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
  healthWellbeing: (residentId: number) =>
    apiFetch<HealthWellbeingDashboard>(`/api/caseload/residents/${residentId}/health-wellbeing`, {
      method: 'GET',
    }),
};

export const donorsContributionsApi = {
  dashboard: () =>
    apiFetch<DonorsContributionsDashboard>('/api/donors-contributions/dashboard', { method: 'GET' }),
};

export const donationsApi = {
  create: (payload: {
    amount: number;
    donationType: string;
    frequency: 'one-time' | 'monthly';
    currency: string;
    donationDate?: string;
    campaignName?: string;
    donorName?: string;
  }) =>
    apiFetch<{ message: string; donationId: number }>('/api/donations', {
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

export const publicApi = {
  homeStats: () => apiFetch<HomeStats>('/api/public/home-stats', { method: 'GET' }),
  impactStats: () => apiFetch<ImpactStats>('/api/public/impact-stats', { method: 'GET' }),
  healthImpact: () => apiFetch<HealthImpact>('/api/public/health-wellbeing-impact', { method: 'GET' }),
};
