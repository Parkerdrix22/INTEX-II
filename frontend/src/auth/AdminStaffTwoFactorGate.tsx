import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';

/**
 * Shows a centered modal when Admin/Staff without 2FA attempt to leave /profile.
 * The actual redirect back to Profile is handled in App.tsx via <Navigate /> (no route flash).
 */
export function AdminStaffTwoFactorGate() {
  const { isAuthenticated, isLoading, roles, twoFactorEnabled } = useAuth();
  const location = useLocation();
  const prevPathnameRef = useRef<string | null>(null);
  const [blockedLeaveModalOpen, setBlockedLeaveModalOpen] = useState(false);

  const needsGate =
    isAuthenticated && !isLoading && (roles.includes('Admin') || roles.includes('Staff')) && !twoFactorEnabled;

  const closeModal = useCallback(() => {
    setBlockedLeaveModalOpen(false);
  }, []);

  useLayoutEffect(() => {
    if (isLoading || !isAuthenticated) {
      return;
    }

    if (!needsGate) {
      prevPathnameRef.current = location.pathname;
      setBlockedLeaveModalOpen(false);
      return;
    }

    if (location.pathname === '/profile') {
      prevPathnameRef.current = '/profile';
      return;
    }

    const cameFromProfile = prevPathnameRef.current === '/profile';
    if (cameFromProfile) {
      setBlockedLeaveModalOpen(true);
    }
    prevPathnameRef.current = '/profile';
  }, [isLoading, isAuthenticated, needsGate, location.pathname]);

  useEffect(() => {
    if (!blockedLeaveModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeModal();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [blockedLeaveModalOpen, closeModal]);

  if (!blockedLeaveModalOpen) {
    return null;
  }

  return (
    <div
      className="resident-modal-backdrop two-factor-required-backdrop"
      role="presentation"
      onClick={closeModal}
    >
      <article
        className="resident-modal-card two-factor-required-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="two-factor-required-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="two-factor-required-title">Two-factor authentication required</h2>
        <p className="two-factor-required-modal__body">
          You must set up two-factor authentication on your profile before using the rest of the site. Stay on this page
          and complete the steps in the Security section below.
        </p>
        <div className="resident-modal-actions">
          <button type="button" className="profile-security-button" onClick={closeModal}>
            OK
          </button>
        </div>
      </article>
    </div>
  );
}
