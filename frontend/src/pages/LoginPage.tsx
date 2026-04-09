import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { authApi } from '../lib/api';
import backgroundImage from '../background.jpg?format=webp&quality=82&w=1920';
import { useLanguage } from '../i18n/LanguageContext';

export function LoginPage() {
  const { t } = useLanguage();
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
        setInfoMessage(t('login.twoFactor.infoMessage'));
        return;
      }

      if (result.requiresTwoFactorSetup) {
        navigate('/profile?requiresTwoFactorSetup=true#profile-security', { replace: true });
        return;
      }

      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.errors.loginFailed'));
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
      setError(err instanceof Error ? err.message : t('login.errors.twoFactorFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="auth-page kateri-landing-section">
      <article className="auth-card">
        <h1>{t('login.title')}</h1>
        <p className="auth-lead">{t('login.lead')}</p>
        {!challengeToken && (
          <form onSubmit={onSubmit}>
            <label>
              {t('login.form.usernameOrEmailLabel')}
              <input
                required
                type="text"
                value={loginInput}
                onChange={(event) => setLoginInput(event.target.value)}
              />
            </label>
            <label>
              {t('login.form.passwordLabel')}
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
                  aria-label={showPassword ? t('login.form.hidePasswordAria') : t('login.form.showPasswordAria')}
                  title={showPassword ? t('login.form.hidePasswordAria') : t('login.form.showPasswordAria')}
                >
                  {showPassword ? (
                    <svg
                      className="password-toggle__icon"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path
                        fill="currentColor"
                        d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.44-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="password-toggle__icon"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path
                        fill="currentColor"
                        d="M12 9a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3zm0 8a5 5 0 0 1-5-5 5 5 0 0 1 5-5 5 5 0 0 1 5 5 5 5 0 0 1-5 5zm0-13.5C7 3.5 2.73 6.61 1 12c1.73 5.39 6 8.5 11 8.5s9.27-3.11 11-8.5c-1.73-5.39-6-8.5-11-8.5z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
              />
              {t('login.form.rememberMe')}
            </label>
            {requiresTwoFactorSetup && (
              <p className="auth-info-text" role="status">
                {t('login.twoFactor.requiresSetupNotice')}
              </p>
            )}
            {error && <p className="error-text">{error}</p>}
            <button type="submit" disabled={submitting}>
              {submitting ? t('login.form.submitting') : t('login.form.submit')}
            </button>
          </form>
        )}
        {challengeToken && (
          <form onSubmit={onSubmitTwoFactor}>
            <h2>{t('login.twoFactor.successHeading')}</h2>
            <p className="auth-lead">{t('login.twoFactor.successLead')}</p>
            {infoMessage && <p className="auth-info-text">{infoMessage}</p>}
            <label>
              {t('login.twoFactor.codeLabel')}
              <input
                required
                type="text"
                autoComplete="one-time-code"
                inputMode="text"
                value={twoFactorCode}
                onChange={(event) => setTwoFactorCode(event.target.value)}
                placeholder={t('login.twoFactor.codePlaceholder')}
              />
            </label>
            {error && <p className="error-text">{error}</p>}
            <button type="submit" disabled={submitting}>
              {submitting ? t('login.twoFactor.verifying') : t('login.twoFactor.verifySubmit')}
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
              {t('login.twoFactor.backToPassword')}
            </button>
          </form>
        )}
        {providers.length > 0 && (
          <div className="external-login-group">
            <p>{t('login.external.heading')}</p>
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
                  <span>{provider.name.toLowerCase() === 'google' ? t('login.external.google') : t('login.external.generic', { provider: provider.displayName })}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
