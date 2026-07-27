import { NavLink, Outlet } from 'react-router-dom';

const SUBTABS = [
  { to: '/admin/custom-data/airports', label: 'Airports' },
  { to: '/admin/custom-data/aircraft', label: 'Aircraft' },
  { to: '/admin/custom-data/sceneries', label: 'Sceneries' },
  { to: '/admin/custom-data/simulators', label: 'Simulators' },
  { to: '/admin/custom-data/event-types', label: 'Event types' },
];

export default function CustomDataLayout() {
  return (
    <div>
      <p className="mb-4 text-sm text-fuselage-500">
        Reference data managed by your division. Custom airports and aircraft supplement the IVAO catalogue and, when
        the ICAO matches, override it in the typeaheads and flight map.
      </p>
      <div className="mb-6 flex flex-wrap gap-1.5">
        {SUBTABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `rounded-full px-3.5 py-1.5 text-sm font-semibold ${
                isActive
                  ? 'bg-atmos-600 text-white'
                  : 'bg-fuselage-100 text-fuselage-600 hover:bg-fuselage-200 dark:bg-fuselage-800 dark:text-fuselage-300 dark:hover:bg-fuselage-700'
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
