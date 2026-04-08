import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import heroImage from '../background.jpg?format=webp&quality=82&w=1920';
import { useAuth } from '../auth/useAuth';
import { AdminAdministratorsPanel } from '../components/AdminAdministratorsPanel';
import { ManageableUsersPanel } from '../components/ManageableUsersPanel';
import { authApi } from '../lib/api';

export function ProfilePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const setupHintFromUrl = useRef(false);
  const {
    username,
    firstName,
    lastName,
    email,
    roles,
    profile,
    updateProfile,
    effectiveDisplayName,
    twoFactorEnabled,
    recoveryCodesLeft,
    refreshSession,
  } = useAuth();
  const isAdmin = roles.includes('Admin');
  const isStaff = roles.includes('Staff');
  const requiresTwoFactor = isAdmin || isStaff;
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [phone, setPhone] = useState(profile.phone);
  const [notes, setNotes] = useState(profile.notes);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState(email ?? '');
  const [emailPassword, setEmailPassword] = useState('');
  const emailChanged = emailDraft.trim() !== (email ?? '');
  const [setupKey, setSetupKey] = useState<string | null>(null);
  const [setupUri, setSetupUri] = useState<string | null>(null);
  const [setupCode, setSetupCode] = useState('');
  const [setupQrCodeDataUrl, setSetupQrCodeDataUrl] = useState<string | null>(null);
  const [securityMessage, setSecurityMessage] = useState<string | null>(() => searchParams.get('message'));
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => {
      setDisplayName(profile.displayName);
      setPhone(profile.phone);
      setNotes(profile.notes);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [profile.displayName, profile.phone, profile.notes]);

  useEffect(() => {
    setEmailDraft(email ?? '');
  }, [email]);

  useEffect(() => {
    if (setupHintFromUrl.current) {
      return;
    }
    if (searchParams.get('requiresTwoFactorSetup') !== 'true') {
      return;
    }
    setupHintFromUrl.current = true;
    window.requestAnimationFrame(() => {
      document.getElementById('profile-security')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('requiresTwoFactorSetup');
        next.delete('message');
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    let isDisposed = false;

    const generateQrCode = async () => {
      if (!setupUri || twoFactorEnabled) {
        setSetupQrCodeDataUrl(null);
        return;
      }

      try {
        const dataUrl = await QRCode.toDataURL(setupUri, {
          width: 220,
          margin: 1,
          errorCorrectionLevel: 'M',
        });
        if (!isDisposed) {
          setSetupQrCodeDataUrl(dataUrl);
        }
      } catch {
        if (!isDisposed) {
          setSetupQrCodeDataUrl(null);
        }
      }
    };

    void generateQrCode();

    return () => {
      isDisposed = true;
    };
  }, [setupUri, twoFactorEnabled]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaveError(null);

    if (emailChanged) {
      try {
        await authApi.changeEmail(emailDraft.trim(), emailPassword);
        await refreshSession();
        setEmailPassword('');
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Failed to update email.');
        return;
      }
    }

    updateProfile({ displayName: displayName.trim(), phone: phone.trim(), notes: notes.trim() });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 3200);
  };

  const rolesLabel = roles.length > 0 ? roles.join(', ') : '—';

  const startTwoFactorSetup = async () => {
    setSecurityError(null);
    setSecurityMessage(null);
    try {
      const setup = await authApi.twoFactorSetupStart();
      setSetupKey(setup.sharedKey);
      setSetupUri(setup.otpauthUri);
      setRecoveryCodes([]);
    } catch (err) {
      setSecurityError(err instanceof Error ? err.message : 'Unable to start 2FA setup.');
    }
  };

  const verifyTwoFactorSetup = async (event: FormEvent) => {
    event.preventDefault();
    setSecurityError(null);
    setSecurityMessage(null);
    try {
      const result = await authApi.twoFactorSetupVerify(setupCode);
      setRecoveryCodes(result.recoveryCodes);
      setSetupCode('');
      setSecurityMessage('Two-factor authentication enabled.');
      await refreshSession();
    } catch (err) {
      setSecurityError(err instanceof Error ? err.message : 'Unable to verify authenticator code.');
    }
  };

  const disableTwoFactor = async () => {
    setSecurityError(null);
    setSecurityMessage(null);
    try {
      const result = await authApi.twoFactorDisable();
      setRecoveryCodes([]);
      setSetupKey(null);
      setSetupUri(null);
      setSetupQrCodeDataUrl(null);
      setSecurityMessage(result.message);
      await refreshSession();
    } catch (err) {
      setSecurityError(err instanceof Error ? err.message : 'Unable to disable two-factor authentication.');
    }
  };

  const regenerateRecoveryCodes = async () => {
    setSecurityError(null);
    setSecurityMessage(null);
    try {
      const result = await authApi.twoFactorRecoveryCodesRegenerate();
      setRecoveryCodes(result.recoveryCodes);
      setSecurityMessage(result.message);
      await refreshSession();
    } catch (err) {
      setSecurityError(err instanceof Error ? err.message : 'Unable to regenerate recovery codes.');
    }
  };

  return (
    <section className="profile-page kateri-landing-section">
      <header className="kateri-photo-hero">
        <div
          className="kateri-photo-hero__media"
          style={{ backgroundImage: `url(${heroImage})` }}
          aria-hidden={true}
        />
        <div className="kateri-photo-hero__scrim" aria-hidden={true} />
        <div className="kateri-photo-hero__inner">
          <h1 className="kateri-photo-hero__title">Your profile</h1>
          <p className="kateri-photo-hero__lead">
            {effectiveDisplayName
              ? `Signed in as ${effectiveDisplayName}. Update how Kateri should address you and your contact details below.`
              : 'Update how Kateri should address you and your contact details.'}
          </p>
          <div className="kateri-hero-actions">
            <a className="btn-kateri-gold" href="#profile-form">
              Edit profile
            </a>
            {isAdmin && (
              <a className="btn-kateri-ghost" href="#admin-accounts-manage">
                Manage accounts
              </a>
            )}
            <Link className="btn-kateri-ghost" to="/">
              Back to home
            </Link>
          </div>
        </div>
      </header>

      <article className="auth-card profile-form-card" id="profile-form">
        <h2>Profile information</h2>
        <p className="auth-lead">
          Changes are saved on this device and applied across the app for your account. Your first name and last name
          come from your login and are not editable here.
        </p>
        <form onSubmit={(e) => void onSubmit(e)}>
          <label>
            Display name
            <input
              type="text"
              autoComplete="nickname"
              placeholder={firstName ?? username ?? 'Your name'}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          <label>
            First name (read-only)
            <input
              type="text"
              value={firstName ?? ''}
              readOnly
              disabled
              className="profile-field--readonly"
            />
          </label>
          <label>
            Last name (read-only)
            <input
              type="text"
              value={lastName ?? ''}
              readOnly
              disabled
              className="profile-field--readonly"
            />
          </label>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              placeholder="your@email.com"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
            />
          </label>
          {emailChanged && (
            <label>
              Current password (required to change email)
              <input
                type="password"
                required
                autoComplete="current-password"
                placeholder="Your current password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
              />
            </label>
          )}
          <label>
            Phone
            <input
              type="tel"
              autoComplete="tel"
              placeholder="Optional"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
            <span className="field-helper-text">Optional.</span>
          </label>
          <label>
            Roles
            <input type="text" value={rolesLabel} readOnly disabled className="profile-field--readonly" />
          </label>
          <label>
            Notes for staff (optional)
            <textarea
              rows={4}
              placeholder="Anything you would like your coordinator to know — availability, preferences, etc."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          <button type="submit">Save profile</button>
          {saved && <p className="profile-save-hint">{emailChanged ? 'Profile and email saved.' : 'Profile saved.'}</p>}
          {saveError && <p className="error-text">{saveError}</p>}
        </form>
      </article>

      <article className="auth-card profile-security-card" id="profile-security">
        <h2>Two-factor authentication</h2>
        <p className="auth-lead">
          {requiresTwoFactor
            ? 'Your role requires 2FA. Complete setup to keep account access active.'
            : '2FA is optional for your role, but strongly recommended.'}
        </p>
        <p className="auth-lead">
          Status: <strong>{twoFactorEnabled ? 'Enabled' : 'Disabled'}</strong>
          {twoFactorEnabled && ` • Recovery codes left: ${recoveryCodesLeft}`}
        </p>
        {!twoFactorEnabled && (
          <button type="button" className="profile-security-button" onClick={() => void startTwoFactorSetup()}>
            Start 2FA setup
          </button>
        )}
        {setupUri && !twoFactorEnabled && (
          <div className="profile-2fa-setup">
            <p className="auth-lead">
              Scan this QR code in your authenticator app, then enter the current 6-digit code to verify:
            </p>
            {setupQrCodeDataUrl && (
              <img
                className="profile-2fa-qr"
                src={setupQrCodeDataUrl}
                alt="QR code for two-factor authenticator setup"
              />
            )}
            <code>{setupUri}</code>
            <p className="auth-lead">Manual key: {setupKey}</p>
            <form onSubmit={verifyTwoFactorSetup}>
              <label>
                Verification code
                <input
                  required
                  type="text"
                  value={setupCode}
                  onChange={(event) => setSetupCode(event.target.value)}
                  placeholder="123456"
                />
              </label>
              <button type="submit">Verify and enable 2FA</button>
            </form>
          </div>
        )}
        {twoFactorEnabled && (
          <div className="profile-2fa-actions">
            <button type="button" className="profile-security-button" onClick={() => void regenerateRecoveryCodes()}>
              Regenerate recovery codes
            </button>
            <button
              type="button"
              className="profile-security-button profile-security-button--secondary"
              onClick={() => void disableTwoFactor()}
            >
              Disable 2FA
            </button>
          </div>
        )}
        {recoveryCodes.length > 0 && (
          <div className="profile-2fa-codes">
            <p className="auth-lead">
              Save these recovery codes now. Each code can be used once.
            </p>
            <ul>
              {recoveryCodes.map((code) => (
                <li key={code}>
                  <code>{code}</code>
                </li>
              ))}
            </ul>
          </div>
        )}
        {securityError && <p className="error-text">{securityError}</p>}
        {securityMessage && <p className="success-text">{securityMessage}</p>}
      </article>

      {isAdmin && (
        <article className="auth-card profile-admin-create-card" id="admin-accounts-admins">
          <h2>Administrators</h2>
          <p className="auth-lead">
            Demote an administrator to staff or donor. You cannot demote yourself or remove the last administrator.
          </p>
          <AdminAdministratorsPanel />
        </article>
      )}
      {isAdmin && (
        <article className="auth-card profile-admin-create-card" id="admin-accounts-manage">
          <h2>Residents, donors & staff</h2>
          <p className="auth-lead">
            Search and manage accounts. Use <strong>Add account</strong> to create a user, <strong>Edit</strong> to update
            details, or <strong>Make admin</strong> on a donor to grant administrator access (they must enable 2FA on
            their profile).
          </p>
          <ManageableUsersPanel />
        </article>
      )}
    </section>
  );
}
