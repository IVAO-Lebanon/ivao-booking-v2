import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../api/client';
import type { EventModel } from '../../api/types';
import { Select, Switch } from '@ivao/atmosphere-react';
import { Modal, Spinner, PageLoader, EmptyState, StatusBadge, Pagination } from '../../components/ui';
import { Plus, TriangleAlert } from 'lucide-react';
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
    onError: (e) => setError(friendlyError(apiErrorMessage(e))),
  });

  const set = (k: string) => (e: any) => setF((s) => ({ ...s, [k]: e.target.value }));
  const setVal = (k: string) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const setBool = (k: string) => (v: boolean) => setF((s) => ({ ...s, [k]: v }));
  // Date/time are stored as "YYYY-MM-DDTHH:mm" (UTC). Split into a date picker + a
  // 24-hour time field so the input is unambiguous UTC 24h, not locale 12h.
  const dayPart = (v: string) => (v || '').slice(0, 10);
  const timePart = (v: string) => (v || '').slice(11, 16);
  const setDay = (k: 'dateStart' | 'dateEnd') => (day: string) => setF((s) => ({ ...s, [k]: `${day}T${timePart(s[k]) || '00:00'}` }));
  const setTime = (k: 'dateStart' | 'dateEnd') => (tm: string) => setF((s) => ({ ...s, [k]: `${dayPart(s[k])}T${tm}` }));

  // Inline validation — every field is checked against its expected shape so no
  // stray/random values reach the server; the first problem is shown in the modal.
  const [error, setError] = useState('');
  const isUrl = (v: string) => {
    try { const u = new URL(v.trim()); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
  };
  const isTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  const validate = (): string => {
    if (!f.eventName.trim()) return 'Enter an event name.';
    if (!f.description.trim()) return 'Enter a description.';
    const airports = f.airports.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (airports.length === 0) return 'Add at least one airport (4-letter ICAO).';
    const badIcao = airports.find((a) => !/^[A-Z]{4}$/.test(a));
    if (badIcao) return `"${badIcao}" is not a valid 4-letter ICAO code.`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayPart(f.dateStart)) || !isTime(timePart(f.dateStart))) return 'Enter a valid start date and time (HH:MM, 24h UTC).';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayPart(f.dateEnd)) || !isTime(timePart(f.dateEnd))) return 'Enter a valid end date and time (HH:MM, 24h UTC).';
    if (toUnix(f.dateEnd) <= toUnix(f.dateStart)) return 'The end time must be after the start time.';
    if (!isUrl(f.banner)) return 'Banner must be a valid http(s) URL.';
    if (!isUrl(f.atcBooking)) return 'ATC booking must be a valid http(s) URL.';
    if (f.pilotBriefing.trim() && !isUrl(f.pilotBriefing)) return 'Pilot briefing must be a valid URL, or leave it blank.';
    if (f.atcBriefing.trim() && !isUrl(f.atcBriefing)) return 'ATC briefing must be a valid URL, or leave it blank.';
    const max = Number(f.maxBookingsPerPilot);
    if (!Number.isInteger(max) || max < 0 || max > 999) return 'Max bookings per pilot must be a whole number from 0 to 999.';
    return '';
  };

  return (
    <Modal open onClose={onClose} title={editing ? 'Edit event' : 'Create event'} maxWidth="max-w-2xl">
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          const err = validate();
          if (err) { setError(err); return; }
          setError('');
          save.mutate();
        }}
        className="space-y-3"
      >
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-danger-300 bg-danger-50 px-3 py-2 text-sm text-danger-700 dark:border-danger-900/50 dark:bg-danger-900/20 dark:text-danger-300">
            <TriangleAlert size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
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
            <Select
              position="popper"
              value={f.type}
              onValueChange={setVal('type')}
              placeholder="Select type"
              items={(eventTypes ?? []).map((t) => ({ value: t.code, label: t.name }))}
            />
          </div>
          <div>
            <label className="label">Status</label>
            <Select
              position="popper"
              value={f.status}
              onValueChange={setVal('status')}
              placeholder="Select status"
              items={[
                { value: 'created', label: 'Created' },
                { value: 'scheduled', label: 'Scheduled' },
                { value: 'finished', label: 'Finished' },
                { value: 'cancelled', label: 'Cancelled' },
              ]}
            />
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <label className="label">Start date (UTC)</label>
              <input type="date" lang="en-GB" className="input" value={dayPart(f.dateStart)} onChange={(e) => setDay('dateStart')(e.target.value)} required />
            </div>
            <div>
              <label className="label">Time (UTC, 24h)</label>
              <input type="text" inputMode="numeric" placeholder="HH:MM" maxLength={5}
                pattern="([01][0-9]|2[0-3]):[0-5][0-9]" title="24-hour UTC time, e.g. 16:00"
                className="input w-24 text-center font-mono" value={timePart(f.dateStart)}
                onChange={(e) => setTime('dateStart')(e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <label className="label">End date (UTC)</label>
              <input type="date" lang="en-GB" className="input" value={dayPart(f.dateEnd)} onChange={(e) => setDay('dateEnd')(e.target.value)} required />
            </div>
            <div>
              <label className="label">Time (UTC, 24h)</label>
              <input type="text" inputMode="numeric" placeholder="HH:MM" maxLength={5}
                pattern="([01][0-9]|2[0-3]):[0-5][0-9]" title="24-hour UTC time, e.g. 16:00"
                className="input w-24 text-center font-mono" value={timePart(f.dateEnd)}
                onChange={(e) => setTime('dateEnd')(e.target.value)} required />
            </div>
          </div>
        </div>
        <div>
          <label className="label">Airports (comma-separated ICAO)</label>
          <input className="input font-mono uppercase" value={f.airports} onChange={set('airports')} placeholder="EGLL,EGKK" required />
        </div>
        <div>
          <label className="label">Banner URL</label>
          <input type="url" className="input" value={f.banner} onChange={set('banner')} placeholder="https://…" required />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="label">ATC booking URL</label>
            <input type="url" className="input" value={f.atcBooking} onChange={set('atcBooking')} placeholder="https://…" required />
          </div>
          <div>
            <label className="label">Pilot briefing URL</label>
            <input type="url" className="input" value={f.pilotBriefing} onChange={set('pilotBriefing')} placeholder="https://… (optional)" />
          </div>
          <div>
            <label className="label">ATC briefing URL</label>
            <input className="input" value={f.atcBriefing} onChange={set('atcBriefing')} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Max bookings per pilot (0 = unlimited)</label>
            <input type="number" min={0} max={999} step={1} className="input" value={f.maxBookingsPerPilot} onChange={set('maxBookingsPerPilot')} />
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
        <div className="flex flex-wrap gap-x-6 gap-y-3 pt-1">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={f.publicAccess} onCheckedChange={setBool('publicAccess')} />
            Public access
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={f.allowBookingAfterStart} onCheckedChange={setBool('allowBookingAfterStart')} />
            Allow booking after start
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={f.useIvaoRoutes} onCheckedChange={setBool('useIvaoRoutes')} />
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
                  <Link to={`/admin/events/${ev.id}/email`} className="btn-secondary px-3 py-1.5 text-xs">
                    Email
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
