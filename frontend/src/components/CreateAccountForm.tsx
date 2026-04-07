import { useState, type FormEvent } from 'react';
import { authApi } from '../lib/api';

export type CreateAccountRole = 'Resident' | 'Donor' | 'Staff' | 'Admin';

type CreateAccountFormProps = {
  isAdmin: boolean;
  submitButtonLabel?: string;
};

export function CreateAccountForm({ isAdmin, submitButtonLabel = 'Create account' }: CreateAccountFormProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<CreateAccountRole>('Resident');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setSuccess(null);
    setError(null);

    try {
      if (role === 'Admin' || role === 'Staff') {
        await authApi.registerStaff(firstName, lastName, email, password, role);
      } else {
        await authApi.register(firstName, lastName, email, password, role);
      }

      setFirstName('');
      setLastName('');
      setEmail('');
      setPassword('');
      setRole('Resident');
      setSuccess(
        isAdmin
          ? 'Account created. The new user can sign in with these credentials.'
          : 'Account created. You can now sign in.',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Signup failed.';
      if (message.includes('Password')) {
        setError('Password must be at least 14 characters and include one uppercase letter and one special character.');
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit}>
      <label>
        First name
        <input
          required
          type="text"
          autoComplete="off"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
        />
      </label>
      <label>
        Last name
        <input
          required
          type="text"
          autoComplete="off"
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
        />
      </label>
      <label>
        Email
        <input
          required
          type="email"
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label>
        Password
        <input
          required
          minLength={14}
          type="password"
          autoComplete="new-password"
          title="At least 14 characters, including one uppercase letter and one special character."
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <p className="auth-lead profile-create-account-hint">
        Passwords must be at least 14 characters and include one uppercase letter and one special character.
      </p>
      <label>
        Account role
        <select value={role} onChange={(event) => setRole(event.target.value as CreateAccountRole)}>
          <option value="Resident">Resident</option>
          <option value="Donor">Donor</option>
          {isAdmin && <option value="Staff">Staff</option>}
          {isAdmin && <option value="Admin">Admin</option>}
        </select>
      </label>
      {isAdmin && (
        <p className="auth-lead profile-create-account-hint">
          You can create Resident, Donor, Staff, and Admin accounts.
        </p>
      )}
      {error && <p className="error-text">{error}</p>}
      {success && <p className="success-text">{success}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Creating account…' : submitButtonLabel}
      </button>
    </form>
  );
}
