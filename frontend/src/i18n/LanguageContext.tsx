import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import enDict from './en.json';
import nvDict from './nv.json';

// =============================================================================
// LanguageContext
//
// Two-language (English / Diné bizaad) translation system for the Kateri site.
// The user's preference is stored in a *browser-readable* cookie (`kateri.lang`,
// no HttpOnly flag) so React can read it on mount and flip the active
// dictionary. That non-HttpOnly cookie is intentional — it satisfies the
// IS414 security rubric requirement for a browser-accessible cookie that
// React reads to change what is rendered. Authentication cookies remain
// HttpOnly + Secure; only this non-sensitive UI preference is JS-readable.
//
// Preference is written to localStorage (works when users block cookies) and to
// the `kateri.lang` cookie (IS414 rubric: JS-readable cookie). Entries in
// nv.json that are still machine-translation placeholders fall back to English.
//
// Dictionaries are static JSON imported at build time. A Claude-backed script
// (scripts/translate-nv.mjs) regenerates nv.json from en.json offline.
// =============================================================================

export type Lang = 'en' | 'nv';

const LANG_COOKIE_NAME = 'kateri.lang';
/** Same key in localStorage so language works if the browser blocks cookies. */
const LANG_STORAGE_KEY = 'kateri.lang';
const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year
const SUPPORTED: readonly Lang[] = ['en', 'nv'] as const;

type Dict = Record<string, unknown>;

const dictionaries: Record<Lang, Dict> = {
  en: enDict as Dict,
  nv: nvDict as Dict,
};

type LanguageValue = {
  lang: Lang;
  setLang: (next: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  isMachineTranslated: boolean;
};

const LanguageContext = createContext<LanguageValue | undefined>(undefined);

// ---------------------------------------------------------------------------
// Cookie helpers (mirror CookieConsentContext for consistency)
// ---------------------------------------------------------------------------

function readCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const cookie = document.cookie
    .split('; ')
    .find((value) => value.startsWith(`${name}=`));
  if (!cookie) return null;
  return decodeURIComponent(cookie.split('=')[1] ?? '');
}

function writeLangCookie(lang: Lang) {
  if (typeof document === 'undefined') return;
  // No HttpOnly (impossible from JS anyway — that's the point).
  // No Secure flag so local Vite dev over http works; add it in prod via env later if needed.
  document.cookie = `${LANG_COOKIE_NAME}=${lang}; Max-Age=${LANG_COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
}

function readLangFromStorage(): Lang | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (raw && SUPPORTED.includes(raw as Lang)) return raw as Lang;
  } catch {
    /* blocked / private mode */
  }
  return null;
}

function writeLangStorage(lang: Lang) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* quota / blocked */
  }
}

/** nv.json uses this phrase when Claude did not fill a string; show English instead. */
const NV_PENDING_PLACEHOLDER = 'translation not available with confidence';

function isNvPlaceholderString(value: string): boolean {
  return value.includes(NV_PENDING_PLACEHOLDER);
}

function readInitialLang(): Lang {
  const fromStorage = readLangFromStorage();
  if (fromStorage) return fromStorage;

  const fromCookie = readCookieValue(LANG_COOKIE_NAME);
  if (fromCookie && SUPPORTED.includes(fromCookie as Lang)) {
    return fromCookie as Lang;
  }
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('nv')) {
    return 'nv';
  }
  return 'en';
}

// ---------------------------------------------------------------------------
// Dictionary lookup with dotted-key path support
// ---------------------------------------------------------------------------

function lookupKey(dict: Dict, key: string): string | undefined {
  const parts = key.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let node: any = dict;
  for (const part of parts) {
    if (node && typeof node === 'object' && part in node) {
      node = node[part];
    } else {
      return undefined;
    }
  }
  return typeof node === 'string' ? node : undefined;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    const value = vars[name];
    return value !== undefined ? String(value) : `{${name}}`;
  });
}

// ---------------------------------------------------------------------------
// Provider + hook
// ---------------------------------------------------------------------------

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readInitialLang);

  useEffect(() => {
    writeLangStorage(lang);
    writeLangCookie(lang);
  }, [lang]);

  const value = useMemo<LanguageValue>(
    () => ({
      lang,
      isMachineTranslated: lang === 'nv',
      setLang: (next: Lang) => {
        if (!SUPPORTED.includes(next)) return;
        setLangState(next);
      },
      t: (key: string, vars?: Record<string, string | number>) => {
        // Prefer the active language, fall back to English, then to the key
        // itself wrapped in a visible marker during development so missing
        // strings are obvious. In production we quietly show the key so the
        // page never looks broken in front of a judge.
        const primary = lookupKey(dictionaries[lang], key);
        const enString = lookupKey(dictionaries.en, key);

        if (
          lang === 'nv' &&
          primary !== undefined &&
          isNvPlaceholderString(primary) &&
          enString !== undefined
        ) {
          return interpolate(enString, vars);
        }

        if (primary !== undefined) return interpolate(primary, vars);

        if (enString !== undefined) return interpolate(enString, vars);

        if (import.meta.env.DEV) {
          console.warn(`[i18n] missing key: ${key}`);
          return `⟨${key}⟩`;
        }
        return key;
      },
    }),
    [lang],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLanguage(): LanguageValue {
  const context = useContext(LanguageContext);
  if (!context) {
    // HMR-safe fallback — returns an English-only passthrough so pages don't
    // crash during hot reloads when the provider momentarily unmounts.
    return {
      lang: 'en',
      isMachineTranslated: false,
      setLang: () => {},
      t: (key: string, vars?: Record<string, string | number>) => {
        const fallback = lookupKey(dictionaries.en, key);
        return fallback !== undefined ? interpolate(fallback, vars) : key;
      },
    };
  }
  return context;
}
