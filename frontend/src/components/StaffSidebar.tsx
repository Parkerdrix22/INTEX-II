import { NavLink } from 'react-router-dom';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `staff-sidebar__link${isActive ? ' staff-sidebar__link--active' : ''}`;

export function StaffSidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <aside
      id="staff-sidebar-panel"
      className={`staff-sidebar${isOpen ? ' staff-sidebar--open' : ''}`}
      aria-label="Staff navigation"
      aria-hidden={!isOpen}
    >
      <div className="staff-sidebar__header">
        <div className="staff-sidebar__heading">Staff</div>
        <button type="button" className="staff-sidebar__close" onClick={onClose} aria-label="Close staff menu">
          ×
        </button>
      </div>
      <nav className="staff-sidebar__nav">
        <div className="staff-sidebar__section">
          <NavLink to="/admin-dashboard" className={navLinkClass} onClick={onClose}>
            Admin Dashboard
          </NavLink>
          <NavLink to="/donors-contributions" className={navLinkClass} onClick={onClose}>
            Donors & Contributions
          </NavLink>
          <NavLink to="/caseload-inventory" className={navLinkClass} onClick={onClose}>
            Resident Services
          </NavLink>
          <NavLink to="/reports-analytics" className={navLinkClass} onClick={onClose}>
            Reports & Analytics
          </NavLink>
        </div>

        <div className="staff-sidebar__section staff-sidebar__section--secondary">
          <p className="staff-sidebar__section-label">Predictive Insights</p>
          <NavLink to="/resident-risk-triage" className={navLinkClass} onClick={onClose}>
            Risk Triage
          </NavLink>
          <NavLink to="/case-resolution" className={navLinkClass} onClick={onClose}>
            Case Resolution
          </NavLink>
          <NavLink to="/post-planner" className={navLinkClass} onClick={onClose}>
            Post Planner
          </NavLink>
          <NavLink to="/donor-churn" className={navLinkClass} onClick={onClose}>
            Donor Retention
          </NavLink>
          <NavLink to="/donor-impact" className={navLinkClass} onClick={onClose}>
            Donor Impact
          </NavLink>
          <NavLink to="/donor-archetypes" className={navLinkClass} onClick={onClose}>
            Donor Archetypes
          </NavLink>
        </div>
      </nav>
    </aside>
  );
}
