import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import backgroundImage from '../background.jpg';

export function LoginPage() {
  const { login, isAuthenticated, roles } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loginInput, setLoginInput] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: string } | undefined)?.from;
  const authenticatedFallback = roles.includes('Resident')
    ? '/resident-dashboard'
    : roles.includes('Donor')
      ? '/donor-dashboard'
      : '/admin-dashboard';

  useEffect(() => {
    document.body.classList.add('home-background');
    document.documentElement.style.setProperty('--home-bg-image', `url(${backgroundImage})`);

    return () => {
      document.body.classList.remove('home-background');
      document.documentElement.style.removeProperty('--home-bg-image');
    };
  }, []);

  if (isAuthenticated) {
    return <Navigate to={from ?? authenticatedFallback} replace />;
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const userRoles = await login(loginInput, password, rememberMe);
      const defaultRoute = userRoles.includes('Resident')
        ? '/resident-dashboard'
        : userRoles.includes('Donor')
          ? '/donor-dashboard'
          : '/admin-dashboard';
      navigate(from ?? defaultRoute, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="auth-page">
      <article className="auth-card">
        <h1>Sign in</h1>
        <p className="auth-lead">
          Welcome back to Kateri. Need an account? <Link to="/signup">Create one</Link>.
        </p>
        <form onSubmit={onSubmit}>
          <label>
            Username or Email
            <input
              required
              type="text"
              value={loginInput}
              onChange={(event) => setLoginInput(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
            />
            Keep me signed in
          </label>
          {error && <p className="error-text">{error}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </article>
    </section>
  );
}
