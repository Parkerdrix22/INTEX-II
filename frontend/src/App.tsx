import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useScrollReveal } from './hooks/useScrollReveal';
import { useAuth } from './auth/useAuth';
import { AdminStaffTwoFactorGate } from './auth/AdminStaffTwoFactorGate';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { CaseloadInventoryPage } from './pages/CaseloadInventoryPage';
import { CaseResolutionPage } from './pages/CaseResolutionPage';
import { DonorArchetypePage } from './pages/DonorArchetypePage';
import { DonorChurnPage } from './pages/DonorChurnPage';
import { DonorDashboardPage } from './pages/DonorDashboardPage';
import { DonorImpactPage } from './pages/DonorImpactPage';
import { MyImpactPage } from './pages/MyImpactPage';
import { DonorsContributionsPage } from './pages/DonorsContributionsPage';
import { SupporterDonationsPage } from './pages/SupporterDonationsPage';
import { HomePage } from './pages/HomePage';
import { HomeVisitationPage } from './pages/HomeVisitationPage';
import { ImpactDashboardPage } from './pages/ImpactDashboardPage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { ProcessRecordingPage } from './pages/ProcessRecordingPage';
import { ResidentDashboardPage } from './pages/ResidentDashboardPage';
import { ResidentCasePage } from './pages/ResidentCasePage';
import { ResidentRiskPage } from './pages/ResidentRiskPage';
import { PostPlannerPage } from './pages/PostPlannerPage';
import { ReportsAnalyticsPage } from './pages/ReportsAnalyticsPage';
import { ProfilePage } from './pages/ProfilePage';
import { CookiePolicyPage } from './pages/CookiePolicyPage';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { SafehouseTourPage } from './pages/SafehouseTourPage';
import { UnauthorizedPage } from './pages/UnauthorizedPage';
import { StaffSidebar } from './components/StaffSidebar';
import { ChatWidget } from './components/ChatWidget';
import { LanguageToggle } from './components/LanguageToggle';
import { useLanguage } from './i18n/LanguageContext';
import { CookieConsentBanner } from './components/CookieConsentBanner';
import { NonBlockingErrorBoundary } from './components/NonBlockingErrorBoundary';
import { useCookieConsent } from './context/CookieConsentContext';

function ProfileNavIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
      />
    </svg>
  );
}

