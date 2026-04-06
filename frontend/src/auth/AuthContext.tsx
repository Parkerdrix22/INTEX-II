import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi } from '../lib/api';

type AuthContextValue = {
  isAuthenticated: boolean;
  isLoading: boolean;
  email: string | null;
  login: (email: string, password: string, rememberMe: boolean) => Promise<void>;
  logout: () => Promise<void>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const loadAuth = async () => {
      try {
        const result = await authApi.me();
        setIsAuthenticated(result.isAuthenticated);
        setEmail(result.email);
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
      email,
      login: async (loginEmail: string, password: string, rememberMe: boolean) => {
        await authApi.login(loginEmail, password, rememberMe);
        const me = await authApi.me();
        setIsAuthenticated(me.isAuthenticated);
        setEmail(me.email);
      },
      logout: async () => {
        await authApi.logout();
        setIsAuthenticated(false);
        setEmail(null);
      },
    }),
    [isAuthenticated, isLoading, email],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
