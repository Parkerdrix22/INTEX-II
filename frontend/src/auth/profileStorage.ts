export type UserProfile = {
  displayName: string;
  phone: string;
  notes: string;
};

const STORAGE_KEY = 'kateri-user-profile-v1';

type StoreShape = Record<string, UserProfile>;

function accountKey(email: string | null, username: string | null): string {
  const e = email?.trim().toLowerCase();
  if (e) return `e:${e}`;
  const u = username?.trim().toLowerCase();
  if (u) return `u:${u}`;
  return '_';
}

function emptyProfile(): UserProfile {
  return { displayName: '', phone: '', notes: '' };
}

export function loadProfile(email: string | null, username: string | null): UserProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyProfile();
    const all = JSON.parse(raw) as StoreShape;
    const key = accountKey(email, username);
    const row = all[key];
    return row ? { ...emptyProfile(), ...row } : emptyProfile();
  } catch {
    return emptyProfile();
  }
}

export function saveProfile(
  email: string | null,
  username: string | null,
  profile: UserProfile,
): void {
  const key = accountKey(email, username);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const all: StoreShape = raw ? (JSON.parse(raw) as StoreShape) : {};
    all[key] = profile;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore quota / private mode
  }
}
