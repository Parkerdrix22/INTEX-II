import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { authApi } from '../lib/api';

export type CreateAccountRole = 'Resident' | 'Donor' | 'Staff';

type CreateAccountFormProps = {
  isAdmin: boolean;
  submitButtonLabel?: string;
};

export function CreateAccountForm({ isAdmin, submitButtonLabel = 'Create account' }: CreateAccountFormProps) {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [loginUsername, setLoginUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }

      if (role === 'Staff') {
        await authApi.registerStaff(firstName, lastName, email, password, loginUsername.trim() || undefined);
      } else {
        await authApi.register(firstName, lastName, email, password, role);
      }

      if (!isAdmin) {
        await login(email, password, true);
        navigate('/', { replace: true });
        return;
      }

      setFirstName('');
      setLastName('');
      setEmail('');
      setLoginUsername('');
      setPassword('');
      setConfirmPassword('');
      setRole('Resident');
      setSuccess(
        'Account created. They can sign in with this email (or the custom login id if you set one) and the password you chose. If they use Google with the same email, they can link that after signing in once.',
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
      {isAdmin && (
        <label>
          Login username <span className="profile-create-account-hint-inline">(optional)</span>
          <input
            type="text"
            autoComplete="off"
            placeholder="Leave blank to use email as login id"
            value={loginUsername}
            onChange={(event) => setLoginUsername(event.target.value)}
          />
        </label>
      )}
      {isAdmin && (
        <p className="auth-lead profile-create-account-hint">
          If you leave username blank, they sign in with the email address above. Only letters, numbers, and . _ @ + - are
          allowed in a custom username.
        </p>
      )}
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
      <label>
        Confirm password
        <input
          required
          minLength={14}
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
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
        </select>
      </label>
      {isAdmin && (
        <p className="auth-lead profile-create-account-hint">
          Create residents, donors, or staff. New administrators are promoted from the Residents, donors & staff table (see below).
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
