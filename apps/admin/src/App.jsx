import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { OrgProvider } from './lib/org.jsx';
import Shell from './components/Shell.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import BookingsList from './pages/bookings/BookingsList.jsx';
import BookingDetail from './pages/bookings/BookingDetail.jsx';
import Calendar from './pages/bookings/Calendar.jsx';
import EquipmentList from './pages/equipment/EquipmentList.jsx';
import EquipmentEdit from './pages/equipment/EquipmentEdit.jsx';
import Categories from './pages/equipment/Categories.jsx';
import Customers from './pages/Customers.jsx';
import CustomerDetail from './pages/CustomerDetail.jsx';
import Enquiries from './pages/Enquiries.jsx';
import Finance from './pages/Finance.jsx';
import Settings from './pages/settings/Settings.jsx';

function Protected() {
  const { signedIn } = useAuth();
  const location = useLocation();
  if (!signedIn)
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  return (
    <OrgProvider>
      <Shell />
    </OrgProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected />}>
        <Route index element={<Dashboard />} />
        <Route path="bookings" element={<BookingsList />} />
        <Route path="bookings/:id" element={<BookingDetail />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="equipment" element={<EquipmentList />} />
        <Route path="equipment/new" element={<EquipmentEdit />} />
        <Route path="equipment/:id" element={<EquipmentEdit />} />
        <Route path="categories" element={<Categories />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="enquiries" element={<Enquiries />} />
        <Route path="finance" element={<Finance />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
