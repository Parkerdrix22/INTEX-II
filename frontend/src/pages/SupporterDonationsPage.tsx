import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  donorsContributionsApi,
  type DonorsContributionsDashboard,
  type SupporterDonation,
} from '../lib/api';
import heroImage from '../background.jpg?format=webp&quality=82&w=1920';

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export function SupporterDonationsPage() {
  const { supporterId } = useParams();
  const numericSupporterId = Number(supporterId);
  const [dashboard, setDashboard] = useState<DonorsContributionsDashboard | null>(null);
  const [donations, setDonations] = useState<SupporterDonation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SupporterDonation | null>(null);
  const [editForm, setEditForm] = useState({
    donationType: 'Monetary',
    donationDate: '',
    estimatedValue: '0',
    campaignName: '',
  });
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    donationType: 'Monetary',
    donationDate: new Date().toISOString().slice(0, 10),
    estimatedValue: '',
    campaignName: '',
  });

  const load = async () => {
    if (!Number.isFinite(numericSupporterId) || numericSupporterId <= 0) {
      setError('Invalid supporter id.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const dashboardData = await donorsContributionsApi.dashboard();
      let donationData: SupporterDonation[] = [];
      try {
        donationData = await donorsContributionsApi.supporterDonations(numericSupporterId);
      } catch {
        // Fallback for servers not yet running the dedicated supporter endpoint.
        donationData = (dashboardData.contributions ?? [])
          .filter((row) => row.supporterId === numericSupporterId)
          .map((row) => ({
            id: row.id,
            supporterId: row.supporterId,
            donationType: row.donationType,
            donationDate: row.donationDate,
            estimatedValue: row.estimatedValue,
            campaignName: row.campaignName,
          }));
      }
      setDashboard(dashboardData);
      setDonations(donationData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load supporter donations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [numericSupporterId]);

  const supporter = useMemo(
    () => dashboard?.supporters.find((item) => item.id === numericSupporterId) ?? null,
    [dashboard, numericSupporterId],
  );

  const startEdit = (row: SupporterDonation) => {
    setEditing(row);
    setEditForm({
      donationType: row.donationType || 'Monetary',
      donationDate: row.donationDate ? row.donationDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
      estimatedValue: String(row.estimatedValue ?? 0),
      campaignName: row.campaignName ?? '',
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    const amount = Number(editForm.estimatedValue);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Donation amount must be greater than zero.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await donorsContributionsApi.updateDonation(editing.id, {
        donationType: editForm.donationType,
        donationDate: editForm.donationDate,
        estimatedValue: amount,
        campaignName: editForm.campaignName.trim() || undefined,
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update donation.');
    } finally {
      setSaving(false);
    }
  };

  const deleteDonation = async (donationId: number) => {
    if (!window.confirm('Delete this donation? This cannot be undone.')) return;
    setError(null);
    try {
      await donorsContributionsApi.deleteDonation(donationId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete donation.');
    }
  };

  const saveNewContribution = async () => {
    const amount = Number(addForm.estimatedValue);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Donation amount must be greater than zero.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await donorsContributionsApi.createSupporterDonation(numericSupporterId, {
        donationType: addForm.donationType,
        estimatedValue: amount,
        donationDate: addForm.donationDate,
        campaignName: addForm.campaignName.trim() || undefined,
      });
      setShowAddModal(false);
      setAddForm({
        donationType: 'Monetary',
        donationDate: new Date().toISOString().slice(0, 10),
        estimatedValue: '',
        campaignName: '',
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create donation.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="donors-contributions-page kateri-landing-section">
      <header className="kateri-photo-hero">
        <div
          className="kateri-photo-hero__media"
          style={{ backgroundImage: `url(${heroImage})` }}
          aria-hidden={true}
        />
        <div className="kateri-photo-hero__scrim" aria-hidden={true} />
        <div className="kateri-photo-hero__inner">
          <h1 className="kateri-photo-hero__title">{supporter?.displayName ?? `Supporter #${supporterId}`}</h1>
          <p className="kateri-photo-hero__lead">Individual donations for this supporter.</p>
          <div className="kateri-hero-actions">
            <Link className="btn-secondary" to="/donors-contributions">
              Back to Donors &amp; Contributions
            </Link>
          </div>
        </div>
      </header>

      {loading && <p className="donor-inline-message">Loading supporter donations...</p>}
      {error && <p className="error-text donor-inline-message">{error}</p>}

      {!loading && !error && (
        <article className="auth-card donor-workspace-card">
          <div className="caseload-page__header">
            <h2>Donation history</h2>
            <button type="button" className="btn-primary" onClick={() => setShowAddModal(true)}>
              + Add contribution
            </button>
          </div>
          <div className="donor-table-wrap">
            <table className="donor-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Campaign</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {donations.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.donationDate)}</td>
                    <td>{row.donationType}</td>
                    <td>{formatUsd(row.estimatedValue ?? 0)}</td>
                    <td>{row.campaignName ?? '—'}</td>
                    <td>
                      <button type="button" className="btn-secondary" onClick={() => startEdit(row)}>
                        Edit
                      </button>{' '}
                      <button type="button" className="btn-danger" onClick={() => void deleteDonation(row.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {donations.length === 0 && (
            <p className="donor-inline-message">No donations found for this supporter yet.</p>
          )}
        </article>
      )}

      {showAddModal && (
        <div className="resident-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="add-donation-title">
          <div className="resident-modal-card">
            <h2 id="add-donation-title">Add contribution</h2>
            <form className="donor-entry-form" onSubmit={(event) => event.preventDefault()}>
              <label>
                Donation type
                <select
                  value={addForm.donationType}
                  onChange={(event) => setAddForm((prev) => ({ ...prev, donationType: event.target.value }))}
                >
                  <option value="Monetary">Monetary</option>
                  <option value="In-kind">In-kind</option>
                  <option value="Time">Time</option>
                  <option value="Skills">Skills</option>
                </select>
              </label>
              <label>
                Donation date
                <input
                  type="date"
                  value={addForm.donationDate}
                  onChange={(event) => setAddForm((prev) => ({ ...prev, donationDate: event.target.value }))}
                />
              </label>
              <label>
                Amount
                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={addForm.estimatedValue}
                  onChange={(event) => setAddForm((prev) => ({ ...prev, estimatedValue: event.target.value }))}
                />
              </label>
              <label>
                Campaign
                <input
                  value={addForm.campaignName}
                  onChange={(event) => setAddForm((prev) => ({ ...prev, campaignName: event.target.value }))}
                />
              </label>
            </form>
            <div className="resident-modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowAddModal(false)} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={() => void saveNewContribution()} disabled={saving}>
                {saving ? 'Saving...' : 'Save contribution'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="resident-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="edit-donation-title">
          <div className="resident-modal-card">
            <h2 id="edit-donation-title">Edit donation</h2>
            <form className="donor-entry-form" onSubmit={(event) => event.preventDefault()}>
              <label>
                Donation type
                <select
                  value={editForm.donationType}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, donationType: event.target.value }))}
                >
                  <option value="Monetary">Monetary</option>
                  <option value="In-kind">In-kind</option>
                  <option value="Time">Time</option>
                  <option value="Skills">Skills</option>
                </select>
              </label>
              <label>
                Donation date
                <input
                  type="date"
                  value={editForm.donationDate}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, donationDate: event.target.value }))}
                />
              </label>
              <label>
                Amount
                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={editForm.estimatedValue}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, estimatedValue: event.target.value }))}
                />
              </label>
              <label>
                Campaign
                <input
                  value={editForm.campaignName}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, campaignName: event.target.value }))}
                />
              </label>
            </form>
            <div className="resident-modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setEditing(null)} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={() => void saveEdit()} disabled={saving}>
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
