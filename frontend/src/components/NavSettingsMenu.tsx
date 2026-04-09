import { useEffect, useId, useRef, useState } from 'react';
import { LanguageToggle } from './LanguageToggle';
import { useLanguage } from '../i18n/LanguageContext';

type ThemePreference = 'light' | 'dark';

export type NavSettingsMenuProps = {
  /** Desktop header: floating panel. Mobile drawer: expands below the trigger. */
  layout: 'popover' | 'inline';
  themePreference: ThemePreference;
  toggleThemePreference: () => void;
  consentChoice: 'all' | 'necessary' | null;
};

function SettingsGearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        fill="currentColor"
        d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.06-.67-1.66-.86l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.6.19-1.16.48-1.66.86l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.06.67 1.66.86l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.6-.19 1.16-.48 1.66-.86l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
      />
    </svg>
  );
}

export function NavSettingsMenu({
  layout,
  themePreference,
  toggleThemePreference,
  consentChoice,
}: NavSettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const el = wrapRef.current;
      if (el && !el.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const themeTitle =
    consentChoice === 'all'
      ? t('nav.themeHintRemembered')
      : t('nav.themeHintSession');

  const panel = open ? (
    <div
      id={menuId}
      className={`nav-settings__panel${layout === 'inline' ? ' nav-settings__panel--inline' : ''}`}
      role="region"
      aria-label={t('nav.settingsMenuLabel')}
    >
      <div className="nav-settings__section">
        <span className="nav-settings__section-label">{t('common.language.toggleLabel')}</span>
        <LanguageToggle />
      </div>
      <div className="nav-settings__section">
        <span className="nav-settings__section-label">{t('nav.theme')}</span>
        <button
          type="button"
          className="nav-settings__theme-btn"
          onClick={() => toggleThemePreference()}
          title={themeTitle}
          aria-label={`${t('nav.theme')}: ${themePreference === 'dark' ? t('nav.switchToLight') : t('nav.switchToDark')}`}
        >
          {themePreference === 'dark' ? (
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 6.2a5.8 5.8 0 1 0 0 11.6a5.8 5.8 0 0 0 0-11.6Zm0-3.7a1 1 0 0 1 1 1v1.4a1 1 0 1 1-2 0V3.5a1 1 0 0 1 1-1Zm0 16.1a1 1 0 0 1 1 1V21a1 1 0 1 1-2 0v-1.4a1 1 0 0 1 1-1Zm7.6-7.6a1 1 0 1 1 0 2h-1.4a1 1 0 1 1 0-2h1.4Zm-14.2 0a1 1 0 1 1 0 2H4a1 1 0 1 1 0-2h1.4Zm10.08-4.68a1 1 0 0 1 1.41 0l.99.99a1 1 0 1 1-1.41 1.41l-.99-.99a1 1 0 0 1 0-1.41Zm-8.96 8.96a1 1 0 0 1 1.41 0l.99.99a1 1 0 1 1-1.41 1.41l-.99-.99a1 1 0 0 1 0-1.41Zm11.37.99a1 1 0 0 1 1.41 0l.99.99a1 1 0 1 1-1.41 1.41l-.99-.99a1 1 0 0 1 0-1.41Zm-8.96-8.96a1 1 0 0 1 0 1.41l-.99.99A1 1 0 1 1 5.53 7.3l.99-.99a1 1 0 0 1 1.41 0Z"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                fill="currentColor"
                d="M15.9 3.2a1 1 0 0 1 .25 1.38A8.4 8.4 0 1 0 20.7 15a1 1 0 0 1 1.82.82A10.4 10.4 0 1 1 14.53 2.95a1 1 0 0 1 1.37.25Z"
              />
            </svg>
          )}
          <span className="nav-settings__theme-label">
            {themePreference === 'dark' ? t('nav.useLightMode') : t('nav.useDarkMode')}
          </span>
        </button>
        <p className="nav-settings__theme-hint">{themeTitle}</p>
      </div>
    </div>
  ) : null;

  return (
    <div
      ref={wrapRef}
      className={`nav-settings nav-settings--${layout}${open ? ' nav-settings--open' : ''}`}
    >
      <button
        type="button"
        className={`nav-settings__trigger${layout === 'inline' ? ' nav-settings__trigger--row' : ''}`}
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="true"
        title={t('nav.openSettings')}
        onClick={() => setOpen((v) => !v)}
      >
        <SettingsGearIcon />
        <span className="visually-hidden">{t('nav.openSettings')}</span>
      </button>
      {panel}
    </div>
  );
}
