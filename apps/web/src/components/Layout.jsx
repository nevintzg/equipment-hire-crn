import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSite } from '../lib/site.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useBasket } from '../lib/basket.jsx';
import { api } from '../lib/api.js';

function Announcements() {
  const { announcements } = useSite();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('eqhire.dismissed') ?? '[]');
    } catch {
      return [];
    }
  });
  const visible = (announcements ?? []).filter((a) => !dismissed.includes(a.id));
  if (!visible.length) return null;
  const dismiss = (id) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try {
      sessionStorage.setItem('eqhire.dismissed', JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  return visible.map((a) => (
    <div key={a.id} className={`announcement announcement-${(a.level ?? 'INFO').toLowerCase()}`}>
      <div className="container spread">
        <span>{a.message}</span>
        {a.isDismissible && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => dismiss(a.id)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  ));
}

function NavHref({ item, className, onClick }) {
  const external = /^https?:\/\//.test(item.href);
  if (external || item.opensInNewTab) {
    return (
      <a
        href={item.href}
        className={className}
        target={item.opensInNewTab ? '_blank' : undefined}
        rel="noreferrer"
      >
        {item.label}
      </a>
    );
  }
  return (
    <NavLink to={item.href} className={className} onClick={onClick}>
      {item.label}
    </NavLink>
  );
}

export default function Layout() {
  const site = useSite();
  const { user, signedIn } = useAuth();
  const basket = useBasket();
  const navigate = useNavigate();
  const location = useLocation();
  // The menu remembers which page it was opened on, so navigating closes it
  // without an effect.
  const [menuOpenOn, setMenuOpenOn] = useState(null);
  const menuOpen = menuOpenOn === location.pathname;
  const setMenuOpen = (open) => setMenuOpenOn(open ? location.pathname : null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const headerNav = site.navigation.header.length
    ? site.navigation.header.filter((n) => !n.parentId)
    : [
        { id: 'eq', label: 'Equipment', href: '/equipment' },
        { id: 'contact', label: 'Contact', href: '/contact' },
      ];

  const signOut = async () => {
    await api.logout();
    navigate('/');
  };

  const contactEmail = site.setting('contact.email');
  const contactPhone = site.setting('contact.phone');
  const address = site.setting('contact.address');
  const hours = site.setting('contact.openingHours');
  const footerText = site.setting('site.footerText');

  return (
    <div className="app">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Announcements />
      <header className="site-header">
        <div className="container header-inner">
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-text">
              <strong>{site.name}</strong>
              {site.setting('branding.tagline') && (
                <small>{site.setting('branding.tagline')}</small>
              )}
            </span>
          </Link>

          <button
            className="btn btn-ghost menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="site-nav"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? 'Close' : 'Menu'}
          </button>

          <nav id="site-nav" className={`site-nav ${menuOpen ? 'open' : ''}`} aria-label="Main">
            {headerNav.map((item) => (
              <NavHref key={item.id} item={item} className="nav-link" />
            ))}
            <div className="nav-actions">
              {signedIn ? (
                <>
                  <NavLink to="/account" className="nav-link">
                    {user.firstName}&rsquo;s account
                  </NavLink>
                  <button className="btn btn-ghost btn-sm" onClick={signOut}>
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <NavLink to="/login" className="nav-link">
                    Sign in
                  </NavLink>
                  <Link to="/register" className="btn btn-sm">
                    Create account
                  </Link>
                </>
              )}
              <Link to="/basket" className="btn btn-primary btn-sm basket-btn">
                Basket{basket.count > 0 && <span className="basket-count">{basket.count}</span>}
              </Link>
            </div>
          </nav>
        </div>
      </header>

      <main id="main" className="site-main">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container footer-grid">
          <div>
            <strong>{site.name}</strong>
            {footerText && (
              <p className="muted" style={{ marginTop: 8 }}>
                {footerText}
              </p>
            )}
          </div>
          <div>
            <h4>Contact</h4>
            <ul className="plain">
              {contactPhone && (
                <li>
                  <a href={`tel:${contactPhone.replace(/\s/g, '')}`}>{contactPhone}</a>
                </li>
              )}
              {contactEmail && (
                <li>
                  <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
                </li>
              )}
              {address && <li className="muted">{address}</li>}
              {hours && <li className="muted">{hours}</li>}
              <li>
                <Link to="/contact">Send us a message</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4>Information</h4>
            <ul className="plain">
              {site.navigation.footer.map((n) => (
                <li key={n.id}>
                  <NavHref item={n} />
                </li>
              ))}
              <li>
                <Link to="/terms">Terms of hire</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="container subtle footer-base">
          © {new Date().getFullYear()} {site.name}. All prices include GST.
        </div>
      </footer>
    </div>
  );
}
