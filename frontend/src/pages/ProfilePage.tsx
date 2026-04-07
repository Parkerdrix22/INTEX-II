import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import heroImage from '../background.jpg?format=webp&quality=82&w=1920';
import { useAuth } from '../auth/useAuth';
import { CreateAccountForm } from '../components/CreateAccountForm';

export function ProfilePage() {
  const { username, email, roles, profile, updateProfile, effectiveDisplayName } = useAuth();
  const isAdmin = roles.includes('Admin');
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [phone, setPhone] = useState(profile.phone);
  const [notes, setNotes] = useState(profile.notes);
  const [saved, setSaved] = useState(false);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    updateProfile({ displayName: displayName.trim(), phone: phone.trim(), notes: notes.trim() });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 3200);
  };

  const rolesLabel = roles.length > 0 ? roles.join(', ') : '—';

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
              <a className="btn-kateri-ghost" href="#admin-create-account">
                Create accounts
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
          Changes are saved on this device and applied across the app for your account. Account email and
          username come from your login and are not editable here yet.
        </p>
        <form onSubmit={onSubmit}>
          <label>
            Display name
            <input
              type="text"
              autoComplete="nickname"
              placeholder={username ?? 'Your name'}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          <label>
            Email (read-only)
            <input type="email" value={email ?? ''} readOnly disabled className="profile-field--readonly" />
          </label>
          <label>
            Username (read-only)
            <input
              type="text"
              value={username ?? ''}
              readOnly
              disabled
              className="profile-field--readonly"
            />
          </label>
          <label>
            Phone
            <input
              type="tel"
              autoComplete="tel"
              placeholder="Optional"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
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
          {saved && <p className="profile-save-hint">Profile saved.</p>}
        </form>
      </article>

      {isAdmin && (
        <article className="auth-card profile-admin-create-card" id="admin-create-account">
          <h2>Create accounts</h2>
          <p className="auth-lead">
            Register new residents, donors, staff, or other admins. They can sign in as soon as the account
            is created.
          </p>
          <CreateAccountForm isAdmin={true} submitButtonLabel="Create account" />
        </article>
      )}
    </section>
  );
}
