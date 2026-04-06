import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/useAuth';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { CaseloadInventoryPage } from './pages/CaseloadInventoryPage';
import { DonorChurnPage } from './pages/DonorChurnPage';
import { DonorDashboardPage } from './pages/DonorDashboardPage';
import { DonorsContributionsPage } from './pages/DonorsContributionsPage';
import { HomePage } from './pages/HomePage';
import { ImpactDashboardPage } from './pages/ImpactDashboardPage';
import { LoginPage } from './pages/LoginPage';
import { ResidentDashboardPage } from './pages/ResidentDashboardPage';
import { PostPlannerPage } from './pages/PostPlannerPage';
import { ReportsAnalyticsPage } from './pages/ReportsAnalyticsPage';
import { SignupPage } from './pages/SignupPage';
import { UnauthorizedPage } from './pages/UnauthorizedPage';

function App() {
  const { isAuthenticated, logout, roles } = useAuth();
  const isStaffLike = roles.includes('Admin') || roles.includes('Staff');
  const isDonor = roles.includes('Donor');
  const isResident = roles.includes('Resident');

  return (
    <div className="app-shell">
      <header className="site-header">
        <nav className="top-nav">
          <div className="nav-left">
            <Link className="brand-mark" to="/">
              Kateri
            </Link>
            <Link className="nav-link" to="/impact">
              Impact
            </Link>
            <Link className="nav-link" to="/post-planner">
              Post Planner
            </Link>
            <Link className="nav-link" to="/donor-churn">
              Donor Retention
            </Link>
            {isAuthenticated && (
              <>
                {roles.includes('Admin') && (
                  <>
                    <Link className="nav-link" to="/signup">
                      Create Accounts
                    </Link>
                  </>
                )}
                {isStaffLike && (
                  <>
                    <Link className="nav-link" to="/admin-dashboard">
                      Admin Dashboard
                    </Link>
                    <Link className="nav-link" to="/donors-contributions">
                      Donors & Contributions
                    </Link>
                    <Link className="nav-link" to="/caseload-inventory">
                      Caseload Inventory
                    </Link>
                    <Link className="nav-link" to="/reports-analytics">
                      Reports & Analytics
                    </Link>
                  </>
                )}
                {isDonor && (
                  <Link className="nav-link" to="/donor-dashboard">
                    Donor Dashboard
                  </Link>
                )}
                {isResident && (
                  <Link className="nav-link" to="/resident-dashboard">
                    Resident Dashboard
                  </Link>
                )}
              </>
            )}
          </div>

          <div className="nav-right">
            {!isAuthenticated && (
              <>
                <Link className="nav-link signup-link" to="/signup">
                  Sign Up
                </Link>
                <Link className="login-pill" to="/login">
                  Login
                </Link>
              </>
            )}
            {isAuthenticated && <button onClick={logout}>Logout</button>}
          </div>
        </nav>
      </header>

      <main className="page-container">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/impact" element={<ImpactDashboardPage />} />
          <Route path="/post-planner" element={<PostPlannerPage />} />
          <Route path="/donor-churn" element={<DonorChurnPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route
            path="/donor-dashboard"
            element={
              <ProtectedRoute allowedRoles={['Donor']}>
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

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
