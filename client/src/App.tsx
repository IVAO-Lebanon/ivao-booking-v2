import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { divisionLogoUrl } from './lib/branding';
import Layout from './components/Layout';
import EventsPage from './pages/EventsPage';
import EventDetailPage from './pages/EventDetailPage';
import MyBookingsPage from './pages/MyBookingsPage';
import LoginPage from './pages/LoginPage';
import LoginCallbackPage from './pages/LoginCallbackPage';
import NotFoundPage from './pages/NotFoundPage';
import SpikePage from './pages/SpikePage';
import AdminLayout from './pages/admin/AdminLayout';
import DashboardPage from './pages/admin/DashboardPage';
import EventsAdminPage from './pages/admin/EventsAdminPage';
import AdminSlotsPage from './pages/admin/AdminSlotsPage';
import EventTypesPage from './pages/admin/EventTypesPage';
import SceneriesPage from './pages/admin/SceneriesPage';
import SimulatorsPage from './pages/admin/SimulatorsPage';
import AircraftPage from './pages/admin/AircraftPage';
import UsersPage from './pages/admin/UsersPage';

/** Sets the browser favicon to the configured division's IVAO logo. */
function DivisionFavicon() {
  const { config } = useAuth();
  useEffect(() => {
    const url = divisionLogoUrl(config?.division);
    if (!url) return;
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/svg+xml';
    link.href = url;
  }, [config?.division]);
  return null;
}

export default function App() {
  return (
    <>
      <DivisionFavicon />
      <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/login/callback" element={<LoginCallbackPage />} />
      <Route path="/spike" element={<SpikePage />} />
      <Route element={<Layout />}>
        <Route index element={<EventsPage />} />
        <Route path="events/:id" element={<EventDetailPage />} />
        <Route path="my-bookings" element={<MyBookingsPage />} />
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="events" element={<EventsAdminPage />} />
          <Route path="events/:eventId/slots" element={<AdminSlotsPage />} />
          <Route path="event-types" element={<EventTypesPage />} />
          <Route path="sceneries" element={<SceneriesPage />} />
          <Route path="simulators" element={<SimulatorsPage />} />
          <Route path="aircraft" element={<AircraftPage />} />
          <Route path="users" element={<UsersPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      </Routes>
    </>
  );
}
