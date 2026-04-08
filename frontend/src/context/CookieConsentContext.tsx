import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const consentCookieName = 'kateri_cookie_consent';
const themeCookieName = 'kateri_theme_pref';
const consentMaxAgeSeconds = 60 * 60 * 24 * 365;
type ThemePreference = 'light' | 'dark';

type CookieConsentValue = {
  hasAcknowledgedConsent: boolean;
  consentChoice: 'all' | 'necessary' | null;
  themePreference: ThemePreference;
  acceptAllCookies: () => void;
  acceptNecessaryCookies: () => void;
  toggleThemePreference: () => void;
};

const CookieConsentContext = createContext<CookieConsentValue | undefined>(undefined);

function readCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const cookie = document.cookie
    .split('; ')
    .find((value) => value.startsWith(`${name}=`));
  if (!cookie) return null;
  return decodeURIComponent(cookie.split('=')[1] ?? '');
}

function readInitialValue(): boolean {
  const value = readCookieValue(consentCookieName);
  return value === 'all' || value === 'necessary';
}

function readInitialChoice(): 'all' | 'necessary' | null {
  const value = readCookieValue(consentCookieName);
  if (value === 'all' || value === 'necessary') {
    return value;
  }
  return null;
}

function normalizeThemePreference(value: string | null): ThemePreference {
  return value === 'dark' ? 'dark' : 'light';
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${consentMaxAgeSeconds}; Path=/; SameSite=Lax`;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
}

function readInitialTheme(choice: 'all' | 'necessary' | null): ThemePreference {
  if (choice !== 'all') {
    return 'light';
  }

  return normalizeThemePreference(readCookieValue(themeCookieName));
}

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const [hasAcknowledgedConsent, setHasAcknowledgedConsent] = useState(readInitialValue);
  const [consentChoice, setConsentChoice] = useState<'all' | 'necessary' | null>(() => readInitialChoice());
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => readInitialTheme(readInitialChoice()));

  useEffect(() => {
    document.documentElement.dataset.theme = themePreference;
  }, [themePreference]);

  const value = useMemo<CookieConsentValue>(
    () => ({
      hasAcknowledgedConsent,
      consentChoice,
      themePreference,
      acceptAllCookies: () => {
        writeCookie(consentCookieName, 'all');
        writeCookie(themeCookieName, themePreference);
        setConsentChoice('all');
        setHasAcknowledgedConsent(true);
      },
      acceptNecessaryCookies: () => {
        writeCookie(consentCookieName, 'necessary');
        deleteCookie(themeCookieName);
        setThemePreference('light');
        setConsentChoice('necessary');
        setHasAcknowledgedConsent(true);
      },
      toggleThemePreference: () => {
        const next = themePreference === 'dark' ? 'light' : 'dark';
        setThemePreference(next);
        if (consentChoice === 'all') {
          writeCookie(themeCookieName, next);
        } else {
          deleteCookie(themeCookieName);
        }
      },
    }),
    [hasAcknowledgedConsent, consentChoice, themePreference],
  );

  return <CookieConsentContext.Provider value={value}>{children}</CookieConsentContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCookieConsent() {
  const context = useContext(CookieConsentContext);
  if (!context) {
    // Fallback guards against transient provider wiring issues during HMR.
    return {
      hasAcknowledgedConsent: true,
      consentChoice: null,
      themePreference: 'light',
      acceptAllCookies: () => {},
      acceptNecessaryCookies: () => {},
      toggleThemePreference: () => {},
    } satisfies CookieConsentValue;
  }

  return context;
}
