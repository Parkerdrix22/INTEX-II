import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi } from '../lib/api';
import { loadProfile, saveProfile, type UserProfile } from './profileStorage';

type AuthContextValue = {
  isAuthenticated: boolean;
  isLoading: boolean;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  roles: string[];
  profile: UserProfile;
  effectiveDisplayName: string | null;
  updateProfile: (patch: Partial<UserProfile>) => void;
  login: (login: string, password: string, rememberMe: boolean) => Promise<string[]>;
  logout: () => Promise<void>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [username, setUsername] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [lastName, setLastName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [profile, setProfile] = useState<UserProfile>({
    displayName: '',
    phone: '',
    notes: '',
  });

  useEffect(() => {
    if (isAuthenticated && (email || username)) {
      setProfile(loadProfile(email, username));
    } else if (!isAuthenticated) {
      setProfile({ displayName: '', phone: '', notes: '' });
    }
  }, [isAuthenticated, email, username]);

  useEffect(() => {
    const loadAuth = async () => {
      try {
        const result = await authApi.me();
        setIsAuthenticated(result.isAuthenticated);
        setUsername(result.username ?? null);
        setFirstName(result.firstName ?? null);
        setLastName(result.lastName ?? null);
        setEmail(result.email);
        setRoles(result.roles ?? []);
      } catch {
        setIsAuthenticated(false);
        setUsername(null);
        setEmail(null);
        setRoles([]);
      } finally {
        setIsLoading(false);
      }
    };

    void loadAuth();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated,
      isLoading,
      username,
      firstName,
      lastName,
      email,
      roles,
      profile,
      effectiveDisplayName: (() => {
        const fromProfile = profile.displayName?.trim();
        if (fromProfile) return fromProfile;
        const f = firstName?.trim();
        if (f) return f;
        const u = username?.trim();
        if (!u) return null;
        return u.charAt(0).toUpperCase() + u.slice(1);
      })(),
      updateProfile: (patch) => {
        const next: UserProfile = {
          displayName: patch.displayName ?? profile.displayName,
          phone: patch.phone ?? profile.phone,
          notes: patch.notes ?? profile.notes,
        };
        setProfile(next);
        if (email || username) {
          saveProfile(email, username, next);
        }
      },
      login: async (loginInput: string, password: string, rememberMe: boolean) => {
        await authApi.login(loginInput, password, rememberMe);
        const me = await authApi.me();
        setIsAuthenticated(me.isAuthenticated);
        setUsername(me.username ?? null);
        setFirstName(me.firstName ?? null);
        setLastName(me.lastName ?? null);
        setEmail(me.email);
        setRoles(me.roles ?? []);
        setProfile(loadProfile(me.email, me.username ?? null));
        return me.roles ?? [];
      },
      logout: async () => {
        await authApi.logout();
        setIsAuthenticated(false);
        setUsername(null);
        setFirstName(null);
        setLastName(null);
        setEmail(null);
        setRoles([]);
        setProfile({ displayName: '', phone: '', notes: '' });
      },
    }),
    [isAuthenticated, isLoading, username, firstName, lastName, email, roles, profile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
