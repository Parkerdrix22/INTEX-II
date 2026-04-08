import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { authApi } from '../lib/api';
import backgroundImage from '../background.jpg?format=webp&quality=82&w=1920';

export function LoginPage() {
  const { login, isAuthenticated, refreshSession } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loginInput, setLoginInput] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [requiresTwoFactorSetup, setRequiresTwoFactorSetup] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<Array<{ name: string; displayName: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  /** When true, do not auto-redirect logged-in users away from /login until submit finishes (avoids racing profile redirect). */
  const [blockAuthenticatedRedirect, setBlockAuthenticatedRedirect] = useState(false);

  useEffect(() => {
    document.body.classList.add('home-background');
    document.documentElement.style.setProperty('--home-bg-image', `url(${backgroundImage})`);

    return () => {
      document.body.classList.remove('home-background');
      document.documentElement.style.removeProperty('--home-bg-image');
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadProviders = async () => {
      try {
        const options = await authApi.providers();
        if (!cancelled) {
          setProviders(options);
        }
      } catch {
        if (!cancelled) {
          setProviders([]);
        }
      }
    };

    void loadProviders();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const challengeFromQuery = searchParams.get('challengeToken');
    const requiresSetupFromQuery = searchParams.get('requiresTwoFactorSetup');
    const messageFromQuery = searchParams.get('message') ?? searchParams.get('externalError');

    if (challengeFromQuery) {
      setChallengeToken(challengeFromQuery);
      setRequiresTwoFactorSetup(false);
    }

    if (requiresSetupFromQuery === 'true') {
      setRequiresTwoFactorSetup(true);
      setChallengeToken(null);
    }

    if (messageFromQuery) {
      if (challengeFromQuery || requiresSetupFromQuery === 'true') {
        setInfoMessage(messageFromQuery);
      } else {
        setError(messageFromQuery);
      }
    }
  }, [searchParams]);

  if (isAuthenticated && !blockAuthenticatedRedirect) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setInfoMessage(null);
    setSubmitting(true);
    setBlockAuthenticatedRedirect(true);

    try {
      const result = await login(loginInput, password, rememberMe);
      if (result.requiresTwoFactor && result.challengeToken) {
        setChallengeToken(result.challengeToken);
        setInfoMessage('Success, one more step: enter your authenticator code to finish signing in.');
        return;
      }

      if (result.requiresTwoFactorSetup) {
        navigate('/profile?requiresTwoFactorSetup=true#profile-security', { replace: true });
        return;
      }

      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmitTwoFactor = async (event: FormEvent) => {
    event.preventDefault();
    if (!challengeToken) return;
    setError(null);
    setSubmitting(true);

    try {
      await authApi.twoFactorChallenge(challengeToken, twoFactorCode);
      await refreshSession();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Two-factor verification failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="auth-page kateri-landing-section">
      <article className="auth-card">
        <h1>Sign in</h1>
        <p className="auth-lead">
          Welcome back to Kateri. Donor and Resident users can sign up directly. Staff and Admin accounts are
          created by an administrator.
        </p>
        {!challengeToken && (
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
              <div className="password-input-wrapper">
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
              />
              Keep me signed in
            </label>
            {requiresTwoFactorSetup && (
              <p className="auth-info-text" role="status">
                Admin and Staff accounts must enable two-factor authentication. After you sign in with your password,
                you will be taken to Profile to finish setup.
              </p>
            )}
            {error && <p className="error-text">{error}</p>}
            <button type="submit" disabled={submitting}>
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        )}
        {challengeToken && (
          <form onSubmit={onSubmitTwoFactor}>
            <h2>Success, one more step</h2>
            <p className="auth-lead">
              Enter your 6-digit authenticator code, or a one-time recovery code (format{' '}
              <strong>XXXXX-XXXXX</strong>). Use this same field for both.
            </p>
            {infoMessage && <p className="auth-info-text">{infoMessage}</p>}
            <label>
              Authenticator or recovery code
              <input
                required
                type="text"
                autoComplete="one-time-code"
                inputMode="text"
                value={twoFactorCode}
                onChange={(event) => setTwoFactorCode(event.target.value)}
                placeholder="123456 or XXXXX-XXXXX"
              />
            </label>
            {error && <p className="error-text">{error}</p>}
            <button type="submit" disabled={submitting}>
              {submitting ? 'Verifying...' : 'Verify and sign in'}
            </button>
            <button
              type="button"
              className="profile-security-button profile-security-button--secondary login-2fa-back"
              onClick={() => {
                setChallengeToken(null);
                setTwoFactorCode('');
                setInfoMessage(null);
              }}
            >
              Back to password login
            </button>
          </form>
        )}
        {providers.length > 0 && (
          <div className="external-login-group">
            <p>Or continue with</p>
            {providers.map((provider) => (
              <button
                key={provider.name}
                type="button"
                className={`auth-external-button${provider.name.toLowerCase() === 'google' ? ' auth-external-link--google' : ''}`}
                onClick={() => {
                  window.location.href = authApi.externalLoginUrl(provider.name, '/', 'login');
                }}
              >
                <span className="auth-external-button__content">
                  {provider.name.toLowerCase() === 'google' && (
                    <span className="auth-external-google-icon" aria-hidden="true">
                      <svg
                        viewBox="0 0 18 18"
                        width="18"
                        height="18"
                        xmlns="http://www.w3.org/2000/svg"
                        focusable="false"
                        preserveAspectRatio="xMidYMid meet"
                      >
                        <path
                          d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.25h2.9c1.7-1.56 2.7-3.86 2.7-6.61z"
                          fill="#4285F4"
                        />
                        <path
                          d="M9 18c2.43 0 4.47-.8 5.96-2.19l-2.9-2.25c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.58-5.05-3.72H.96v2.34A9 9 0 0 0 9 18z"
                          fill="#34A853"
                        />
                        <path
                          d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.15.29-1.7V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l2.99-2.34z"
                          fill="#FBBC05"
                        />
                        <path
                          d="M9 3.58c1.32 0 2.5.45 3.43 1.34l2.57-2.57C13.46.9 11.42 0 9 0A9 9 0 0 0 .96 4.96L3.95 7.3C4.66 5.16 6.65 3.58 9 3.58z"
                          fill="#EA4335"
                        />
                      </svg>
                    </span>
                  )}
                  <span>{provider.name.toLowerCase() === 'google' ? 'Sign in with Google' : `Sign in with ${provider.displayName}`}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
