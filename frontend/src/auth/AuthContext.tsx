import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi, type LoginResponse } from '../lib/api';
import { loadProfile, saveProfile, type UserProfile } from './profileStorage';

type AuthContextValue = {
  isAuthenticated: boolean;
  isLoading: boolean;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  /** Phone on file from the account (Identity), when available */
  accountPhone: string | null;
  roles: string[];
  twoFactorEnabled: boolean;
  recoveryCodesLeft: number;
  profile: UserProfile;
  effectiveDisplayName: string | null;
  /** Profile phone (local) or account phone — for contact displays */
  effectivePhone: string | null;
  updateProfile: (patch: Partial<UserProfile>) => void;
  login: (login: string, password: string, rememberMe: boolean) => Promise<LoginResponse>;
  refreshSession: () => Promise<void>;
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
  const [accountPhone, setAccountPhone] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [recoveryCodesLeft, setRecoveryCodesLeft] = useState(0);
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

  const refreshSession = useCallback(async () => {
    try {
      const result = await authApi.me();
      setIsAuthenticated(result.isAuthenticated);
      setUsername(result.username ?? null);
      setFirstName(result.firstName ?? null);
      setLastName(result.lastName ?? null);
      setEmail(result.email);
      setAccountPhone(result.phone?.trim() || null);
      setRoles(result.roles ?? []);
      setTwoFactorEnabled(result.twoFactorEnabled ?? false);
      setRecoveryCodesLeft(result.recoveryCodesLeft ?? 0);
      if (result.isAuthenticated) {
        try {
          await authApi.reissueSession();
        } catch {
          // UI already uses DB-backed /me; reissue only refreshes API authorization claims.
        }
      }
    } catch {
      setIsAuthenticated(false);
      setUsername(null);
      setFirstName(null);
      setLastName(null);
      setEmail(null);
      setAccountPhone(null);
      setRoles([]);
      setTwoFactorEnabled(false);
      setRecoveryCodesLeft(0);
    }
  }, []);

  useEffect(() => {
    const loadAuth = async () => {
      await refreshSession();
      setIsLoading(false);
    };
    void loadAuth();
  }, [refreshSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated,
      isLoading,
      username,
      firstName,
      lastName,
      email,
      accountPhone,
      roles,
      twoFactorEnabled,
      recoveryCodesLeft,
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
      effectivePhone: (() => {
        const p = profile.phone?.trim();
        if (p) return p;
        return accountPhone?.trim() || null;
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
        const loginResponse = await authApi.login(loginInput, password, rememberMe);
        if (loginResponse.requiresTwoFactor) {
          return loginResponse;
        }

        if (loginResponse.requiresTwoFactorSetup) {
          await refreshSession();
          const me = await authApi.me();
          setProfile(loadProfile(me.email, me.username ?? null));
          return loginResponse;
        }

        await refreshSession();
        const me = await authApi.me();
        setProfile(loadProfile(me.email, me.username ?? null));
        return loginResponse;
      },
      refreshSession,
      logout: async () => {
        await authApi.logout();
        setIsAuthenticated(false);
        setUsername(null);
        setFirstName(null);
        setLastName(null);
        setEmail(null);
        setAccountPhone(null);
        setRoles([]);
        setTwoFactorEnabled(false);
        setRecoveryCodesLeft(0);
        setProfile({ displayName: '', phone: '', notes: '' });
      },
    }),
    [
      isAuthenticated,
      isLoading,
      username,
      firstName,
      lastName,
      email,
      accountPhone,
      roles,
      twoFactorEnabled,
      recoveryCodesLeft,
      profile,
      refreshSession,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
