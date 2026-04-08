import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatPersonName, normalizeAdminAccountRow } from '../lib/adminAccountRows';
import { userAccountsApi, type AdminAccountRow } from '../lib/api';
import { useAuth } from '../auth/useAuth';

export function AdminAdministratorsPanel() {
  const { refreshSession } = useAuth();
  const [rows, setRows] = useState<AdminAccountRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [demoteTarget, setDemoteTarget] = useState<AdminAccountRow | null>(null);
  const [demoteRole, setDemoteRole] = useState<'Staff' | 'Donor'>('Staff');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await userAccountsApi.admins();
      setRows(list.map((item) => normalizeAdminAccountRow(item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load administrators.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const displayName = formatPersonName(r).toLowerCase();
      const email = (r.email ?? '').toLowerCase();
      const login = (r.loginId ?? '').toLowerCase();
      return displayName.includes(q) || email.includes(q) || login.includes(q);
    });
  }, [rows, search]);

  const runDemote = async () => {
    if (!demoteTarget) return;
    setBusyId(demoteTarget.id);
    setError(null);
    setSuccess(null);
    try {
      const res = await userAccountsApi.demoteFromAdmin(demoteTarget.id, demoteRole);
      setSuccess(res.message);
      setDemoteTarget(null);
      await load();
      await refreshSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demotion failed.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="admin-accounts-panel">
      <label className="donor-promote-search">
        <span className="donor-promote-search__label">Search administrators</span>
        <input
          type="search"
          placeholder="Name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
        />
      </label>
      {loading && <p className="auth-lead">Loading administrators…</p>}
      {error && <p className="error-text">{error}</p>}
      {success && <p className="success-text">{success}</p>}
      {!loading && filtered.length === 0 && (
        <p className="auth-lead">{rows.length === 0 ? 'No administrators found.' : 'No matches for your search.'}</p>
      )}
      {!loading && filtered.length > 0 && (
        <div className="admin-accounts-table-wrap">
          <table className="admin-accounts-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Sign-in id</th>
                <th scope="col">Staff record</th>
                <th scope="col">Demote</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td className="admin-accounts-td-name">{formatPersonName(row)}</td>
                  <td className="admin-accounts-td-clip">{row.email ?? '—'}</td>
                  <td className="admin-accounts-td-clip">
                    <code className="donor-promote-mono">{row.loginId ?? row.email ?? '—'}</code>
                  </td>
                  <td className="admin-accounts-td-num">{row.staffMemberId != null ? row.staffMemberId : '—'}</td>
                  <td className="admin-accounts-td-actions">
                    <button
                      type="button"
                      className="profile-security-button profile-security-button--secondary"
                      disabled={busyId !== null}
                      onClick={() => {
                        setDemoteRole('Staff');
                        setDemoteTarget(row);
                      }}
                    >
                      Demote…
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {demoteTarget && (
        <div
          className="resident-modal-backdrop two-factor-required-backdrop admin-account-modal-backdrop"
          role="presentation"
          onClick={() => (busyId === null ? setDemoteTarget(null) : undefined)}
        >
          <article
            className="resident-modal-card two-factor-required-modal admin-account-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="demote-admin-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="demote-admin-title">Demote administrator</h2>
            <p className="two-factor-required-modal__body">
              Demote <strong>{formatPersonName(demoteTarget)}</strong> to:
            </p>
            <label className="admin-account-modal-field">
              <span>New role</span>
              <select value={demoteRole} onChange={(e) => setDemoteRole(e.target.value as 'Staff' | 'Donor')}>
                <option value="Staff">Staff</option>
                <option value="Donor">Donor</option>
              </select>
            </label>
            <p className="auth-lead admin-account-modal-hint">
              They should refresh the site or sign out and back in so permissions update everywhere.
            </p>
            <div className="resident-modal-actions admin-account-modal-actions">
              <button
                type="button"
                className="profile-security-button profile-security-button--secondary"
                disabled={busyId !== null}
                onClick={() => setDemoteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="profile-security-button"
                disabled={busyId !== null}
                onClick={() => void runDemote()}
              >
                {busyId !== null ? 'Updating…' : 'Confirm demotion'}
              </button>
            </div>
          </article>
        </div>
      )}
    </div>
  );
}
