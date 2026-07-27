import { NavLink, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { PageLoader } from '../../components/ui';

const TABS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/events', label: 'Events' },
  { to: '/admin/custom-data', label: 'Custom data' },
  { to: '/admin/users', label: 'Users' },
];

export default function AdminLayout() {
  const { isAdmin, loading, signed } = useAuth();

  if (loading) return <PageLoader />;
  if (!signed) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div>
      <h1 className="mb-4 text-2xl font-extrabold tracking-tight">Staff administration</h1>
      <div className="mb-6 flex gap-1 overflow-x-auto scroll-thin border-b border-fuselage-200 pb-px dark:border-fuselage-800">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `whitespace-nowrap rounded-t-lg px-4 py-2 text-sm font-semibold ${
                isActive
                  ? 'border-b-2 border-atmos-600 text-atmos-700 dark:text-atmos-400'
                  : 'text-fuselage-500 hover:text-fuselage-800 dark:hover:text-fuselage-200'
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
