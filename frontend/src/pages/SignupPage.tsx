import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { CreateAccountForm } from '../components/CreateAccountForm';

export function SignupPage() {
  const { isAuthenticated } = useAuth();

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
      </article>
    </section>
  );
}
