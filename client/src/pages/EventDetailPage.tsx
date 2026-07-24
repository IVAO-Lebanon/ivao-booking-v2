import { useMemo, useState } from 'react';
import { ArrowLeft, Headphones, FileText, Ticket, Wrench } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Slot } from '../api/types';
import { Checkbox } from '@ivao/atmosphere-react';
import { PageLoader, EmptyState, StatusBadge, Pagination } from '../components/ui';
import { SlotList } from '../components/SlotList';
import { BookSlotModal } from '../components/BookSlotModal';
import { LiveEventBoard } from '../components/LiveEventBoard';
import { useAuth } from '../auth/AuthContext';
import { fmtDateUtc, fmtTimeUtc } from '../lib/format';

type Tab = 'all' | 'mine';

const RFO_TYPES = [
  { key: '', label: 'All' },
  { key: 'takeoff', label: 'Departures' },
  { key: 'landing', label: 'Arrivals' },
  { key: 'private', label: 'Private' },
];

export default function EventDetailPage() {
  const { id } = useParams();
  const eventId = Number(id);
  const { signed, isAdmin } = useAuth();

  const [tab, setTab] = useState<Tab>('all');
  const [page, setPage] = useState(1);
  const [available, setAvailable] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [bookingSlot, setBookingSlot] = useState<Slot | null>(null);

  const eventQ = useQuery({ queryKey: ['event', eventId], queryFn: () => api.event(eventId), enabled: !!eventId });
  const event = eventQ.data;

  const params = useMemo(() => {
    const p: Record<string, unknown> = { page, perPage: 15 };
    if (available) p.available = true;
    if (typeFilter && event?.opsSlots) p.type = typeFilter;
    if (search.trim()) p.flightNumber = search.trim().toUpperCase();
    return p;
  }, [page, available, typeFilter, search, event?.type]);

  const slotsQ = useQuery({
    queryKey: ['slots', eventId, params, tab],
    queryFn: () => (tab === 'mine' ? api.mySlots(eventId, { page, perPage: 15 }) : api.slots(eventId, params)),
    enabled: !!event && (tab === 'all' || signed),
  });

  const countsQ = useQuery({
    queryKey: ['slot-counts', eventId],
    queryFn: () => api.slotCounts(eventId),
    enabled: !!event,
  });

  // Live network overlay — only while the event is actually in progress; refreshes on the Whazzup cadence.
  const liveQ = useQuery({
    queryKey: ['event-live', eventId],
    queryFn: () => api.eventLive(eventId),
    enabled: !!event && !!event.inProgress,
    refetchInterval: event?.inProgress ? 20_000 : false,
  });
  const live = useMemo(
    () => Object.fromEntries((liveQ.data?.flights ?? []).map((f) => [f.flightNumber, f])),
    [liveQ.data]
  );

  if (eventQ.isLoading) return <PageLoader />;
  if (eventQ.isError || !event) return <EmptyState title="Event not found" hint="It may have been removed." />;

  const counts = countsQ.data;

  return (
    <div>
      <Link to="/" className="mb-3 inline-flex items-center gap-1.5 text-sm text-fuselage-500 hover:text-atmos-600">
        <ArrowLeft size={15} /> All events
      </Link>

      {/* Hero — the banner sizes to the real image (no crop), capped at a max height. */}
      <div className="card overflow-hidden">
        <div className="relative w-full bg-fuselage-950">
          {event.banner ? (
            <img
              src={event.banner}
              alt=""
              className="mx-auto block max-h-[26rem] w-full object-contain"
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
          ) : (
            <div className="terminal-grid h-40 w-full opacity-70" />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
          <div className="absolute bottom-0 left-0 p-4 text-white sm:p-6">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {event.inProgress ? (
                <span className="badge bg-danger-600 text-white">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE
                </span>
              ) : (
                <StatusBadge status={event.status} />
              )}
              <span className="badge bg-white/20 uppercase">{event.typeName || event.type}</span>
            </div>
            <h1 className="text-2xl font-extrabold sm:text-3xl">{event.eventName}</h1>
            <p className="mt-1 text-sm text-fuselage-200">
              {fmtDateUtc(event.dateStart)} · {fmtTimeUtc(event.dateStart)}–{fmtTimeUtc(event.dateEnd)}
            </p>
          </div>
        </div>

        <div className="grid gap-4 p-4 sm:p-6 md:grid-cols-3">
          <div className="md:col-span-2">
            <p className="whitespace-pre-line text-sm text-fuselage-600 dark:text-fuselage-300">{event.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {event.atcBooking && (
                <a href={event.atcBooking} target="_blank" rel="noreferrer" className="btn-secondary px-3 py-1.5 text-xs">
                  <Headphones size={14} /> ATC booking
                </a>
              )}
              {event.pilotBriefing && (
                <a href={event.pilotBriefing} target="_blank" rel="noreferrer" className="btn-secondary px-3 py-1.5 text-xs">
                  <FileText size={14} /> Pilot briefing
                </a>
              )}
              {event.atcBriefing && (
                <a href={event.atcBriefing} target="_blank" rel="noreferrer" className="btn-secondary px-3 py-1.5 text-xs">
                  <FileText size={14} /> ATC briefing
                </a>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {event.airports.length > 0 && (
              <div>
                <div className="label">Airports</div>
                <div className="flex flex-wrap gap-1">
                  {event.airports.map((a) => (
                    <span key={a} className="badge bg-fuselage-100 font-mono dark:bg-fuselage-800">
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {counts && (
              <div className="grid grid-cols-2 gap-2 text-center">
                {'departure' in counts ? (
                  <>
                    <Stat label="Departures" value={counts.departure ?? 0} />
                    <Stat label="Arrivals" value={counts.landing ?? 0} />
                  </>
                ) : (
                  <>
                    <Stat label="Free" value={counts.free ?? 0} />
                    <Stat label="Booked" value={counts.booked ?? 0} />
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {event.sceneries.length > 0 && (
          <div className="border-t border-fuselage-100 px-4 py-3 dark:border-fuselage-800 sm:px-6">
            <div className="label">Recommended sceneries</div>
            <div className="flex flex-wrap gap-2">
              {event.sceneries.map((s) => (
                <a
                  key={s.id}
                  href={s.link}
                  target="_blank"
                  rel="noreferrer"
                  className="badge bg-atmos-50 text-atmos-700 hover:bg-atmos-100 dark:bg-atmos-900/30 dark:text-atmos-300"
                >
                  {s.icao} · {s.title} · {s.simulator} ({s.license})
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Slots */}
      <div className="mt-6">
        {event.inProgress && liveQ.data?.inProgress && <LiveEventBoard data={liveQ.data} />}

        {isAdmin && (
          <Link
            to={`/admin/events/${event.id}/slots`}
            className="mb-4 flex items-center gap-3 rounded-xl border border-atmos-100 bg-atmos-50 px-4 py-3 text-sm text-atmos-800 hover:bg-atmos-100 dark:border-atmos-900/50 dark:bg-atmos-900/20 dark:text-atmos-200 dark:hover:bg-atmos-900/30"
          >
            <Wrench size={18} className="shrink-0 text-atmos-600 dark:text-atmos-400" aria-hidden />
            <span>
              You're staff. <span className="font-bold underline underline-offset-2">Manage slots</span> (create, edit, CSV, bulk) in the admin panel.
            </span>
          </Link>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-fuselage-100 p-1 dark:bg-fuselage-800">
            <button
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${tab === 'all' ? 'bg-white shadow dark:bg-fuselage-700' : 'text-fuselage-500'}`}
              onClick={() => {
                setTab('all');
                setPage(1);
              }}
            >
              All slots
            </button>
            {signed && (
              <button
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${tab === 'mine' ? 'bg-white shadow dark:bg-fuselage-700' : 'text-fuselage-500'}`}
                onClick={() => {
                  setTab('mine');
                  setPage(1);
                }}
              >
                My slots
              </button>
            )}
          </div>

          {tab === 'all' && (
            <>
              <label className="ml-auto flex items-center gap-2 text-sm">
                <Checkbox checked={available} onCheckedChange={(v) => { setAvailable(v === true); setPage(1); }} />
                Available only
              </label>
              <input
                className="input w-40"
                placeholder="Flight # search"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </>
          )}
        </div>

        {tab === 'all' && event.opsSlots && (
          <div className="mb-4 flex flex-wrap gap-1">
            {RFO_TYPES.map((t) => (
              <button
                key={t.key}
                onClick={() => { setTypeFilter(t.key); setPage(1); }}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  typeFilter === t.key
                    ? 'bg-atmos-700 text-white shadow-sm'
                    : 'bg-fuselage-100 text-fuselage-600 hover:bg-fuselage-200 dark:bg-fuselage-800 dark:text-fuselage-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {!signed && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-atmos-100 bg-atmos-50 px-4 py-3 text-sm text-atmos-800 dark:border-atmos-900/50 dark:bg-atmos-900/20 dark:text-atmos-200">
            <Ticket size={20} className="shrink-0 text-atmos-600 dark:text-atmos-400" aria-hidden />
            <span>
              <Link to="/login" className="font-bold underline underline-offset-2">
                Sign in
              </Link>{' '}
              with your IVAO account to book a slot.
            </span>
          </div>
        )}

        {slotsQ.isLoading ? (
          <PageLoader />
        ) : !slotsQ.data || slotsQ.data.data.length === 0 ? (
          <EmptyState title={tab === 'mine' ? 'You have no slots for this event' : 'No slots found'} />
        ) : (
          <>
            <SlotList event={event} slots={slotsQ.data.data} onBook={setBookingSlot} live={live} />
            <Pagination page={slotsQ.data.page} totalPages={slotsQ.data.totalPages} onChange={setPage} />
          </>
        )}
      </div>

      {bookingSlot && <BookSlotModal slot={bookingSlot} event={event} onClose={() => setBookingSlot(null)} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel px-2 py-2.5">
      <div className="font-head text-2xl font-extrabold tabular-nums text-atmos-600 dark:text-atmos-400">{value}</div>
      <div className="mt-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-fuselage-500">{label}</div>
    </div>
  );
}
