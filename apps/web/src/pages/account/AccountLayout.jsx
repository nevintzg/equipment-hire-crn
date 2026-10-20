import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../lib/auth.jsx';
import VerifyEmailNotice from '../../components/VerifyEmailNotice.jsx';

export default function AccountLayout() {
  const { user } = useAuth();
  return (
    <div className="container">
      <h1>Hi, {user.firstName}</h1>
      <div className="account">
        <nav className="account-nav">
          <NavLink to="/account/bookings" className={({ isActive }) => (isActive ? 'active' : '')}>
            My bookings
          </NavLink>
          <NavLink to="/account/profile">Profile and security</NavLink>
        </nav>
        <div className="stack">
          <VerifyEmailNotice />
          <Outlet />
        </div>
      </div>
    </div>
  );
}
