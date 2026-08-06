import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useIvaoSignIn } from '../auth/useIvaoSignIn';
import { useTheme } from '../lib/theme';
import { Sun, Moon, Menu, X } from 'lucide-react';
import { IVAO_API_CREDIT, APP_NAME, APP_TAGLINE, APP_OPERATOR, APP_CREATOR, ivaoProfileUrl } from '../lib/branding';
import { CedarMark } from './logo';

function UtcClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  return (
    <div
      className="hidden items-center gap-2 rounded-lg border border-fuselage-200 bg-fuselage-50 px-2.5 py-1.5 sm:flex dark:border-fuselage-700 dark:bg-fuselage-900"
      title="Coordinated Universal Time (Zulu)"
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success-500" />
      <span className="font-mono text-sm font-bold tabular-nums leading-none text-fuselage-700 dark:text-fuselage-100">
        {hh}:{mm}
        <span className="text-fuselage-400">:{ss}</span>
      </span>
      <span className="font-mono text-[10px] font-bold leading-none tracking-widest text-atmos-600 dark:text-atmos-400">Z</span>
    </div>
  );
}

const NAV = [
  { to: '/', label: 'Events', end: true },
  { to: '/my-bookings', label: 'My Bookings', auth: true },
];

const ADMIN_NAV = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/events', label: 'Events' },
  { to: '/admin/custom-data', label: 'Custom data' },
  { to: '/admin/users', label: 'Users' },
];

export default function Layout() {
  const { user, signed, isAdmin, signOut, config } = useAuth();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const signIn = useIvaoSignIn();

  useEffect(() => setOpen(false), [location.pathname]);

  // Clear the session, then land on the public home page (leaving a staff-only
  // page would otherwise bounce through /login).
  const handleSignOut = () => {
    signOut();
    navigate('/', { replace: true });
  };

  const links = NAV.filter((n) => !n.auth || signed);

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b border-fuselage-150 bg-white/85 backdrop-blur-md dark:border-fuselage-800 dark:bg-fuselage-950/85">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link to="/" className="group flex items-center gap-2.5 font-head font-extrabold">
            <CedarMark className="h-7 w-7 shrink-0 text-[#007A3D] dark:text-[#1FCE7A]" />
            <span className="flex items-baseline gap-2 leading-none">
              <span className="text-lg tracking-wide text-atmos-700 dark:text-white">{APP_NAME}</span>
              <span className="hidden font-mono text-[10px] font-semibold uppercase tracking-widest text-atmos-600 dark:text-atmos-400 sm:inline">
                IVAO{config?.division ? ` ${config.division}` : ''}
              </span>
            </span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {links.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-semibold ${
                    isActive
                      ? 'bg-atmos-50 text-atmos-700 dark:bg-atmos-900/30 dark:text-atmos-300'
                      : 'text-fuselage-600 hover:bg-fuselage-100 dark:text-fuselage-300 dark:hover:bg-fuselage-800'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
            {isAdmin && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-semibold ${
                    isActive || location.pathname.startsWith('/admin')
                      ? 'bg-atmos-50 text-atmos-700 dark:bg-atmos-900/30 dark:text-atmos-300'
                      : 'text-fuselage-600 hover:bg-fuselage-100 dark:text-fuselage-300 dark:hover:bg-fuselage-800'
                  }`
                }
              >
                Admin
              </NavLink>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <UtcClock />
            <button className="btn-ghost p-2" onClick={toggle} aria-label="Toggle theme" title="Toggle theme">
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {signed ? (
              <div className="hidden items-center gap-2 sm:flex">
                <div className="text-right leading-tight">
                  <div className="text-sm font-semibold">
                    {user?.firstName} {user?.lastName}
                  </div>
                  <div className="text-xs text-fuselage-500">
                    {user?.vid}
                    {isAdmin && <span className="ml-1 text-atmos-600">· Staff</span>}
                  </div>
                </div>
                <button className="btn-secondary px-3 py-1.5" onClick={handleSignOut}>
                  Sign out
                </button>
              </div>
            ) : (
              <button className="btn-primary px-3 py-1.5" onClick={signIn}>
                Sign in
              </button>
            )}
            <button className="btn-ghost p-2 md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {open && (
          <div className="border-t border-fuselage-200 px-4 py-3 md:hidden dark:border-fuselage-800">
            <div className="flex flex-col gap-1">
              {links.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end} className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-fuselage-100 dark:hover:bg-fuselage-800">
                  {n.label}
                </NavLink>
              ))}
              {isAdmin && (
                <>
                  <div className="mt-2 px-3 text-xs font-bold uppercase text-fuselage-400">Admin</div>
                  {ADMIN_NAV.map((n) => (
                    <NavLink key={n.to} to={n.to} end={n.end} className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-fuselage-100 dark:hover:bg-fuselage-800">
                      {n.label}
                    </NavLink>
                  ))}
                </>
              )}
              <div className="mt-2 border-t border-fuselage-200 pt-2 dark:border-fuselage-800">
                {signed ? (
                  <button className="btn-secondary w-full" onClick={handleSignOut}>
                    Sign out ({user?.vid})
                  </button>
                ) : (
                  <button className="btn-primary w-full" onClick={signIn}>
                    Sign in
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      <footer className="mt-8 border-t border-fuselage-150 py-6 dark:border-fuselage-800">
        <div className="mx-auto max-w-6xl space-y-1 px-4 text-center text-xs text-fuselage-400">
          <div className="font-semibold text-fuselage-500 dark:text-fuselage-300">
            {APP_NAME} · {APP_TAGLINE}
          </div>
          <div>
            Built by{' '}
            <a
              href={ivaoProfileUrl(APP_CREATOR.vid)}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-atmos-600 hover:underline dark:text-atmos-400"
            >
              {APP_CREATOR.name}
            </a>{' '}
            - {APP_OPERATOR} · Powered by the{' '}
            <a
              href={IVAO_API_CREDIT.url}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-atmos-600 hover:underline dark:text-atmos-400"
            >
              {IVAO_API_CREDIT.label}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
