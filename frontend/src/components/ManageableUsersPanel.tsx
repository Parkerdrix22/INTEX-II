import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { formatPersonName, normalizeManageableUserRow } from '../lib/adminAccountRows';
import { userAccountsApi, type ManageableRole, type ManageableUserRow } from '../lib/api';
import { useAuth } from '../auth/useAuth';

const roles: ManageableRole[] = ['Resident', 'Donor', 'Staff'];

export function ManageableUsersPanel() {
  const { refreshSession } = useAuth();
  const [rows, setRows] = useState<ManageableUserRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState<ManageableUserRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<ManageableUserRow | null>(null);

  const [formFirst, setFormFirst] = useState('');
  const [formLast, setFormLast] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<ManageableRole>('Donor');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await userAccountsApi.manageableUsers();
      setRows(list.map((item) => normalizeManageableUserRow(item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load accounts.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openAdd = () => {
    setSuccess(null);
    setFormFirst('');
    setFormLast('');
    setFormEmail('');
    setFormPassword('');
    setFormRole('Donor');
    setFormError(null);
    setAddOpen(true);
  };

  const openEdit = (row: ManageableUserRow) => {
    setSuccess(null);
    setFormFirst(row.firstName);
    setFormLast(row.lastName);
    setFormEmail(row.email ?? '');
    setFormPassword('');
    setFormRole(row.role as ManageableRole);
    setFormError(null);
    setEditRow(row);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const displayName = formatPersonName(r).toLowerCase();
      const email = (r.email ?? '').toLowerCase();
      const login = (r.loginId ?? '').toLowerCase();
      const role = r.role.toLowerCase();
      return displayName.includes(q) || email.includes(q) || login.includes(q) || role.includes(q);
    });
  }, [rows, search]);

  const onSubmitAdd = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSubmitting(true);
    try {
      await userAccountsApi.createUser({
        firstName: formFirst.trim(),
        lastName: formLast.trim(),
        email: formEmail.trim(),
        password: formPassword,
        role: formRole,
      });
      setSuccess('Account created.');
      setAddOpen(false);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Create failed.';
      if (msg.includes('Password')) {
        setFormError('Password must be at least 14 characters and include one uppercase letter and one special character.');
      } else {
        setFormError(msg);
      }
    } finally {
      setFormSubmitting(false);
    }
  };

  const onSubmitEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editRow) return;
    setFormError(null);
    setFormSubmitting(true);
    try {
      await userAccountsApi.updateUser(editRow.id, {
        firstName: formFirst.trim(),
        lastName: formLast.trim(),
        email: formEmail.trim(),
        role: formRole,
      });
      setSuccess('Account updated.');
      setEditRow(null);
      await load();
      await refreshSession();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const runDelete = async () => {
    if (!deleteRow) return;
    setBusyId(deleteRow.id);
    setError(null);
    setSuccess(null);
    try {
      await userAccountsApi.deleteUser(deleteRow.id);
      setSuccess('User deleted.');
      setDeleteRow(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setBusyId(null);
    }
  };

  const promote = async (row: ManageableUserRow) => {
    const display = formatPersonName(row);
    const label = display !== '—' ? display : row.email || `user #${row.id}`;
    if (!window.confirm(`Promote ${label} to administrator? They must complete two-factor setup before using admin tools.`)) {
      return;
    }
    setBusyId(row.id);
    setError(null);
    setSuccess(null);
    try {
      const res = await userAccountsApi.promoteToAdmin(row.id);
      setSuccess(res.message);
      await load();
      await refreshSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Promotion failed.');
    } finally {
      setBusyId(null);
    }
  };

  const formFields = (includePassword: boolean) => (
    <>
      <label className="admin-account-modal-field">
        <span>First name</span>
        <input required value={formFirst} onChange={(e) => setFormFirst(e.target.value)} autoComplete="off" />
      </label>
      <label className="admin-account-modal-field">
        <span>Last name</span>
        <input required value={formLast} onChange={(e) => setFormLast(e.target.value)} autoComplete="off" />
      </label>
      <label className="admin-account-modal-field">
        <span>Email</span>
        <input required type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} autoComplete="off" />
      </label>
      {includePassword && (
        <label className="admin-account-modal-field">
          <span>Password</span>
          <input
            required
            type="password"
            minLength={14}
            value={formPassword}
            onChange={(e) => setFormPassword(e.target.value)}
            autoComplete="new-password"
            title="At least 14 characters, including one uppercase letter and one special character."
          />
        </label>
      )}
      <label className="admin-account-modal-field">
        <span>Account role</span>
        <select
          value={formRole}
          onChange={(e) => setFormRole(e.target.value as ManageableRole)}
          disabled={!includePassword && editRow?.role === 'Resident'}
        >
          {(includePassword ? roles : editRow?.role === 'Resident' ? (['Resident'] as const) : roles).map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      {includePassword && (
        <p className="auth-lead admin-account-modal-hint">
          Passwords must be at least 14 characters and include one uppercase letter and one special character.
        </p>
      )}
      {!includePassword && editRow?.role === 'Resident' && (
        <p className="auth-lead admin-account-modal-hint">Resident role cannot be changed here.</p>
      )}
      {!includePassword && editRow && editRow.role !== 'Resident' && (
        <p className="auth-lead admin-account-modal-hint">Donor ↔ Staff role changes are supported.</p>
      )}
      {formError && <p className="error-text">{formError}</p>}
    </>
  );

  return (
    <div className="admin-accounts-panel">
      <div className="admin-accounts-toolbar">
        <label className="donor-promote-search admin-accounts-toolbar__search">
          <span className="donor-promote-search__label">Search accounts</span>
          <input
            type="search"
            placeholder="Name, email, or role"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
        </label>
        <button type="button" className="profile-security-button" onClick={openAdd}>
          Add account
        </button>
      </div>

      {loading && <p className="auth-lead">Loading accounts…</p>}
      {error && <p className="error-text">{error}</p>}
      {success && <p className="success-text">{success}</p>}
      {!loading && filtered.length === 0 && (
        <p className="auth-lead">{rows.length === 0 ? 'No accounts in this list.' : 'No matches for your search.'}</p>
      )}
      {!loading && filtered.length > 0 && (
        <div className="admin-accounts-table-wrap">
          <table className="admin-accounts-table admin-accounts-table--manageable">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Links</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td className="admin-accounts-td-name">{formatPersonName(row)}</td>
                  <td className="admin-accounts-td-clip">{row.email ?? '—'}</td>
                  <td className="admin-accounts-td-role">
                    <span className="admin-accounts-role-pill">{row.role}</span>
                  </td>
                  <td className="admin-accounts-links">
                    {row.residentId != null && <span className="admin-accounts-link-chip">R:{row.residentId}</span>}
                    {row.supporterId != null && <span className="admin-accounts-link-chip">S:{row.supporterId}</span>}
                    {row.staffMemberId != null && <span className="admin-accounts-link-chip">St:{row.staffMemberId}</span>}
                    {row.residentId == null && row.supporterId == null && row.staffMemberId == null && (
                      <span className="admin-accounts-links-empty">—</span>
                    )}
                  </td>
                  <td className="admin-accounts-td-actions">
                    <div className="admin-accounts-actions">
                      <button
                        type="button"
                        className="profile-security-button profile-security-button--secondary admin-accounts-actions__btn"
                        disabled={busyId !== null}
                        onClick={() => openEdit(row)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="profile-security-button admin-accounts-actions__btn"
                        disabled={busyId !== null}
                        onClick={() => void promote(row)}
                      >
                        {busyId === row.id ? '…' : 'Make admin'}
                      </button>
                      <button
                        type="button"
                        className="admin-accounts-btn-danger admin-accounts-actions__btn"
                        disabled={busyId !== null}
                        onClick={() => setDeleteRow(row)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && (
        <div
          className="resident-modal-backdrop two-factor-required-backdrop admin-account-modal-backdrop"
          role="presentation"
          onClick={() => !formSubmitting && setAddOpen(false)}
        >
          <article
            className="resident-modal-card two-factor-required-modal admin-account-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-account-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="add-account-title">Add account</h2>
            <form className="admin-account-modal-form" onSubmit={(e) => void onSubmitAdd(e)}>
              {formFields(true)}
              <div className="resident-modal-actions admin-account-modal-actions">
                <button
                  type="button"
                  className="profile-security-button profile-security-button--secondary"
                  disabled={formSubmitting}
                  onClick={() => setAddOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="profile-security-button" disabled={formSubmitting}>
                  {formSubmitting ? 'Creating…' : 'Create account'}
                </button>
              </div>
            </form>
          </article>
        </div>
      )}

      {editRow && (
        <div
          className="resident-modal-backdrop two-factor-required-backdrop admin-account-modal-backdrop"
          role="presentation"
          onClick={() => !formSubmitting && setEditRow(null)}
        >
          <article
            className="resident-modal-card two-factor-required-modal admin-account-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-account-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="edit-account-title">Edit account</h2>
            <form className="admin-account-modal-form" onSubmit={(e) => void onSubmitEdit(e)}>
              {formFields(false)}
              <div className="resident-modal-actions admin-account-modal-actions">
                <button
                  type="button"
                  className="profile-security-button profile-security-button--secondary"
                  disabled={formSubmitting}
                  onClick={() => setEditRow(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="profile-security-button" disabled={formSubmitting}>
                  {formSubmitting ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </article>
        </div>
      )}

      {deleteRow && (
        <div
          className="resident-modal-backdrop two-factor-required-backdrop admin-account-modal-backdrop"
          role="presentation"
          onClick={() => busyId === null && setDeleteRow(null)}
        >
          <article
            className="resident-modal-card two-factor-required-modal admin-account-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-account-title">Delete user</h2>
            <p className="two-factor-required-modal__body">
              Permanently delete <strong>{formatPersonName(deleteRow)}</strong>? This cannot be undone.
            </p>
            <div className="resident-modal-actions admin-account-modal-actions">
              <button
                type="button"
                className="profile-security-button profile-security-button--secondary"
                disabled={busyId !== null}
                onClick={() => setDeleteRow(null)}
              >
                Cancel
              </button>
              <button type="button" className="btn-danger" disabled={busyId !== null} onClick={() => void runDelete()}>
                {busyId !== null ? 'Deleting…' : 'Delete user'}
              </button>
            </div>
          </article>
        </div>
      )}
    </div>
  );
}
