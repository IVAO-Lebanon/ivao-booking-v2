import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage, apiErrorDetails } from '../../api/client';
import type { EventModel, IvaoImportEvent, ReconcileSummary } from '../../api/types';
import { Select, Switch } from '@ivao/atmosphere-react';
import { Modal, Spinner, PageLoader, EmptyState, StatusBadge, Pagination, FormError } from '../../components/ui';
import { ReconcileDialog } from '../../components/ReconcileDialog';
import { Plus, DownloadCloud, ChevronDown, ChevronRight } from 'lucide-react';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/Confirm';
import { friendlyError, describeError, fmtUtc } from '../../lib/format';

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
  requireConfirmation: true,
  confirmOpensHoursBefore: 168,
  confirmDeadlineHours: 0,
  confirmReminderHoursBefore: 0,
  confirmReminderAt: '',
};

// Friendly presets so admins never have to think in raw "hours before start".
const OPENS_PRESETS = [
  { value: '8760', label: 'As soon as published' },
  { value: '336', label: '14 days before start' },
  { value: '168', label: '7 days before start' },
  { value: '72', label: '3 days before start' },
  { value: '48', label: '2 days before start' },
  { value: '24', label: '1 day before start' },
  { value: '12', label: '12 hours before start' },
];
const CLAIM_PRESETS = [
  { value: '0', label: 'Never - always the pilot’s slot' },
  { value: '72', label: '3 days before start' },
  { value: '48', label: '2 days before start' },
  { value: '24', label: '1 day before start' },
  { value: '12', label: '12 hours before start' },
  { value: '6', label: '6 hours before start' },
];
const REMIND_PRESETS = [
  { value: '0', label: 'Don’t send a reminder' },
  { value: '72', label: '3 days before start' },
  { value: '48', label: '2 days before start' },
  { value: '24', label: '1 day before start' },
  { value: '12', label: '12 hours before start' },
];
// Include the current value as a "custom" option if it isn't one of the presets.
const withCurrent = (items: { value: string; label: string }[], value: string | number) => {
  const v = String(value);
  return items.some((i) => i.value === v) ? items : [{ value: v, label: `${v} hours before start` }, ...items];
};
const labelOf = (items: { value: string; label: string }[], value: string | number) =>
  withCurrent(items, value).find((i) => i.value === String(value))?.label ?? `${value}h`;

