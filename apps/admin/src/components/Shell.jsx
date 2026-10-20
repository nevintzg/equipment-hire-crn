import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fullName } from '@equipment-hire/client';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useOrg } from '../lib/org.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', perm: 'booking.view', end: true },
  { to: '/bookings', label: 'Bookings', perm: 'booking.view', badge: 'pendingReview' },
  { to: '/calendar', label: 'Calendar', perm: 'booking.view' },
  { to: '/equipment', label: 'Equipment', perm: 'equipment.view' },
  { to: '/categories', label: 'Categories', perm: 'equipment.view' },
  { to: '/customers', label: 'Customers', perm: 'customer.view' },
  { to: '/enquiries', label: 'Enquiries', perm: 'enquiry.manage', badge: 'openEnquiries' },
  { to: '/finance', label: 'Bonds & finance', perm: 'payment.view' },
  { to: '/settings', label: 'Settings', perm: 'settings.view' },
];

export default function Shell() {
  const { user, can } = useAuth();
  const org = useOrg();
  const navigate = useNavigate();
  const location = useLocation();
  const [openOn, setOpenOn] = useState(null);
  const open = openOn === location.pathname;

  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/admin/dashboard'),
    enabled: can('booking.view'),
    refetchInterval: 60_000,
  });
  const counts = dashboard.data?.counts ?? {};

  return (
    <div className={`shell ${open ? 'nav-open' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-dot" aria-hidden="true" />
          <div>
            <strong>{org.name}</strong>
            <small>Admin</small>
          </div>
        </div>
        <nav aria-label="Admin">
          {NAV.filter((n) => can(n.perm)).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className="side-link"
              onClick={() => setOpenOn(null)}
            >
              <span>{n.label}</span>
              {n.badge && counts[n.badge] > 0 && (
                <span className="side-badge">{counts[n.badge]}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="subtle">{fullName(user)}</div>
          <button
            className="btn btn-sm btn-ghost"
            onClick={async () => {
              await api.logout();
              navigate('/login');
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button
            className="btn btn-sm nav-toggle"
            onClick={() => setOpenOn(open ? null : location.pathname)}
          >
            Menu
          </button>
          <strong className="topbar-title">{org.name}</strong>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
