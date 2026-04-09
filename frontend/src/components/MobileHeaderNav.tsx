import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { NavSettingsMenu } from './NavSettingsMenu';

type ThemePreference = 'light' | 'dark';

export type MobileHeaderNavProps = {
  isAuthenticated: boolean;
  isStaffLike: boolean;
  isDonor: boolean;
  isResident: boolean;
  consentChoice: 'all' | 'necessary' | null;
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
  consentChoice,
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

        {!isAuthenticated && (
          <div className="mobile-nav__auth mobile-nav__auth--with-settings">
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
            <NavSettingsMenu
              layout="inline"
              themePreference={themePreference}
              toggleThemePreference={toggleThemePreference}
              consentChoice={consentChoice}
            />
          </div>
        )}
        {isAuthenticated && (
          <div className="mobile-nav__auth mobile-nav__auth--with-settings">
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
            <NavSettingsMenu
              layout="inline"
              themePreference={themePreference}
              toggleThemePreference={toggleThemePreference}
              consentChoice={consentChoice}
            />
          </div>
        )}
      </div>

      {mobileNavOpen && (
        <div className="mobile-nav-backdrop" aria-hidden="true" onClick={closeMobileNav} />
      )}
    </>
  );
}
