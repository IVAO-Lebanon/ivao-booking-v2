import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { faviconDataUri } from './lib/branding';
import { PageLoader } from './components/ui';
import Layout from './components/Layout';
import EventsPage from './pages/EventsPage';
import EventDetailPage from './pages/EventDetailPage';
import MyBookingsPage from './pages/MyBookingsPage';
import LoginPage from './pages/LoginPage';
import LoginCallbackPage from './pages/LoginCallbackPage';
import NotFoundPage from './pages/NotFoundPage';

// Code-split the admin section so it leaves the initial bundle (offsets the
// weight Atmosphere + Radix add to the shared vendor chunk).
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const DashboardPage = lazy(() => import('./pages/admin/DashboardPage'));
const EventsAdminPage = lazy(() => import('./pages/admin/EventsAdminPage'));
const AdminSlotsPage = lazy(() => import('./pages/admin/AdminSlotsPage'));
const AdminEmailPage = lazy(() => import('./pages/admin/AdminEmailPage'));
const EventTypesPage = lazy(() => import('./pages/admin/EventTypesPage'));
const SceneriesPage = lazy(() => import('./pages/admin/SceneriesPage'));
const SimulatorsPage = lazy(() => import('./pages/admin/SimulatorsPage'));
const UsersPage = lazy(() => import('./pages/admin/UsersPage'));

/** Sets the browser favicon to the BYBLOS cedar app icon. */
function DivisionFavicon() {
  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/svg+xml';
    link.href = faviconDataUri();
  }, []);
  return null;
}

export default function App() {
  return (
    <>
      <DivisionFavicon />
      <Suspense fallback={<PageLoader />}>
      <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/login/callback" element={<LoginCallbackPage />} />
      <Route element={<Layout />}>
        <Route index element={<EventsPage />} />
        <Route path="events/:id" element={<EventDetailPage />} />
        <Route path="my-bookings" element={<MyBookingsPage />} />
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="events" element={<EventsAdminPage />} />
          <Route path="events/:eventId/slots" element={<AdminSlotsPage />} />
          <Route path="events/:eventId/email" element={<AdminEmailPage />} />
          <Route path="event-types" element={<EventTypesPage />} />
          <Route path="sceneries" element={<SceneriesPage />} />
          <Route path="simulators" element={<SimulatorsPage />} />
          <Route path="users" element={<UsersPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      </Routes>
      </Suspense>
    </>
  );
}
