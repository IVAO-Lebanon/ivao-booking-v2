import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { PageLoader } from '../../components/ui';
import { EmailApprovals } from '../../components/EmailApprovals';

function StatTile({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: number;
  accent: string;
  hint?: string;
}) {
  return (
    <div className="card relative overflow-hidden p-5">
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
      <div className="eyebrow">{label}</div>
      <div className="mt-2 font-head text-3xl font-extrabold tabular-nums">{value.toLocaleString()}</div>
      {hint && <div className="mt-1 text-xs text-fuselage-400">{hint}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ['stats'], queryFn: () => api.stats() });
  const { data: approvals } = useQuery({ queryKey: ['email-approvals'], queryFn: () => api.emailApprovals() });
  if (isLoading || !data) return <PageLoader />;

  const load = data.slots > 0 ? Math.round((data.booked / data.slots) * 100) : 0;

  return (
    <div>
      <div className="mb-6">
        <div className="eyebrow">Operations</div>
        <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">Dashboard</h1>
      </div>

      {approvals && approvals.length > 0 && (
        <div className="mb-6">
          <EmailApprovals items={approvals} showEventLink />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile label="Total events" value={data.events} accent="#1342E4" />
        <StatTile label="Scheduled" value={data.upcoming} accent="#2EC662" hint="Live on the board" />
        <StatTile label="Registered pilots" value={data.users} accent="#3C55AC" />
        <StatTile label="Suspended" value={data.suspended} accent="#E93434" hint="Blocked from booking" />
        <StatTile label="Total slots" value={data.slots} accent="#606282" />

        {/* Booked-slot load meter */}
        <div className="card relative overflow-hidden p-5">
          <span className="absolute inset-x-0 top-0 h-1 bg-atmos-500" />
          <div className="flex items-baseline justify-between">
            <div className="eyebrow">Booked slots</div>
            <div className="font-mono text-xs font-semibold text-fuselage-400">{load}% load</div>
          </div>
          <div className="mt-2 font-head text-3xl font-extrabold tabular-nums">
            {data.booked.toLocaleString()}
            <span className="ml-1 text-base font-semibold text-fuselage-400">/ {data.slots.toLocaleString()}</span>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-fuselage-150 dark:bg-fuselage-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-atmos-500 to-atmos-700 transition-all"
              style={{ width: `${load}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/admin/events" className="btn-primary">
          Manage events
        </Link>
        <Link to="/admin/users" className="btn-secondary">
          Manage pilots
        </Link>
      </div>
    </div>
  );
}
