// Background job: finds events whose confirmation reminder is now due and QUEUES
// it for admin approval (row in email_approvals). It never sends: no email leaves
// the system without an admin approving it. Each event is queued once.
import { query } from '../db/pool.js';

/** Distinct unconfirmed (prebooked) pilots with an email, for the audience count. */
async function unconfirmedCount(eventId) {
  const rows = await query(
    `SELECT COUNT(DISTINCT u.id) c
       FROM slots s JOIN users u ON u.id = s.pilotId
      WHERE s.eventId = :e AND s.bookingStatus = 'prebooked' AND u.email IS NOT NULL AND u.email <> ''`,
    { e: eventId }
  );
  return rows[0]?.c || 0;
}

// Guards against overlapping ticks in the same process.
let running = false;

/** Queues a pending approval for every event whose confirm reminder is now due. */
export async function queueDueConfirmReminders() {
  if (running) return;
  running = true;
  try {
    const due = await query(
      `SELECT id, eventName FROM events e
        WHERE e.status = 'scheduled'
          AND e.requireConfirmation = 1
          AND e.dateStart > UTC_TIMESTAMP()
          AND (e.confirmReminderAt IS NOT NULL OR e.confirmReminderHoursBefore > 0)
          AND COALESCE(e.confirmReminderAt, DATE_SUB(e.dateStart, INTERVAL e.confirmReminderHoursBefore HOUR)) <= UTC_TIMESTAMP()
          AND NOT EXISTS (
            SELECT 1 FROM event_emails ee
             WHERE ee.eventId = e.id AND ee.type = 'confirm-reminder' AND ee.onceKey = 'auto'
          )
          AND NOT EXISTS (
            SELECT 1 FROM email_approvals ea
             WHERE ea.eventId = e.id AND ea.type = 'confirm-reminder'
          )`
    );
    for (const event of due) {
      const n = await unconfirmedCount(event.id);
      if (n === 0) {
        // Nobody left to remind: drop a done-marker so we stop re-checking this event.
        await query(
          `INSERT INTO event_emails (eventId, type, onceKey, subject, sentBy, recipients, sent, failed)
           VALUES (:e, 'confirm-reminder', 'auto', :s, NULL, 0, 0, 0)`,
          { e: event.id, s: `Confirm reminder: ${event.eventName}`.slice(0, 250) }
        ).catch(() => {});
      } else {
        await query(
          "INSERT INTO email_approvals (eventId, type, audienceCount, status) VALUES (:e, 'confirm-reminder', :n, 'pending')",
          { e: event.id, n }
        );
        // eslint-disable-next-line no-console
        console.log(`📥 Queued confirm reminder for "${event.eventName}" (${n} pilot(s)) for admin approval.`);
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('confirm-reminder queue job failed:', err.message);
  } finally {
    running = false;
  }
}
