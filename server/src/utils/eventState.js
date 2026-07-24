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

  let canConfirmSlots;
  if (hasEnded) canConfirmSlots = false;
  else if (hasStarted && allowAfterStart) canConfirmSlots = true;
  else if (hasStarted) canConfirmSlots = false;
  else canConfirmSlots = daysUntil(start) <= config.rules.confirmMaxDaysBefore;

  let canAutoBook = false;
  if (canConfirmSlots && start) {
    canAutoBook = daysUntil(start) <= config.rules.autoBookWithinDays;
  }

  return { hasStarted, hasEnded, canConfirmSlots, canAutoBook };
}

/** Attaches derived flags to an event object for API responses. */
export function withEventState(event) {
  const state = eventState(event);
  // "In progress" is derived purely from time + status, so it updates on its own.
  const inProgress = event.status === 'scheduled' && state.hasStarted && !state.hasEnded;
  return { ...event, ...state, inProgress };
}
