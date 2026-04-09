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
import { NavSettingsMenu } from './components/NavSettingsMenu';
import { useLanguage } from './i18n/LanguageContext';
import { useCookieConsent } from './context/CookieConsentContext';
import { CookieConsentBanner } from './components/CookieConsentBanner';
import { NonBlockingErrorBoundary } from './components/NonBlockingErrorBoundary';
import { MobileHeaderNav } from './components/MobileHeaderNav';

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
            <NavSettingsMenu
              layout="popover"
              themePreference={themePreference}
              toggleThemePreference={toggleThemePreference}
              consentChoice={consentChoice}
            />
          </div>

          <MobileHeaderNav
            key={location.pathname}
            isAuthenticated={isAuthenticated}
            isStaffLike={isStaffLike}
            isDonor={isDonor}
            isResident={isResident}
            consentChoice={consentChoice}
            themePreference={themePreference}
            toggleThemePreference={toggleThemePreference}
            t={t}
            logout={logout}
          />
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
      <NonBlockingErrorBoundary>
        <CookieConsentBanner />
      </NonBlockingErrorBoundary>
      <AdminStaffTwoFactorGate />
    </div>
  );
}

export default App;
