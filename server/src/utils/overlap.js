// Real slot-overlap detection (the original always returned false — this is the fix).
//
// A pilot cannot be in two places at once. We treat each booked slot as a time
// window [slotTime, slotTime + estimatedBlockMinutes]. Two windows overlap when
// one starts before the other ends. If a slot has no time we fall back to a
// conservative default block so same-event double-bookings are still caught.

const DEFAULT_BLOCK_MINUTES = 90;

function toDate(value) {
  if (!value) return null;
  const d = new Date(String(value).replace(' ', 'T') + (String(value).includes('Z') ? '' : 'Z'));
  return Number.isNaN(d.getTime()) ? null : d;
}

function windowFor(slot, blockMinutes = DEFAULT_BLOCK_MINUTES) {
  const start = toDate(slot.slotTime);
  if (!start) return null;
  const end = new Date(start.getTime() + blockMinutes * 60_000);
  return { start, end };
}

/**
 * @returns {boolean} true when the two slots overlap in time for the same pilot.
 */
export function slotsOverlap(a, b, blockMinutes = DEFAULT_BLOCK_MINUTES) {
  if (!a || !b || a.id === b.id) return false;

  const wa = windowFor(a, blockMinutes);
  const wb = windowFor(b, blockMinutes);

  // If either has no scheduled time, only flag as overlapping within the same event.
  if (!wa || !wb) return String(a.eventId) === String(b.eventId);

  return wa.start < wb.end && wb.start < wa.end;
}

/**
 * Given a candidate slot and a list of the pilot's other booked slots, return the
 * first one it conflicts with (or null).
 */
export function findConflict(candidate, otherSlots, blockMinutes = DEFAULT_BLOCK_MINUTES) {
  for (const other of otherSlots) {
    if (slotsOverlap(candidate, other, blockMinutes)) return other;
  }
  return null;
}
