import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

const consentCookieName = 'kateri_cookie_consent';
const consentMaxAgeSeconds = 60 * 60 * 24 * 365;

type CookieConsentValue = {
  hasAcknowledgedConsent: boolean;
  consentChoice: 'all' | 'necessary' | null;
  acceptAllCookies: () => void;
  acceptNecessaryCookies: () => void;
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

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const [hasAcknowledgedConsent, setHasAcknowledgedConsent] = useState(readInitialValue);
  const [consentChoice, setConsentChoice] = useState<'all' | 'necessary' | null>(readInitialChoice);

  const value = useMemo<CookieConsentValue>(
    () => ({
      hasAcknowledgedConsent,
      consentChoice,
      acceptAllCookies: () => {
        document.cookie = `${consentCookieName}=all; Max-Age=${consentMaxAgeSeconds}; Path=/; SameSite=Lax`;
        setConsentChoice('all');
        setHasAcknowledgedConsent(true);
      },
      acceptNecessaryCookies: () => {
        document.cookie = `${consentCookieName}=necessary; Max-Age=${consentMaxAgeSeconds}; Path=/; SameSite=Lax`;
        setConsentChoice('necessary');
        setHasAcknowledgedConsent(true);
      },
    }),
    [hasAcknowledgedConsent, consentChoice],
  );

  return <CookieConsentContext.Provider value={value}>{children}</CookieConsentContext.Provider>;
}

export function useCookieConsent() {
  const context = useContext(CookieConsentContext);
  if (!context) {
    throw new Error('useCookieConsent must be used within a CookieConsentProvider.');
  }

  return context;
}
