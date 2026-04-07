import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { CreateAccountForm } from '../components/CreateAccountForm';
import { authApi } from '../lib/api';
import backgroundImage from '../background.jpg?format=webp&quality=82&w=1920';

export function SignupPage() {
  const { isAuthenticated } = useAuth();
  const [providers, setProviders] = useState<Array<{ name: string; displayName: string }>>([]);

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

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <section className="auth-page">
      <article className="auth-card">
        <h1>Create account</h1>
        <p className="auth-lead">
          New users can sign up as Donor or Resident. Staff and Admin accounts are created by administrators.
        </p>
        <CreateAccountForm isAdmin={false} submitButtonLabel="Create account" />
        {providers.length > 0 && (
          <div className="external-login-group">
            <p>Or continue with</p>
            {providers.map((provider) => (
              <button
                key={provider.name}
                type="button"
                className={`auth-external-button${provider.name.toLowerCase() === 'google' ? ' auth-external-link--google' : ''}`}
                onClick={() => {
                  window.location.href = authApi.externalLoginUrl(provider.name, '/', 'signup');
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
                  <span>
                    {provider.name.toLowerCase() === 'google'
                      ? 'Create account with Google'
                      : `Create account with ${provider.displayName}`}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