function App() {
  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();
  useScrollReveal(mainRef, location.pathname);
  const { isAuthenticated, isLoading, logout, roles, twoFactorEnabled, requiresTwoFactorSetup } = useAuth();
  const needsProfileOnlyGate =
    isAuthenticated &&
    !isLoading &&
    (roles.includes('Admin') || roles.includes('Staff')) &&
    (!twoFactorEnabled && requiresTwoFactorSetup);
  const isStaffLike = roles.includes('Admin') || roles.includes('Staff');
  const isDonor = roles.includes('Donor');
  const isResident = roles.includes('Resident');
  const showStaffSidebar = isAuthenticated && isStaffLike;
  const [staffSidebarOpen, setStaffSidebarOpen] = useState(false);
  const { themePreference, toggleThemePreference, consentChoice } = useCookieConsent();
  const { lang, t } = useLanguage();

  useEffect(() => {
    if (!staffSidebarOpen || !showStaffSidebar) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setStaffSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showStaffSidebar, staffSidebarOpen]);

  return (
    <div className="app-shell">
      <header className="site-header">
        <nav className="top-nav">
          <div className="nav-left">
            <Link className="brand-mark" to="/">
              {t('nav.brand')}
            </Link>
            {showStaffSidebar && (
              <button
                type="button"
                className="staff-sidebar-toggle"
                onClick={() => setStaffSidebarOpen((open) => !open)}
                aria-expanded={staffSidebarOpen}
                aria-controls="staff-sidebar-panel"
                title={staffSidebarOpen ? 'Close staff menu' : 'Open staff menu'}
              >
                {t('nav.staffMenu')}
              </button>
            )}
          </div>

          <div className="nav-right">
            <Link className="nav-link" to="/impact">
              {t('nav.ourImpact')}
            </Link>
            <Link className="nav-link" to="/safehouse-tour">
              {t('nav.safehouseTour')}
            </Link>
            {(isDonor || isStaffLike) && (
              <Link className="nav-link" to="/donor-dashboard">
                {t('nav.donorPortal')}
              </Link>
            )}
            {isAuthenticated && isResident && !isStaffLike && (
              <Link className="nav-link" to="/resident-dashboard">
                {t('nav.residentDashboard')}
              </Link>
            )}
            <LanguageToggle />
            {!isAuthenticated && (
              <div className="auth-nav-pill" role="group" aria-label="Authentication">
                <Link className="auth-nav-pill__link" to="/signup">
                  {t('nav.signup')}
                </Link>
                <span className="auth-nav-pill__sep" aria-hidden="true">
                  |
                </span>
                <Link className="auth-nav-pill__link" to="/login">
                  {t('nav.login')}
                </Link>
              </div>
            )}
            {isAuthenticated && (
              <div className="auth-nav-pill auth-nav-pill--session" role="group" aria-label="Account menu">
                <Link className="auth-nav-pill__icon-link" to="/profile" aria-label={t('nav.profile')} title={t('nav.profile')}>
                  <ProfileNavIcon />
                </Link>
                <span className="auth-nav-pill__sep" aria-hidden="true">
                  |
                </span>
                <button type="button" className="auth-nav-pill__logout" onClick={() => void logout()}>
                  {t('nav.logout')}
                </button>
              </div>
            )}
            <button
              type="button"
              className="theme-toggle-button"
              onClick={toggleThemePreference}
              title={
                consentChoice === 'all'
                  ? 'Theme preference will be remembered in an optional cookie.'
                  : 'Theme preference applies only for this session unless you accept all cookies.'
              }
              aria-label={`Switch to ${themePreference === 'dark' ? 'light' : 'dark'} theme`}
            >
              {themePreference === 'dark' ? (
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M12 6.2a5.8 5.8 0 1 0 0 11.6a5.8 5.8 0 0 0 0-11.6Zm0-3.7a1 1 0 0 1 1 1v1.4a1 1 0 1 1-2 0V3.5a1 1 0 0 1 1-1Zm0 16.1a1 1 0 0 1 1 1V21a1 1 0 1 1-2 0v-1.4a1 1 0 0 1 1-1Zm7.6-7.6a1 1 0 1 1 0 2h-1.4a1 1 0 1 1 0-2h1.4Zm-14.2 0a1 1 0 1 1 0 2H4a1 1 0 1 1 0-2h1.4Zm10.08-4.68a1 1 0 0 1 1.41 0l.99.99a1 1 0 1 1-1.41 1.41l-.99-.99a1 1 0 0 1 0-1.41Zm-8.96 8.96a1 1 0 0 1 1.41 0l.99.99a1 1 0 1 1-1.41 1.41l-.99-.99a1 1 0 0 1 0-1.41Zm11.37.99a1 1 0 0 1 1.41 0l.99.99a1 1 0 1 1-1.41 1.41l-.99-.99a1 1 0 0 1 0-1.41Zm-8.96-8.96a1 1 0 0 1 0 1.41l-.99.99A1 1 0 1 1 5.53 7.3l.99-.99a1 1 0 0 1 1.41 0Z"
                  />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M15.9 3.2a1 1 0 0 1 .25 1.38A8.4 8.4 0 1 0 20.7 15a1 1 0 0 1 1.82.82A10.4 10.4 0 1 1 14.53 2.95a1 1 0 0 1 1.37.25Z"
                  />
                </svg>
              )}
            </button>
          </div>
        </nav>
      </header>

      <div className="app-body">
        {showStaffSidebar && (
          <>
            <div
              className={`staff-sidebar-backdrop${staffSidebarOpen ? ' staff-sidebar-backdrop--visible' : ''}`}
              aria-hidden={!staffSidebarOpen}
              onClick={() => setStaffSidebarOpen(false)}
            />
            <StaffSidebar isOpen={staffSidebarOpen} onClose={() => setStaffSidebarOpen(false)} />
          </>
        )}
        <main ref={mainRef} className="page-container">
          {needsProfileOnlyGate && location.pathname !== '/profile' ? (
            <Navigate to="/profile?requiresTwoFactorSetup=true#profile-security" replace />
          ) : (
          <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/post-planner"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'Staff']}>
                <PostPlannerPage />
              </ProtectedRoute>
            }
          />
          <Route path="/impact" element={<ImpactDashboardPage />} />
          <Route path="/safehouse-tour" element={<SafehouseTourPage />} />
          <Route
            path="/donor-churn"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'Staff']}>
                <DonorChurnPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/resident-risk-triage"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'Staff']}>
                <ResidentRiskPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/case-resolution"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'Staff']}>
                <CaseResolutionPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/donor-impact"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'Staff']}>
                <DonorImpactPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-impact"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'Staff', 'Donor']}>
                <MyImpactPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/donor-archetypes"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'Staff']}>
                <DonorArchetypePage />
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/cookie-policy" element={<CookiePolicyPage />} />
          <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route
            path="/donor-dashboard"
            element={
              <ProtectedRoute allowedRoles={['Donor', 'Admin', 'Staff']}>
                <DonorDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/resident-dashboard"
            element={
              <ProtectedRoute allowedRoles={['Resident']}>
                <ResidentDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin-dashboard"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'Staff']}>
                <AdminDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/donors-contributions"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'Staff']}>
                <DonorsContributionsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/donors-contributions/supporters/:supporterId"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'Staff']}>
                <SupporterDonationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/caseload-inventory"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'Staff']}>
                <CaseloadInventoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports-analytics"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'Staff']}>
                <ReportsAnalyticsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/caseload-inventory/:residentId"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'Staff']}>
                <ResidentCasePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/process-recording"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'Staff']}>
                <ProcessRecordingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/home-visitation"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'Staff']}>
                <HomeVisitationPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          )}
        </main>
        {lang === 'en' && <ChatWidget />}
      </div>
      {lang === 'nv' && (
        <div className="mt-disclaimer-strip" role="status">
          ⚠ {t('common.language.mtDisclaimer')}
        </div>
      )}
      <NonBlockingErrorBoundary>
        <CookieConsentBanner />
      </NonBlockingErrorBoundary>
      <AdminStaffTwoFactorGate />
    </div>
  );
}

export default App;
