import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi } from '../lib/api';

type AuthContextValue = {
  isAuthenticated: boolean;
  isLoading: boolean;
  username: string | null;
  email: string | null;
  roles: string[];
  login: (login: string, password: string, rememberMe: boolean) => Promise<string[]>;
  logout: () => Promise<void>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [username, setUsername] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);

  useEffect(() => {
    const loadAuth = async () => {
      try {
        const result = await authApi.me();
        setIsAuthenticated(result.isAuthenticated);
        setUsername(result.username ?? null);
        setEmail(result.email);
        setRoles(result.roles ?? []);
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
      email,
      roles,
      login: async (loginInput: string, password: string, rememberMe: boolean) => {
        await authApi.login(loginInput, password, rememberMe);
        const me = await authApi.me();
        setIsAuthenticated(me.isAuthenticated);
        setUsername(me.username ?? null);
        setEmail(me.email);
        setRoles(me.roles ?? []);
        return me.roles ?? [];
      },
      logout: async () => {
        await authApi.logout();
        setIsAuthenticated(false);
        setUsername(null);
        setEmail(null);
        setRoles([]);
      },
    }),
    [isAuthenticated, isLoading, username, email, roles],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
