import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { EventModel } from '../api/types';
import { PageLoader, EmptyState, StatusBadge, Pagination } from '../components/ui';
import { fmtDateUtc, fmtTimeUtc, relativeToNow } from '../lib/format';

function EventCard({ event }: { event: EventModel }) {
  return (
    <Link to={`/events/${event.id}`} className="card card-hover group flex flex-col overflow-hidden">
      {/* Banner */}
      <div className="relative h-40 w-full overflow-hidden bg-gradient-to-br from-atmos-700 to-atmos-900">
        {event.banner ? (
          <img
            src={event.banner}
            alt=""
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        ) : (
          <div className="terminal-grid absolute inset-0 opacity-70" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
        <div className="absolute left-3 top-3">
          <span className="badge bg-white/90 font-mono uppercase tracking-wide text-fuselage-700 backdrop-blur">
            {event.typeName || event.type}
          </span>
        </div>
        <div className="absolute right-3 top-3">
          {event.inProgress ? (
            <span className="badge bg-danger-600 text-white shadow">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE
            </span>
          ) : (
            <StatusBadge status={event.status} onImage />
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-1 text-lg font-bold group-hover:text-atmos-700 dark:group-hover:text-atmos-300">
          {event.eventName}
        </h3>
        <p className="mt-1 line-clamp-2 text-sm text-fuselage-500">{event.description}</p>

        {/* Perforated boarding-pass divider */}
        <div className="my-3 flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 -translate-x-1.5 rounded-full bg-fuselage-100 dark:bg-fuselage-950" />
          <span className="flex-1 border-t border-dashed border-fuselage-200 dark:border-fuselage-700" />
          <span className="h-3 w-3 shrink-0 translate-x-1.5 rounded-full bg-fuselage-100 dark:bg-fuselage-950" />
        </div>

        <div className="mt-auto flex items-end justify-between gap-2">
          <div>
            <div className="eyebrow">Departure</div>
            <div className="mt-0.5 font-mono text-sm font-semibold text-fuselage-800 dark:text-fuselage-100">
              {fmtDateUtc(event.dateStart)}
            </div>
            <div className="font-mono text-xs text-fuselage-500">
              {fmtTimeUtc(event.dateStart)}–{fmtTimeUtc(event.dateEnd)}
            </div>
          </div>
          {!event.hasStarted && (
            <span className="rounded-md bg-atmos-50 px-2 py-1 font-mono text-xs font-semibold text-atmos-700 dark:bg-atmos-900/30 dark:text-atmos-300">
              {relativeToNow(event.dateStart)}
            </span>
          )}
        </div>

      </div>
    </Link>
  );
}

export default function EventsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['events', page],
    queryFn: () => api.events({ page, perPage: 9 }),
  });

  const total = data?.total ?? 0;

  return (
    <div>
      {/* Operations-board hero */}
      <div className="relative mb-8 overflow-hidden rounded-2xl border border-fuselage-150 bg-fuselage-950 px-6 py-8 text-white sm:px-8 sm:py-10 dark:border-fuselage-800">
        <div className="terminal-grid absolute inset-0 opacity-60" />
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-atmos-600/25 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.25em] text-atmos-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success-500" />
              Departures board
            </div>
            <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Upcoming events</h1>
            <p className="mt-2 max-w-xl text-sm text-fuselage-300">
              Browse the schedule and book a slot on the flights you want to fly.
            </p>
            {!isLoading && !isError && (
              <p className="mt-4 font-mono text-xs uppercase tracking-wider text-fuselage-400">
                {total} {total === 1 ? 'event' : 'events'} on the board
              </p>
            )}
          </div>
        </div>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : isError ? (
        <EmptyState title="Couldn't load events" hint="Check that the API server is running, then refresh." />
      ) : !data || data.data.length === 0 ? (
        <EmptyState title="No upcoming events" hint="The board is clear for now. Check back soon for new flights." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.data.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
