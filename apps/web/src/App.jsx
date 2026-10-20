import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { RequireAuth } from './lib/auth.jsx';
import Home from './pages/Home.jsx';
import Catalogue from './pages/Catalogue.jsx';
import EquipmentDetail from './pages/EquipmentDetail.jsx';
import Basket from './pages/Basket.jsx';
import Checkout from './pages/Checkout.jsx';
import BookingSubmitted from './pages/BookingSubmitted.jsx';
import Pay from './pages/Pay.jsx';
import Paid from './pages/Paid.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import VerifyEmail from './pages/VerifyEmail.jsx';
import ContentPage from './pages/ContentPage.jsx';
import Terms from './pages/Terms.jsx';
import Contact from './pages/Contact.jsx';
import AccountLayout from './pages/account/AccountLayout.jsx';
import Profile from './pages/account/Profile.jsx';
import MyBookings from './pages/account/MyBookings.jsx';
import MyBooking from './pages/account/MyBooking.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="equipment" element={<Catalogue />} />
        <Route path="equipment/:slug" element={<EquipmentDetail />} />
        <Route path="basket" element={<Basket />} />
        <Route
          path="checkout"
          element={
            <RequireAuth>
              <Checkout />
            </RequireAuth>
          }
        />
        <Route
          path="bookings/:reference/submitted"
          element={
            <RequireAuth>
              <BookingSubmitted />
            </RequireAuth>
          }
        />
        <Route
          path="bookings/:reference/pay"
          element={
            <RequireAuth>
              <Pay />
            </RequireAuth>
          }
        />
        <Route
          path="bookings/:reference/paid"
          element={
            <RequireAuth>
              <Paid />
            </RequireAuth>
          }
        />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="verify-email" element={<VerifyEmail />} />
        <Route path="terms" element={<Terms />} />
        <Route path="contact" element={<Contact />} />
        <Route path="pages/:slug" element={<ContentPage />} />
        <Route
          path="account"
          element={
            <RequireAuth>
              <AccountLayout />
            </RequireAuth>
          }
        >
          <Route index element={<MyBookings />} />
          <Route path="bookings" element={<MyBookings />} />
          <Route path="bookings/:reference" element={<MyBooking />} />
          <Route path="profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<ContentPage />} />
      </Route>
    </Routes>
  );
}
