import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/useAuth';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { CaseloadInventoryPage } from './pages/CaseloadInventoryPage';
import { DonorsContributionsPage } from './pages/DonorsContributionsPage';
import { HomePage } from './pages/HomePage';
import { ImpactDashboardPage } from './pages/ImpactDashboardPage';
import { LoginPage } from './pages/LoginPage';
import { ReportsAnalyticsPage } from './pages/ReportsAnalyticsPage';

function App() {
  const { isAuthenticated, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="site-header">
        <nav className="top-nav">
          <div className="nav-left">
            <Link className="brand-mark" to="/">
              Kateri
            </Link>
            <Link className="nav-link" to="/">
              Home
            </Link>
            <Link className="nav-link" to="/impact">
              Impact
            </Link>
            {isAuthenticated && (
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
          </div>

          <div className="nav-right">
            {!isAuthenticated && (
              <Link className="login-pill" to="/login">
                Login
              </Link>
            )}
            {isAuthenticated && <button onClick={logout}>Logout</button>}
          </div>
        </nav>
      </header>

      <main className="page-container">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/impact" element={<ImpactDashboardPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/admin-dashboard"
            element={
              <ProtectedRoute>
                <AdminDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/donors-contributions"
            element={
              <ProtectedRoute>
                <DonorsContributionsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/caseload-inventory"
            element={
              <ProtectedRoute>
                <CaseloadInventoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports-analytics"
            element={
              <ProtectedRoute>
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
