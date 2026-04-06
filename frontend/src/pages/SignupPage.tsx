import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { authApi } from '../lib/api';
import backgroundImage from '../background.jpg';

type SignupRole = 'Resident' | 'Donor' | 'Staff' | 'Admin';

export function SignupPage() {
  const { roles } = useAuth();
  const isAdmin = roles.includes('Admin');

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<SignupRole>('Resident');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add('home-background');
    document.documentElement.style.setProperty('--home-bg-image', `url(${backgroundImage})`);

    return () => {
      document.body.classList.remove('home-background');
      document.documentElement.style.removeProperty('--home-bg-image');
    };
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setSuccess(null);
    setError(null);

    try {
      if (role === 'Admin' || role === 'Staff') {
        await authApi.registerStaff(username, email, password, role);
      } else {
        await authApi.register(username, email, password, role);
      }

      setUsername('');
      setEmail('');
      setPassword('');
      setRole('Resident');
      setSuccess('Account created. You can now sign in.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="auth-page">
      <article className="auth-card">
        <h1>Create Account</h1>
        <p className="auth-lead">
          Sign up below. Already have an account? <Link to="/login">Sign in</Link>.
        </p>
        <form onSubmit={onSubmit}>
          <label>
            Username
            <input
              required
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            Email
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              required
              minLength={8}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label>
            Sign up as
            <select value={role} onChange={(event) => setRole(event.target.value as SignupRole)}>
              <option value="Resident">Resident</option>
              <option value="Donor">Donor</option>
              {isAdmin && <option value="Staff">Staff</option>}
              {isAdmin && <option value="Admin">Admin</option>}
            </select>
          </label>
          {isAdmin && (
            <p className="auth-lead">
              As an admin, you can create Resident, Donor, Staff, and Admin accounts.
            </p>
          )}
          {error && <p className="error-text">{error}</p>}
          {success && <p className="success-text">{success}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? 'Creating account...' : 'Create account'}
          </button>
        </form>
      </article>
    </section>
  );
}
