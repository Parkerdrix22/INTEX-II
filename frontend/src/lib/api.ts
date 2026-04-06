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
      const data = (await response.json()) as { message?: string };
      message = data.message ?? fallback;
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
};