function EventForm({ editing, onClose }: { editing: EventModel | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: eventTypes } = useQuery({ queryKey: ['event-types'], queryFn: () => api.eventTypes() });
  // Published IVAO events for this division, offered as a prefill when creating.
  const { data: ivao, isLoading: ivaoLoading, error: ivaoError } = useQuery({
    queryKey: ['ivao-import'],
    queryFn: () => api.ivaoImport(),
    enabled: !editing,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const [importedTitle, setImportedTitle] = useState('');
  const applyIvao = (ev: IvaoImportEvent) => {
    setF((s) => ({
      ...s,
      eventName: ev.title || s.eventName,
      description: ev.description || s.description,
      dateStart: ev.startDate ? toLocalInput(ev.startDate) : s.dateStart,
      dateEnd: ev.endDate ? toLocalInput(ev.endDate) : s.dateEnd,
      banner: ev.imageUrl || s.banner,
      airports: (ev.airports || []).join(','),
    }));
    setImportedTitle(ev.title);
    setError('');
  };
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
          requireConfirmation: editing.requireConfirmation == null ? true : Boolean(editing.requireConfirmation),
          confirmOpensHoursBefore: editing.confirmOpensHoursBefore ?? 168,
          confirmDeadlineHours: editing.confirmDeadlineHours ?? 0,
          confirmReminderHoursBefore: editing.confirmReminderHoursBefore ?? 0,
          confirmReminderAt: editing.confirmReminderAt ? toLocalInput(editing.confirmReminderAt) : '',
        }
      : { ...EMPTY }
  );

  // When a save would affect existing bookings, the server asks us to confirm; we
  // hold the summary here and re-submit with the admin's decision.
  const [reconcilePrompt, setReconcilePrompt] = useState<ReconcileSummary | null>(null);

  const save = useMutation({
    mutationFn: (reconcile?: { shiftSlots?: boolean }) => {
      // Numeric fields come off text/number inputs as strings; coerce them (with safe
      // fallbacks) so an emptied field never reaches the server as "" and trips Zod.
      const intOr = (v: unknown, fallback: number) => {
        const n = Math.floor(Number(v));
        return Number.isFinite(n) ? n : fallback;
      };
      const payload = {
        ...f,
        dateStart: toUnix(f.dateStart),
        dateEnd: toUnix(f.dateEnd),
        atcBriefing: f.atcBriefing || null,
        pilotBriefing: f.pilotBriefing || null,
        maxBookingsPerPilot: intOr(f.maxBookingsPerPilot, 0),
        confirmOpensHoursBefore: intOr(f.confirmOpensHoursBefore, 168),
        confirmDeadlineHours: intOr(f.confirmDeadlineHours, 0),
        confirmReminderHoursBefore: intOr(f.confirmReminderHoursBefore, 0),
        confirmReminderAt: f.requireConfirmation && f.confirmReminderAt ? toUnix(f.confirmReminderAt) : null,
      };
      return editing ? api.updateEvent(editing.id, payload, reconcile) : api.createEvent(payload);
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['admin-events'] });
      qc.invalidateQueries({ queryKey: ['events'] });
      const applied = (result as EventModel).applied;
      const done: string[] = [];
      if (applied) {
        if (applied.confirmedPending) done.push(`${applied.confirmedPending} pending booking(s) confirmed`);
        if (applied.slotsShifted) done.push(`${applied.slotsShifted} slot time(s) shifted`);
        if (applied.cancelEmails) done.push(`${applied.cancelEmails} pilot(s) emailed`);
        if (applied.overLimit) done.push(`${applied.overLimit} pilot(s) over the new limit (kept)`);
      }
      toast.success((editing ? 'Event updated.' : 'Event created.') + (done.length ? ` ${done.join('; ')}.` : ''));
      setReconcilePrompt(null);
      onClose();
    },
    onError: (e) => {
      // The server refuses the first save when existing bookings would be affected,
      // and returns a summary; show it and let the admin decide.
      if (apiErrorMessage(e) === 'event.reconcileRequired') {
        const summary = apiErrorDetails<ReconcileSummary>(e);
        if (summary) {
          setReconcilePrompt(summary);
          return;
        }
      }
      setError(describeError(e));
    },
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

  // Inline validation - every field is checked against its expected shape so no
  // stray/random values reach the server; the first problem is shown in the modal.
  const [error, setError] = useState('');
  const [showTiming, setShowTiming] = useState(false);
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
    if (f.requireConfirmation) {
      const opens = Number(f.confirmOpensHoursBefore);
      if (!Number.isInteger(opens) || opens < 1 || opens > 8760) return 'Confirmation opening must be a whole number of hours from 1 to 8760.';
      const hrs = Number(f.confirmDeadlineHours);
      if (!Number.isInteger(hrs) || hrs < 0 || hrs > 720) return 'The claim window must be a whole number of hours from 0 to 720 (0 = never claimable).';
      const rem = Number(f.confirmReminderHoursBefore);
      if (!Number.isInteger(rem) || rem < 0 || rem > 8760) return 'The reminder time must be a whole number of hours from 0 to 8760 (0 = off).';
      if (f.confirmReminderAt && (!/^\d{4}-\d{2}-\d{2}$/.test(dayPart(f.confirmReminderAt)) || !isTime(timePart(f.confirmReminderAt)))) return 'The reminder date/time must be a valid date and time (HH:MM, 24h UTC), or leave it blank.';
      // A specific reminder time after the event has already started would never fire.
      if (f.confirmReminderAt && isTime(timePart(f.confirmReminderAt)) && toUnix(f.confirmReminderAt) >= toUnix(f.dateStart)) return 'The reminder time must be before the event start.';
    }
    return '';
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={reconcilePrompt ? 'Review changes' : editing ? 'Edit event' : 'Create event'}
      maxWidth="max-w-2xl"
    >
      {reconcilePrompt ? (
        <ReconcileDialog
          summary={reconcilePrompt}
          pending={save.isPending}
          onCancel={() => setReconcilePrompt(null)}
          onApply={(shiftSlots) => save.mutate({ shiftSlots })}
        />
      ) : (
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          const err = validate();
          if (err) { setError(err); return; }
          setError('');
          save.mutate(undefined);
        }}
        className="space-y-3"
      >
        {!editing && (
          <div className="rounded-lg border border-atmos-200 bg-atmos-50 px-3 py-3 dark:border-atmos-900/60 dark:bg-atmos-900/20">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-atmos-800 dark:text-atmos-200">
              <DownloadCloud size={16} /> Import from IVAO
            </div>
            {ivaoError ? (
              <p className="text-xs text-danger-600 dark:text-danger-300">{describeError(ivaoError)}</p>
            ) : ivaoLoading ? (
              <p className="text-xs text-fuselage-500 dark:text-fuselage-400">Loading division events…</p>
            ) : (ivao?.events.length ?? 0) === 0 ? (
              <p className="text-xs text-fuselage-500 dark:text-fuselage-400">
                No published IVAO events for division {ivao?.division ?? ''} right now.
              </p>
            ) : (
              <>
                <Select
                  position="popper"
                  value=""
                  onValueChange={(v) => {
                    const ev = ivao?.events.find((e) => String(e.id) === v);
                    if (ev) applyIvao(ev);
                  }}
                  placeholder={`Pick an IVAO event for ${ivao?.division} to prefill…`}
                  items={(ivao?.events ?? []).map((e) => ({
                    value: String(e.id),
                    label: `${e.title}${e.startDate ? ` · ${e.startDate.slice(0, 10)}` : ''}${e.airports.length ? ` · ${e.airports.join('/')}` : ''}`,
                  }))}
                />
                {importedTitle && (
                  <p className="mt-2 text-xs text-success-700 dark:text-success-300">
                    Prefilled from "{importedTitle}". IVAO does not provide an ATC booking link or briefings, so add those and pick an event type before creating.
                  </p>
                )}
              </>
            )}
          </div>
        )}
        <FormError message={error} />
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
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={f.requireConfirmation} onCheckedChange={setBool('requireConfirmation')} />
            Require booking confirmation
          </label>
        </div>
        {f.requireConfirmation ? (
          <div className="space-y-2 rounded-lg border border-fuselage-200 bg-fuselage-50 px-3 py-3 dark:border-fuselage-700 dark:bg-fuselage-900/30">
            <p className="text-xs text-fuselage-500 dark:text-fuselage-400">
              Pilots book a provisional slot and must confirm it to secure it. Sensible defaults are already set.
            </p>
            <button
              type="button"
              onClick={() => setShowTiming((v) => !v)}
              className="flex w-full items-center gap-1.5 text-left text-xs font-semibold text-fuselage-600 hover:text-fuselage-800 dark:text-fuselage-300 dark:hover:text-fuselage-100"
            >
              {showTiming ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              Confirmation timing
              {!showTiming && (
                <span className="ml-1 font-normal text-fuselage-400">
                  opens {labelOf(OPENS_PRESETS, f.confirmOpensHoursBefore).toLowerCase()}
                  {' · '}
                  {Number(f.confirmDeadlineHours) ? `claimable ${labelOf(CLAIM_PRESETS, f.confirmDeadlineHours).toLowerCase()}` : 'never claimable'}
                  {' · '}
                  {Number(f.confirmReminderHoursBefore) || f.confirmReminderAt ? 'reminder on' : 'no reminder'}
                </span>
              )}
            </button>
            {showTiming && (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label">Confirmation opens</label>
                    <Select position="popper" value={String(f.confirmOpensHoursBefore)} onValueChange={setVal('confirmOpensHoursBefore')} items={withCurrent(OPENS_PRESETS, f.confirmOpensHoursBefore)} />
                  </div>
                  <div>
                    <label className="label">Others can claim an unconfirmed slot</label>
                    <Select position="popper" value={String(f.confirmDeadlineHours)} onValueChange={setVal('confirmDeadlineHours')} items={withCurrent(CLAIM_PRESETS, f.confirmDeadlineHours)} />
                  </div>
                </div>
                <div>
                  <label className="label">Auto-remind pilots who haven’t confirmed</label>
                  <Select position="popper" value={String(f.confirmReminderHoursBefore)} onValueChange={setVal('confirmReminderHoursBefore')} items={withCurrent(REMIND_PRESETS, f.confirmReminderHoursBefore)} />
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-fuselage-500 dark:text-fuselage-400">…or send it at an exact date &amp; time (UTC)</summary>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        type="date"
                        className="input max-w-[12rem]"
                        value={dayPart(f.confirmReminderAt)}
                        onChange={(e) => setF((s) => ({ ...s, confirmReminderAt: e.target.value ? `${e.target.value}T${timePart(s.confirmReminderAt) || '00:00'}` : '' }))}
                      />
                      <input
                        type="text"
                        placeholder="HH:MM"
                        className="input max-w-[7rem] text-center font-mono"
                        value={timePart(f.confirmReminderAt)}
                        onChange={(e) => setF((s) => ({ ...s, confirmReminderAt: `${dayPart(s.confirmReminderAt) || dayPart(s.dateStart)}T${e.target.value}` }))}
                      />
                      {f.confirmReminderAt && (
                        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setF((s) => ({ ...s, confirmReminderAt: '' }))}>Clear</button>
                      )}
                      <span className="text-xs text-fuselage-400">overrides the option above</span>
                    </div>
                  </details>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-fuselage-500 dark:text-fuselage-400">
            Bookings are instant: pilots are booked immediately with no confirmation step.
          </p>
        )}
        <div className="flex gap-2 pt-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary flex-1" disabled={save.isPending}>
            {save.isPending ? <Spinner /> : editing ? 'Save changes' : 'Create event'}
          </button>
        </div>
      </form>
      )}
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
    onError: (e) => toast.error(describeError(e)),
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
