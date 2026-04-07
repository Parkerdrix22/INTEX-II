const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

type MeResponse = {
  isAuthenticated: boolean;
  username?: string | null;
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
  residentId: number;
  sessionDate: string;
  sessionType: string;
  emotionalState: string | null;
  narrativeSummary: string | null;
};

export type HomeVisitation = {
  id: number;
  residentId: number;
  visitDate: string;
  visitType: string;
  observations: string | null;
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

  return (await response.json()) as T;
}

export const authApi = {
  login: (login: string, password: string, rememberMe: boolean) =>
    apiFetch<{ message: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ login, password, rememberMe }),
    }),
  register: (username: string, email: string, password: string, role: 'Resident' | 'Donor') =>
    apiFetch<{ message: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, role }),
    }),
  registerStaff: (username: string, email: string, password: string, role: 'Admin' | 'Staff') =>
    apiFetch<{ message: string }>('/api/auth/register-staff', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, role }),
    }),
  logout: () =>
    apiFetch<{ message: string }>('/api/auth/logout', {
      method: 'POST',
    }),
  me: () => apiFetch<MeResponse>('/api/auth/me', { method: 'GET' }),
  providers: () =>
    apiFetch<Array<{ name: string; displayName: string }>>('/api/auth/providers', { method: 'GET' }),
  externalLoginUrl: (provider: string, returnPath = '/') =>
    `${API_BASE_URL}/api/auth/external-login?provider=${encodeURIComponent(provider)}&returnPath=${encodeURIComponent(returnPath)}`,
};

export const caseloadApi = {
  residents: () => apiFetch<CaseloadResident[]>('/api/caseload/residents', { method: 'GET' }),
  residentDetail: (residentId: number) =>
    apiFetch<ResidentDetail>(`/api/caseload/residents/${residentId}`, { method: 'GET' }),
  processRecordings: (residentId: number) =>
    apiFetch<ProcessRecording[]>(`/api/caseload/residents/${residentId}/process-recordings`, { method: 'GET' }),
  addProcessRecording: (
    residentId: number,
    payload: {
      sessionDate: string;
      sessionType: string;
      socialWorker?: string;
      emotionalState?: string;
      narrativeSummary?: string;
      interventionsApplied?: string;
      followUpActions?: string;
    },
  ) =>
    apiFetch<{ message: string }>(`/api/caseload/residents/${residentId}/process-recordings`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  homeVisitations: (residentId: number) =>
    apiFetch<HomeVisitation[]>(`/api/caseload/residents/${residentId}/home-visitations`, { method: 'GET' }),
  addHomeVisitation: (
    residentId: number,
    payload: {
      visitDate: string;
      visitType: string;
      observations?: string;
      familyCooperationLevel?: string;
      safetyConcerns?: string;
      followUpActions?: string;
    },
  ) =>
    apiFetch<{ message: string }>(`/api/caseload/residents/${residentId}/home-visitations`, {
      method: 'POST',
      body: JSON.stringify(payload),
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
