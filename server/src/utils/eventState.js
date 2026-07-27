import { config } from '../config.js';

function toDate(value) {
  if (!value) return null;
  const s = String(value);
  return new Date(s.replace(' ', 'T') + (s.includes('Z') ? '' : 'Z'));
}

function daysUntil(date) {
  const ms = date.getTime() - Date.now();
  return ms / 86_400_000;
}

/**
 * Computes derived scheduling flags for an event row (mirrors the original
 * Event model accessors: has_started, has_ended, can_confirm_slots, can_auto_book).
 */
export function eventState(event) {
  const start = toDate(event.dateStart);
  const end = toDate(event.dateEnd);
  const now = Date.now();

  const hasStarted = start ? start.getTime() <= now : false;
  const hasEnded = end ? end.getTime() <= now : false;
  const allowAfterStart = Boolean(event.allowBookingAfterStart);
  // Confirmation is the master switch: when off, bookings are instant (no Awaiting
  // step) and there is nothing to confirm.
  const requireConfirmation = event.requireConfirmation == null ? true : Boolean(Number(event.requireConfirmation));

  const HOUR = 3_600_000;
  // When the confirm window OPENS: this many hours before start (admin-tunable,
  // per event). Falls back to the global default (7 days) if unset.
  const opensHours = Number(event.confirmOpensHoursBefore || config.rules.confirmMaxDaysBefore * 24);
  const confirmOpensAt = requireConfirmation && start ? new Date(start.getTime() - opensHours * HOUR) : null;

  // The claim deadline: after (start - N hours) a still-unconfirmed slot may be
  // CLAIMED by another pilot. It is NOT freed and the holder can still confirm it.
  const deadlineHours = Number(event.confirmDeadlineHours || 0);
  const confirmDeadline =
    requireConfirmation && deadlineHours > 0 && start ? new Date(start.getTime() - deadlineHours * HOUR) : null;
  const pastConfirmDeadline = confirmDeadline ? now > confirmDeadline.getTime() : false;

  // The holder may confirm from when the window opens right up to the event (or,
  // if booking-after-start is allowed, until it ends). Passing the claim deadline
  // does NOT stop the holder confirming to secure their slot.
  let canConfirmSlots;
  if (!requireConfirmation) canConfirmSlots = false;
  else if (hasEnded) canConfirmSlots = false;
  else if (hasStarted && allowAfterStart) canConfirmSlots = true;
  else if (hasStarted) canConfirmSlots = false;
  else canConfirmSlots = confirmOpensAt ? now >= confirmOpensAt.getTime() : true;

  return {
    hasStarted,
    hasEnded,
    requireConfirmation,
    canConfirmSlots,
    pastConfirmDeadline,
    confirmOpensAt: confirmOpensAt ? confirmOpensAt.toISOString() : null,
    confirmDeadline: confirmDeadline ? confirmDeadline.toISOString() : null,
  };
}

/** Attaches derived flags to an event object for API responses. */
export function withEventState(event) {
  const state = eventState(event);
  // "In progress" is derived purely from time + status, so it updates on its own.
  const inProgress = event.status === 'scheduled' && state.hasStarted && !state.hasEnded;
  return { ...event, ...state, inProgress };
}
