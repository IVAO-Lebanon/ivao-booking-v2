import { CSSProperties, FormEvent, useState } from 'react';
import { Plane, Trash2, Pencil, Lock, LockOpen, Clock, X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../api/client';
import type { EventModel, Slot } from '../api/types';
import { StatusBadge, statusRail, Modal, Spinner } from './ui';
import { FlightDetailModal } from './FlightDetailModal';
import { liveStatus, LiveFlightChip } from './LiveEventBoard';
import type { LiveFlight } from '../api/types';
import { useToast } from './Toast';
import { useConfirm } from './Confirm';
import { useAuth } from '../auth/AuthContext';
import { AirlineLogo } from './AirlineLogo';
import { friendlyError, fmtTimeUtc, fmtDateUtc } from '../lib/format';

function Route({ slot }: { slot: Slot }) {
  return (
    <div className="flex items-center gap-2 font-mono text-sm font-semibold">
      <span className={slot.origin ? '' : 'text-fuselage-400'}>{slot.origin || '····'}</span>
      <Plane size={14} className="rotate-90 text-atmos-500" aria-hidden />
      <span className={slot.destination ? '' : 'text-fuselage-400'}>{slot.destination || '····'}</span>
    </div>
  );
}

/** MySQL "YYYY-MM-DD HH:mm:ss" (UTC) → value for <input datetime-local>. */
function toLocalInput(v?: string | null): string {
  if (!v) return '';
  return v.replace(' ', 'T').slice(0, 16);
}

// Admin editor for a single slot. Sends the whole slot definition to PUT /slot/:id.
function EditSlotModal({ event, slot, onClose }: { event: EventModel; slot: Slot; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState({
    flightNumber: slot.flightNumber || '',
    origin: slot.origin || '',
    destination: slot.destination || '',
    aircraft: slot.aircraft || '',
    gate: slot.gate || '',
    slotTime: toLocalInput(slot.slotTime),
    isPrivate: slot.isPrivate,
  });

  const save = useMutation({
    mutationFn: () =>
      api.updateSlot(slot.id, {
        flightNumber: f.flightNumber || null,
        origin: f.origin || null,
        destination: f.destination || null,
        aircraft: f.aircraft || null,
        gate: f.gate || null,
        slotTime: f.slotTime || null,
        isPrivate: f.isPrivate,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['slots', event.id] });
      qc.invalidateQueries({ queryKey: ['slot-counts', event.id] });
      toast.success('Slot updated.');
      onClose();
    },
    onError: (e) => toast.error(friendlyError(apiErrorMessage(e))),
  });

  const up = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((s) => ({ ...s, [k]: e.target.value.toUpperCase() }));

  return (
    <Modal open onClose={onClose} title={`Edit slot${slot.flightNumber ? ` · ${slot.flightNumber}` : ''}`}>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }} className="space-y-3">
        <p className="rounded-lg bg-fuselage-100 px-3 py-2 text-xs text-fuselage-500 dark:bg-fuselage-800">
          A filled field is <b>fixed</b> (staff-set); an empty field stays pilot-fillable.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Flight #</label>
            <input className="input font-mono uppercase" value={f.flightNumber} onChange={up('flightNumber')} placeholder="ABC123" />
          </div>
          <div>
            <label className="label">Aircraft</label>
            <input className="input font-mono uppercase" value={f.aircraft} onChange={up('aircraft')} placeholder="A320" />
          </div>
          <div>
            <label className="label">Origin</label>
            <input className="input font-mono uppercase" value={f.origin} onChange={up('origin')} placeholder="EGLL" />
          </div>
          <div>
            <label className="label">Destination</label>
            <input className="input font-mono uppercase" value={f.destination} onChange={up('destination')} placeholder="LFPG" />
          </div>
          <div>
            <label className="label">Gate</label>
            <input className="input font-mono uppercase" value={f.gate} onChange={up('gate')} placeholder="B4" />
          </div>
          <div>
            <label className="label">Slot time (UTC)</label>
            <input type="datetime-local" className="input" value={f.slotTime} onChange={(e) => setF((s) => ({ ...s, slotTime: e.target.value }))} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.isPrivate} onChange={(e) => setF((s) => ({ ...s, isPrivate: e.target.checked }))} />
          Private slot
        </label>
        <div className="flex gap-2 pt-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex-1" disabled={save.isPending}>{save.isPending ? <Spinner /> : 'Save changes'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function SlotList({
  event,
  slots,
  onBook,
  isAdmin = false,
  manageMode = false,
  live,
}: {
  event: EventModel;
  slots: Slot[];
  onBook: (slot: Slot) => void;
  isAdmin?: boolean;
  /** Admin management view: hide pilot booking actions, show only staff tools. */
  manageMode?: boolean;
  /** Live Whazzup status keyed by flight number (shown while the event is in progress). */
  live?: Record<string, LiveFlight>;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const askConfirm = useConfirm();
  const qc = useQueryClient();

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<Slot | null>(null);
  const [detail, setDetail] = useState<Slot | null>(null);
  const [shiftMin, setShiftMin] = useState('15');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['slots', event.id] });
    qc.invalidateQueries({ queryKey: ['my-slots', event.id] });
    qc.invalidateQueries({ queryKey: ['slot-counts', event.id] });
    qc.invalidateQueries({ queryKey: ['overlapping', event.id] });
  };

  const cancel = useMutation({
    mutationFn: (id: number) => api.cancel(id),
    onSuccess: () => { invalidate(); toast.success('Booking cancelled.'); },
    onError: (e) => toast.error(friendlyError(apiErrorMessage(e))),
  });
  const confirm = useMutation({
    mutationFn: (id: number) => api.confirm(id),
    onSuccess: () => { invalidate(); toast.success('Slot confirmed!'); },
    onError: (e) => toast.error(friendlyError(apiErrorMessage(e))),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteSlot(id),
    onSuccess: () => { invalidate(); toast.success('Slot deleted.'); },
    onError: (e) => toast.error(friendlyError(apiErrorMessage(e))),
  });
  const bulk = useMutation({
    mutationFn: (body: { action: string; ids: number[]; minutes?: number }) => api.bulkSlots(event.id, body),
    onSuccess: (r) => { invalidate(); setSelected(new Set()); toast.success(`Updated ${r.affected} slot${r.affected === 1 ? '' : 's'}.`); },
    onError: (e) => toast.error(friendlyError(apiErrorMessage(e))),
  });

  const busy = cancel.isPending || confirm.isPending || remove.isPending || bulk.isPending;

  const ids = slots.map((s) => s.id);
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(ids));

  const runBulk = async (action: string, minutes?: number) => {
    const list = [...selected];
    if (list.length === 0) return;
    if (action === 'delete' || action === 'free') {
      const ok = await askConfirm({
        title: action === 'delete' ? `Delete ${list.length} slots?` : `Free up ${list.length} slots?`,
        message:
          action === 'delete'
            ? 'The selected slots will be permanently removed, along with any bookings on them.'
            : 'Any pilot bookings on the selected slots will be cancelled and the slots reopened.',
        confirmLabel: action === 'delete' ? 'Delete slots' : 'Free up slots',
        danger: action === 'delete',
      });
      if (!ok) return;
    }
    bulk.mutate({ action, ids: list, minutes });
  };

  function actionsFor(slot: Slot) {
    const isOwner = slot.pilotId != null && user?.id === slot.pilotId;
    const canBook = slot.bookingStatus === 'free' && !event.hasEnded && event.status === 'scheduled';
    return (
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {!manageMode && canBook && (
          <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => onBook(slot)} disabled={busy}>
            Book
          </button>
        )}
        {!manageMode && isOwner && slot.bookingStatus === 'prebooked' && event.canConfirmSlots && (
          <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => confirm.mutate(slot.id)} disabled={busy}>
            Confirm
          </button>
        )}
        {!manageMode && isOwner && slot.bookingStatus !== 'free' && (
          <button
            className="btn-ghost px-3 py-1.5 text-xs text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-900/20"
            onClick={() => cancel.mutate(slot.id)}
            disabled={busy}
          >
            Cancel
          </button>
        )}
        {isAdmin && (
          <>
            <button
              className="btn-ghost px-2 py-1.5 text-xs"
              title="Edit slot"
              onClick={() => setEditing(slot)}
              disabled={busy}
            >
              <Pencil size={15} />
            </button>
            <button
              className="btn-ghost px-2 py-1.5 text-xs text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20"
              title="Delete slot"
              onClick={async () => {
                if (await askConfirm({ title: 'Delete this slot?', message: 'The slot will be removed permanently. Any booking on it is cancelled.', confirmLabel: 'Delete slot' }))
                  remove.mutate(slot.id);
              }}
              disabled={busy}
            >
              <Trash2 size={15} />
            </button>
          </>
        )}
      </div>
    );
  }

  if (slots.length === 0) {
    return <p className="py-10 text-center text-sm text-fuselage-500">No slots match your filters.</p>;
  }

  return (
    <div className="space-y-2">
      {/* Admin bulk action bar */}
      {isAdmin && selected.size > 0 && (
        <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-atmos-200 bg-atmos-50 px-3 py-2 shadow-sm dark:border-atmos-900/60 dark:bg-atmos-900/30">
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-atmos-700 dark:text-atmos-300">
            {selected.size} selected
          </span>
          <button className="btn-secondary px-2.5 py-1 text-xs" onClick={() => runBulk('setPrivate')} disabled={busy}>
            <Lock size={13} /> Private
          </button>
          <button className="btn-secondary px-2.5 py-1 text-xs" onClick={() => runBulk('setPublic')} disabled={busy}>
            <LockOpen size={13} /> Public
          </button>
          <button className="btn-secondary px-2.5 py-1 text-xs" onClick={() => runBulk('free')} disabled={busy}>
            Free up
          </button>
          <div className="flex items-center gap-1">
            <input
              type="number"
              className="input w-16 px-2 py-1 text-xs"
              value={shiftMin}
              onChange={(e) => setShiftMin(e.target.value)}
              aria-label="Shift minutes"
            />
            <button className="btn-secondary px-2.5 py-1 text-xs" onClick={() => runBulk('shift', Number(shiftMin))} disabled={busy || !Number.isFinite(Number(shiftMin))}>
              <Clock size={13} /> Shift
            </button>
          </div>
          <button className="btn-danger px-2.5 py-1 text-xs" onClick={() => runBulk('delete')} disabled={busy}>
            <Trash2 size={13} /> Delete
          </button>
          <button className="btn-ghost ml-auto px-2 py-1 text-xs" onClick={() => setSelected(new Set())} title="Clear selection">
            <X size={15} />
          </button>
        </div>
      )}

      {/* Board column header (desktop) */}
      <div className="hidden grid-cols-12 gap-3 px-4 pb-1 font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-fuselage-400 md:grid">
        <div className="col-span-2 flex items-center gap-2">
          {isAdmin && (
            <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all slots" className="cursor-pointer" />
          )}
          Callsign
        </div>
        <div className="col-span-3">Route</div>
        <div className="col-span-2">Time (Z)</div>
        <div className="col-span-2">Aircraft · Gate</div>
        <div className="col-span-3 text-right">Status</div>
      </div>

      {slots.map((slot) => (
        <div
          key={slot.id}
          className={`strip grid-cols-2 gap-x-3 gap-y-2 p-3 md:grid-cols-12 md:items-center md:py-2.5 ${
            selected.has(slot.id) ? 'ring-2 ring-atmos-400' : ''
          }`}
          style={{ ['--rail' as keyof CSSProperties]: statusRail(slot.bookingStatus) } as CSSProperties}
        >
          {/* Callsign (+ admin select) */}
          <div className="flex items-center gap-2 md:col-span-2">
            {isAdmin && (
              <input
                type="checkbox"
                checked={selected.has(slot.id)}
                onChange={() => toggle(slot.id)}
                aria-label={`Select slot ${slot.flightNumber || slot.id}`}
                className="cursor-pointer"
              />
            )}
            <AirlineLogo flightNumber={slot.flightNumber} className="h-5 max-w-[44px]" />
            <div>
              <button
                type="button"
                onClick={() => setDetail(slot)}
                className="font-mono text-base font-bold tracking-tight hover:text-atmos-600 hover:underline dark:hover:text-atmos-400"
                title="View flight details, route map & weather"
              >
                {slot.flightNumber || 'N/A'}
              </button>
              {slot.isPrivate && (
                <span className="mt-0.5 block rounded bg-warning-100 px-1 text-[10px] font-bold uppercase tracking-wide text-warning-700 dark:bg-warning-900/30 dark:text-warning-300 w-fit">
                  Private
                </span>
              )}
            </div>
          </div>

          {/* Route */}
          <button
            type="button"
            onClick={() => setDetail(slot)}
            className="text-right md:col-span-3 md:text-left"
            title="View flight details, route map & weather"
          >
            <Route slot={slot} />
          </button>

          {/* Time */}
          <div className="md:col-span-2">
            <div className="font-mono text-sm font-bold">{fmtTimeUtc(slot.slotTime)}</div>
            <div className="font-mono text-[11px] text-fuselage-400">{fmtDateUtc(slot.slotTime)}</div>
          </div>

          {/* Aircraft · Gate */}
          <div className="text-right md:col-span-2 md:text-left">
            <span className="font-mono text-sm">{slot.aircraft || 'N/A'}</span>
            {slot.gate && <span className="ml-1 font-mono text-xs text-fuselage-400">· {slot.gate}</span>}
          </div>

          {/* Status + actions */}
          <div className="col-span-2 flex items-center justify-between gap-2 border-t border-fuselage-100 pt-2 md:col-span-3 md:border-0 md:pt-0 dark:border-fuselage-800">
            <div className="flex flex-col items-start gap-1">
              <StatusBadge status={slot.bookingStatus} />
              {(() => {
                const ls = slot.flightNumber ? liveStatus(live?.[slot.flightNumber]) : null;
                return ls && ls.tone !== 'muted' ? <LiveFlightChip status={ls} /> : null;
              })()}
              {slot.owner && <span className="font-mono text-[11px] text-fuselage-400">{slot.owner.vid}</span>}
            </div>
            {actionsFor(slot)}
          </div>
        </div>
      ))}

      {editing && <EditSlotModal event={event} slot={editing} onClose={() => setEditing(null)} />}
      {detail && <FlightDetailModal slot={detail} event={event} onClose={() => setDetail(null)} />}
    </div>
  );
}
