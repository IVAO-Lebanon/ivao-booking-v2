import { CSSProperties } from 'react';
import { Plane } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { PageLoader, EmptyState, StatusBadge, statusRail } from '../components/ui';
import { fmtDateUtc, fmtTimeUtc } from '../lib/format';

export default function MyBookingsPage() {
  // Gather the user's slots across all upcoming events.
  const eventsQ = useQuery({ queryKey: ['events', 'all-for-mine'], queryFn: () => api.events({ perPage: 25 }) });
  const events = eventsQ.data?.data ?? [];

  const mineQ = useQuery({
    queryKey: ['my-all-slots', events.map((e) => e.id)],
    enabled: events.length > 0,
    queryFn: async () => {
      const results = await Promise.all(
        events.map((e) => api.mySlots(e.id, { perPage: 25 }).then((r) => r.data.map((s) => ({ slot: s, event: e }))))
      );
      return results.flat();
    },
  });

  if (eventsQ.isLoading || mineQ.isLoading) return <PageLoader />;
  const rows = mineQ.data ?? [];

  return (
    <div>
      <div className="mb-6">
        <div className="eyebrow">Your manifest</div>
        <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">My bookings</h1>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No active bookings" hint="Browse events and book a slot to see it here." />
      ) : (
        <div className="space-y-2">
          {rows.map(({ slot, event }) => (
            <Link
              key={slot.id}
              to={`/events/${event.id}`}
              className="strip flex flex-wrap items-center gap-x-4 gap-y-1 p-4"
              style={{ ['--rail' as keyof CSSProperties]: statusRail(slot.bookingStatus) } as CSSProperties}
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <div className="font-mono text-lg font-bold tracking-tight">{slot.flightNumber || 'N/A'}</div>
                <div className="flex items-center gap-2 font-mono text-sm font-semibold">
                  <span className={slot.origin ? '' : 'text-fuselage-400'}>{slot.origin || '····'}</span>
                  <Plane size={14} className="rotate-90 text-atmos-500" aria-hidden />
                  <span className={slot.destination ? '' : 'text-fuselage-400'}>{slot.destination || '····'}</span>
                </div>
                <div className="font-mono text-sm text-fuselage-500">
                  {fmtDateUtc(slot.slotTime)} · {fmtTimeUtc(slot.slotTime)}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <span className="hidden max-w-[14rem] truncate text-sm text-fuselage-400 sm:block">{event.eventName}</span>
                <StatusBadge status={slot.bookingStatus} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
