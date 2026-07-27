import { useState } from 'react';
import { Checkbox } from '@ivao/atmosphere-react';
import { AlertTriangle } from 'lucide-react';
import { Spinner } from './ui';
import type { ReconcileSummary } from '../api/types';

/** "+1d 2h 30m" style label for a signed minute delta. */
function humanDelta(mins: number): string {
  const sign = mins >= 0 ? '+' : '-';
  const a = Math.abs(mins);
  const d = Math.floor(a / 1440);
  const h = Math.floor((a % 1440) / 60);
  const m = a % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  return sign + (parts.join(' ') || '0m');
}

/**
 * Shown inside the event editor when a save would affect EXISTING bookings.
 * Lists the side effects, lets the admin choose whether to shift slot times to
 * follow a moved event, and confirms before anything is written.
 */
export function ReconcileDialog({
  summary,
  onCancel,
  onApply,
  pending,
}: {
  summary: ReconcileSummary;
  onCancel: () => void;
  onApply: (shiftSlots: boolean) => void;
  pending: boolean;
}) {
  const [shift, setShift] = useState(true);

  const items: string[] = [];
  if (summary.confirmPending > 0)
    items.push(`${summary.confirmPending} booking(s) awaiting confirmation will be confirmed immediately.`);
  if (summary.cancelNotify > 0)
    items.push(`${summary.cancelNotify} pilot(s) with a booking will be emailed that the event is cancelled.`);
  if (summary.overLimit > 0)
    items.push(
      `${summary.overLimit} pilot(s) already hold more bookings than the new limit; they keep them and the limit applies to new bookings only.`
    );
  if (summary.reminderRearm)
    items.push('The confirmation reminder will be re-armed so it can send again on the new schedule.');

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md bg-warning-50 p-3 text-sm text-warning-800 dark:bg-warning-900/20 dark:text-warning-200">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
        <div>These changes affect existing bookings. Please review before saving.</div>
      </div>

      {items.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-fuselage-600 dark:text-fuselage-300">
          {items.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}

      {summary.dateShift && (
        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-fuselage-150 p-3 text-sm dark:border-fuselage-700">
          <Checkbox checked={shift} onCheckedChange={(v) => setShift(v === true)} className="mt-0.5" />
          <span>
            Shift all {summary.dateShift.timedSlots} slot time(s) by {humanDelta(summary.dateShift.deltaMinutes)} so
            they follow the new event time.
            <span className="mt-0.5 block text-xs text-fuselage-400">
              Leave unchecked to keep slot times exactly where they are.
            </span>
          </span>
        </label>
      )}

      <div className="flex gap-2 pt-1">
        <button type="button" className="btn-secondary flex-1" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary flex-1"
          onClick={() => onApply(summary.dateShift ? shift : false)}
          disabled={pending}
        >
          {pending ? <Spinner /> : 'Apply changes'}
        </button>
      </div>
    </div>
  );
}
