import { FormEvent, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage, BookPayload } from '../api/client';
import type { EventModel, Slot } from '../api/types';
import { Modal, Spinner } from './ui';
import { useToast } from './Toast';
import { friendlyError, fmtUtc } from '../lib/format';

/** Converts a datetime-local value (local wall time) to a UTC "YYYY-MM-DD HH:mm:ss". */
function localInputToUtc(value: string): string {
  // datetime-local has no timezone; we treat the entered value as UTC (Zulu) to match ops.
  return value.replace('T', ' ') + ':00';
}

export function BookSlotModal({
  slot,
  event,
  onClose,
}: {
  slot: Slot | null;
  event: EventModel;
  onClose: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<BookPayload>({});

  const mutation = useMutation({
    mutationFn: (payload: BookPayload) => api.book(slot!.id, payload),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['slots', event.id] });
      qc.invalidateQueries({ queryKey: ['my-slots', event.id] });
      qc.invalidateQueries({ queryKey: ['slot-counts', event.id] });
      toast.success(updated.bookingStatus === 'booked' ? 'Slot booked!' : 'Slot pre-booked. Confirm closer to the event.');
      onClose();
    },
    onError: (err) => toast.error(friendlyError(apiErrorMessage(err))),
  });

  if (!slot) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const payload: BookPayload = {};
    if (!slot.isFixedFlightNumber) payload.flightNumber = (form.flightNumber || '').toUpperCase();
    if (!slot.isFixedOrigin) payload.origin = (form.origin || '').toUpperCase();
    if (!slot.isFixedDestination) payload.destination = (form.destination || '').toUpperCase();
    if (!slot.isFixedAircraft) payload.aircraft = (form.aircraft || '').toUpperCase();
    if (!slot.isFixedSlotTime && form.slotTime) payload.slotTime = localInputToUtc(form.slotTime);
    if (form.gate) payload.gate = form.gate.toUpperCase();
    if (form.route) payload.route = form.route;
    mutation.mutate(payload);
  };

  const field = (
    key: keyof BookPayload,
    label: string,
    placeholder: string,
    fixed: boolean,
    fixedValue: string | null,
    required = false
  ) => (
    <div>
      <label className="label">
        {label}
        {required && <span className="ml-0.5 text-danger-500">*</span>}
      </label>
      {fixed ? (
        <div className="input flex items-center bg-fuselage-50 font-mono text-fuselage-500 dark:bg-fuselage-800/60">
          {fixedValue || 'N/A'} <span className="ml-auto text-[10px] uppercase text-fuselage-400">fixed</span>
        </div>
      ) : (
        <input
          className="input font-mono uppercase"
          placeholder={placeholder}
          value={(form[key] as string) || ''}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          required={required}
        />
      )}
    </div>
  );

  return (
    <Modal open onClose={onClose} title="Book this slot">
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-lg bg-atmos-50 px-3 py-2 text-sm text-atmos-800 dark:bg-atmos-900/30 dark:text-atmos-200">
          {event.eventName} · fields marked <span className="font-bold text-danger-500">*</span> are required. Empty fields are yours to choose; “fixed” fields are set by staff.
        </div>

        {event.bookingMessage && (
          <div className="flex gap-2 rounded-lg border border-warning-300 bg-warning-50 px-3 py-2 text-sm text-warning-800 dark:border-warning-900/50 dark:bg-warning-900/20 dark:text-warning-200">
            <Megaphone size={16} className="mt-0.5 shrink-0" aria-hidden />
            <p className="whitespace-pre-wrap">{event.bookingMessage}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {field('flightNumber', 'Flight number', 'ABC123', slot.isFixedFlightNumber, slot.flightNumber, true)}
          {field('aircraft', 'Aircraft (ICAO)', 'A320', slot.isFixedAircraft, slot.aircraft)}
          {field('origin', 'Origin (ICAO)', 'EGLL', slot.isFixedOrigin, slot.origin, true)}
          {field('destination', 'Destination (ICAO)', 'LFPG', slot.isFixedDestination, slot.destination, true)}
        </div>

        <div>
          <label className="label">
            Slot time (UTC)<span className="ml-0.5 text-danger-500">*</span>
          </label>
          {slot.isFixedSlotTime ? (
            <div className="input flex items-center bg-fuselage-50 text-fuselage-500 dark:bg-fuselage-800/60">
              {fmtUtc(slot.slotTime)} <span className="ml-auto text-[10px] uppercase text-fuselage-400">fixed</span>
            </div>
          ) : (
            <input
              type="datetime-local"
              className="input"
              value={form.slotTime || ''}
              onChange={(e) => setForm((f) => ({ ...f, slotTime: e.target.value }))}
            />
          )}
        </div>

        <div>
          <label className="label">Gate (optional)</label>
          <input
            className="input font-mono uppercase"
            placeholder={slot.gate || 'A1'}
            value={form.gate || ''}
            onChange={(e) => setForm((f) => ({ ...f, gate: e.target.value }))}
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary flex-1" disabled={mutation.isPending}>
            {mutation.isPending ? <Spinner /> : 'Confirm booking'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
