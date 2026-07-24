import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../api/client';
import type { EventModel } from '../../api/types';
import { Modal, Spinner, PageLoader, EmptyState, StatusBadge, Pagination } from '../../components/ui';
import { Plus } from 'lucide-react';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/Confirm';
import { friendlyError, fmtUtc } from '../../lib/format';

/** MySQL datetime "YYYY-MM-DD HH:mm:ss" (UTC) -> value for <input datetime-local>. */
function toLocalInput(mysql?: string | null): string {
  if (!mysql) return '';
  return mysql.replace(' ', 'T').slice(0, 16);
}
/** datetime-local value (treated as UTC) -> unix seconds. */
function toUnix(local: string): number {
  return Math.floor(Date.parse(local + ':00Z') / 1000);
}

const EMPTY = {
  eventName: '',
  description: '',
  type: 'rfe',
  status: 'scheduled',
  dateStart: '',
  dateEnd: '',
  banner: '',
  atcBooking: '',
  atcBriefing: '',
  pilotBriefing: '',
  airports: '',
  publicAccess: true,
  allowBookingAfterStart: false,
  maxBookingsPerPilot: 0,
  bookingMessage: '',
  useIvaoRoutes: false,
};

function EventForm({ editing, onClose }: { editing: EventModel | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: eventTypes } = useQuery({ queryKey: ['event-types'], queryFn: () => api.eventTypes() });
  const [f, setF] = useState(() =>
    editing
      ? {
          eventName: editing.eventName,
          description: editing.description,
          type: editing.type,
          status: editing.status,
          dateStart: toLocalInput(editing.dateStart),
          dateEnd: toLocalInput(editing.dateEnd),
          banner: editing.banner,
          atcBooking: editing.atcBooking,
          atcBriefing: editing.atcBriefing || '',
          pilotBriefing: editing.pilotBriefing || '',
          airports: editing.airports.join(','),
          publicAccess: Boolean(editing.publicAccess),
          allowBookingAfterStart: Boolean(editing.allowBookingAfterStart),
          maxBookingsPerPilot: editing.maxBookingsPerPilot ?? 0,
          bookingMessage: editing.bookingMessage || '',
          useIvaoRoutes: Boolean(editing.useIvaoRoutes),
        }
      : { ...EMPTY }
  );

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...f,
        dateStart: toUnix(f.dateStart),
        dateEnd: toUnix(f.dateEnd),
        atcBriefing: f.atcBriefing || null,
        pilotBriefing: f.pilotBriefing || null,
      };
      return editing ? api.updateEvent(editing.id, payload) : api.createEvent(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-events'] });
      qc.invalidateQueries({ queryKey: ['events'] });
      toast.success(editing ? 'Event updated.' : 'Event created.');
      onClose();
    },
    onError: (e) => toast.error(friendlyError(apiErrorMessage(e))),
  });

  const set = (k: string) => (e: any) => setF((s) => ({ ...s, [k]: e.target.value }));

  return (
    <Modal open onClose={onClose} title={editing ? 'Edit event' : 'Create event'} maxWidth="max-w-2xl">
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save.mutate();
        }}
        className="space-y-3"
      >
        <div>
          <label className="label">Event name</label>
          <input className="input" value={f.eventName} onChange={set('eventName')} required />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="input min-h-[80px]" value={f.description} onChange={set('description')} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Type</label>
            <select className="input" value={f.type} onChange={set('type')}>
              {(eventTypes ?? []).map((t) => (
                <option key={t.code} value={t.code}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={f.status} onChange={set('status')}>
              <option value="created">Created</option>
              <option value="scheduled">Scheduled</option>
              <option value="finished">Finished</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="label">Start (UTC)</label>
            <input type="datetime-local" className="input" value={f.dateStart} onChange={set('dateStart')} required />
          </div>
          <div>
            <label className="label">End (UTC)</label>
            <input type="datetime-local" className="input" value={f.dateEnd} onChange={set('dateEnd')} required />
          </div>
        </div>
        <div>
          <label className="label">Airports (comma-separated ICAO)</label>
          <input className="input font-mono uppercase" value={f.airports} onChange={set('airports')} placeholder="EGLL,EGKK" required />
        </div>
        <div>
          <label className="label">Banner URL</label>
          <input className="input" value={f.banner} onChange={set('banner')} placeholder="https://…" required />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="label">ATC booking URL</label>
            <input className="input" value={f.atcBooking} onChange={set('atcBooking')} required />
          </div>
          <div>
            <label className="label">Pilot briefing URL</label>
            <input className="input" value={f.pilotBriefing} onChange={set('pilotBriefing')} />
          </div>
          <div>
            <label className="label">ATC briefing URL</label>
            <input className="input" value={f.atcBriefing} onChange={set('atcBriefing')} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Max bookings per pilot (0 = unlimited)</label>
            <input type="number" min={0} className="input" value={f.maxBookingsPerPilot} onChange={set('maxBookingsPerPilot')} />
          </div>
        </div>
        <div>
          <label className="label">Booking message (optional, shown to pilots when they book)</label>
          <textarea
            className="input min-h-[60px]"
            value={f.bookingMessage}
            onChange={set('bookingMessage')}
            placeholder="e.g. Please file the published route and connect 15 min before your slot."
          />
        </div>
        <div className="flex flex-wrap gap-4 pt-1">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.publicAccess} onChange={(e) => setF((s) => ({ ...s, publicAccess: e.target.checked }))} />
            Public access
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={f.allowBookingAfterStart}
              onChange={(e) => setF((s) => ({ ...s, allowBookingAfterStart: e.target.checked }))}
            />
            Allow booking after start
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={f.useIvaoRoutes}
              onChange={(e) => setF((s) => ({ ...s, useIvaoRoutes: e.target.checked }))}
            />
            Offer IVAO-published routes
          </label>
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary flex-1" disabled={save.isPending}>
            {save.isPending ? <Spinner /> : editing ? 'Save changes' : 'Create event'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function EventsAdminPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ open: boolean; editing: EventModel | null }>({ open: false, editing: null });

  const { data, isLoading } = useQuery({
    queryKey: ['admin-events', page],
    queryFn: () => api.events({ showAll: true, page, perPage: 12 }),
  });

  const del = useMutation({
    mutationFn: (id: number) => api.deleteEvent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-events'] });
      toast.success('Event deleted.');
    },
    onError: (e) => toast.error(friendlyError(apiErrorMessage(e))),
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-fuselage-500">All events (including past & drafts).</p>
        <button className="btn-primary" onClick={() => setModal({ open: true, editing: null })}>
          <Plus size={16} /> New event
        </button>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : !data || data.data.length === 0 ? (
        <EmptyState title="No events yet" hint="Create your first event." />
      ) : (
        <>
          <div className="space-y-2">
            {data.data.map((ev) => (
              <div key={ev.id} className="card flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-bold">{ev.eventName}</span>
                    <StatusBadge status={ev.status} />
                    <span className="badge bg-fuselage-100 uppercase dark:bg-fuselage-800">{ev.type}</span>
                  </div>
                  <div className="text-xs text-fuselage-500">{fmtUtc(ev.dateStart)} · {ev.airports.join(', ')}</div>
                </div>
                <div className="flex gap-1.5">
                  <Link to={`/admin/events/${ev.id}/slots`} className="btn-secondary px-3 py-1.5 text-xs">
                    Manage slots
                  </Link>
                  <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setModal({ open: true, editing: ev })}>
                    Edit
                  </button>
                  <button
                    className="btn-ghost px-3 py-1.5 text-xs text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-900/20"
                    onClick={async () => {
                      if (
                        await confirm({
                          title: 'Delete this event?',
                          message: `"${ev.eventName}" and all of its slots and bookings will be permanently removed.`,
                          confirmLabel: 'Delete event',
                        })
                      )
                        del.mutate(ev.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}

      {modal.open && <EventForm editing={modal.editing} onClose={() => setModal({ open: false, editing: null })} />}
    </div>
  );
}
