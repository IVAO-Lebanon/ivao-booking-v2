import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Checkbox } from '@ivao/atmosphere-react';
import { PageLoader, EmptyState, Pagination } from '../../components/ui';
import { SlotList } from '../../components/SlotList';
import { AdminSlotPanel } from '../../components/AdminSlotPanel';
import { EmailPanel } from '../../components/EmailPanel';
import { fmtDateUtc, fmtTimeUtc } from '../../lib/format';

const OPS_TYPES = [
  { key: '', label: 'All' },
  { key: 'takeoff', label: 'Departures' },
  { key: 'landing', label: 'Arrivals' },
  { key: 'private', label: 'Private' },
];

export default function AdminSlotsPage() {
  const { eventId: idParam } = useParams();
  const eventId = Number(idParam);

  const [page, setPage] = useState(1);
  const [available, setAvailable] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');

  const eventQ = useQuery({ queryKey: ['event', eventId], queryFn: () => api.event(eventId), enabled: !!eventId });
  const event = eventQ.data;

  const params = useMemo(() => {
    const p: Record<string, unknown> = { page, perPage: 25 };
    if (available) p.available = true;
    if (typeFilter && event?.opsSlots) p.type = typeFilter;
    if (search.trim()) p.flightNumber = search.trim().toUpperCase();
    return p;
  }, [page, available, typeFilter, search, event?.opsSlots]);

  const slotsQ = useQuery({
    queryKey: ['slots', eventId, params],
    queryFn: () => api.slots(eventId, params),
    enabled: !!event,
  });

  if (eventQ.isLoading) return <PageLoader />;
  if (eventQ.isError || !event) return <EmptyState title="Event not found" hint="It may have been removed." />;

  return (
    <div>
      <Link to="/admin/events" className="mb-3 inline-flex items-center gap-1.5 text-sm text-fuselage-500 hover:text-atmos-600">
        <ArrowLeft size={15} /> All events
      </Link>

      <div className="mb-5">
        <div className="eyebrow">Slot management</div>
        <h2 className="mt-1 text-xl font-extrabold sm:text-2xl">{event.eventName}</h2>
        <p className="mt-1 font-mono text-xs uppercase tracking-wider text-fuselage-400">
          {event.typeName || event.type} · {fmtDateUtc(event.dateStart)} · {fmtTimeUtc(event.dateStart)}–{fmtTimeUtc(event.dateEnd)}
        </p>
      </div>

      <EmailPanel event={event} />
      <AdminSlotPanel event={event} />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={available} onCheckedChange={(v) => { setAvailable(v === true); setPage(1); }} />
          Available only
        </label>
        <input
          className="input ml-auto w-44"
          placeholder="Flight # search"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      {event.opsSlots && (
        <div className="mb-4 flex flex-wrap gap-1">
          {OPS_TYPES.map((t) => (
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

      {slotsQ.isLoading ? (
        <PageLoader />
      ) : !slotsQ.data || slotsQ.data.data.length === 0 ? (
        <EmptyState title="No slots yet" hint="Add slots individually or import a CSV above." />
      ) : (
        <>
          <SlotList event={event} slots={slotsQ.data.data} onBook={() => {}} isAdmin manageMode />
          <Pagination page={slotsQ.data.page} totalPages={slotsQ.data.totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
