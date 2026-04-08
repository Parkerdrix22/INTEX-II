import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LanguageToggle } from './LanguageToggle';

type ThemePreference = 'light' | 'dark';

export type MobileHeaderNavProps = {
  isAuthenticated: boolean;
  isStaffLike: boolean;
  isDonor: boolean;
  isResident: boolean;
  canShowLanguageToggle: boolean;
  themePreference: ThemePreference;
  toggleThemePreference: () => void;
  t: (key: string) => string;
  logout: () => Promise<void>;
};

/**
 * Hamburger + slide-down mobile nav. Parent should pass `key={location.pathname}`
 * so the open/closed state resets on navigation without setState-in-effect.
 */
export function MobileHeaderNav({
  isAuthenticated,
  isStaffLike,
  isDonor,
  isResident,
  canShowLanguageToggle,
  themePreference,
  toggleThemePreference,
  t,
  logout,
}: MobileHeaderNavProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const closeMobileNav = () => setMobileNavOpen(false);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onResize = () => {
      if (window.innerWidth > 768) setMobileNavOpen(false);
    };
    window.addEventListener('resize', onResize);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('resize', onResize);
      document.body.style.overflow = originalOverflow;
    };
  }, [mobileNavOpen]);

  return (
    <>
      <button
        type="button"
        className={`hamburger${mobileNavOpen ? ' hamburger--active' : ''}`}
        aria-expanded={mobileNavOpen}
        aria-controls="mobile-nav-panel"
        aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
        onClick={() => setMobileNavOpen((open) => !open)}
      >
        <span className="hamburger__bar" />
        <span className="hamburger__bar" />
        <span className="hamburger__bar" />
      </button>

      <div
        id="mobile-nav-panel"
        className={`mobile-nav${mobileNavOpen ? ' mobile-nav--open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!mobileNavOpen}
      >
        <Link className="mobile-nav__link" to="/impact" onClick={closeMobileNav}>
          {t('nav.ourImpact')}
        </Link>
        <Link className="mobile-nav__link" to="/safehouse-tour" onClick={closeMobileNav}>
          {t('nav.safehouseTour')}
        </Link>
        {(isDonor || isStaffLike) && (
          <Link className="mobile-nav__link" to="/donor-dashboard" onClick={closeMobileNav}>
            {t('nav.donorPortal')}
          </Link>
        )}
        {isAuthenticated && isResident && !isStaffLike && (
          <Link className="mobile-nav__link" to="/resident-dashboard" onClick={closeMobileNav}>
            {t('nav.residentDashboard')}
          </Link>
        )}
        {isAuthenticated && (
          <Link className="mobile-nav__link" to="/profile" onClick={closeMobileNav}>
            {t('nav.profile')}
          </Link>
        )}

        <div className="mobile-nav__controls">
          {canShowLanguageToggle && <LanguageToggle />}
          <button
            type="button"
            className="mobile-nav__theme-btn"
            onClick={toggleThemePreference}
            aria-label={`Switch to ${themePreference === 'dark' ? 'light' : 'dark'} theme`}
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
            <span>{themePreference === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>
        </div>

        {!isAuthenticated && (
          <div className="mobile-nav__auth">
            <Link
              className="mobile-nav__auth-btn mobile-nav__auth-btn--primary"
              to="/signup"
              onClick={closeMobileNav}
            >
              {t('nav.signup')}
            </Link>
            <Link className="mobile-nav__auth-btn" to="/login" onClick={closeMobileNav}>
              {t('nav.login')}
            </Link>
          </div>
        )}
        {isAuthenticated && (
          <div className="mobile-nav__auth">
            <button
              type="button"
              className="mobile-nav__auth-btn mobile-nav__auth-btn--primary"
              onClick={() => {
                closeMobileNav();
                void logout();
              }}
            >
              {t('nav.logout')}
            </button>
          </div>
        )}
      </div>

      {mobileNavOpen && (
        <div className="mobile-nav-backdrop" aria-hidden="true" onClick={closeMobileNav} />
      )}
    </>
  );
}
