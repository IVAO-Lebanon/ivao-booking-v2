import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MailWarning, Send, X, CalendarClock, Ban } from 'lucide-react';
import { api } from '../api/client';
import type { EmailApproval } from '../api/types';
import { Spinner } from './ui';
import { useToast } from './Toast';
import { describeError, fmtUtc } from '../lib/format';

const TYPE_META: Record<EmailApproval['type'], { label: string; icon: React.ReactNode }> = {
  'confirm-reminder': { label: 'Confirmation reminder', icon: <CalendarClock size={15} /> },
  cancelled: { label: 'Cancellation notice', icon: <Ban size={15} /> },
};

/**
 * Lists system emails waiting for admin approval and lets the admin send or
 * dismiss each. Nothing is emailed until "Approve & send" is clicked here.
 * `showEventLink` adds a link to the event (used on the global Dashboard).
 */
export function EmailApprovals({ items, showEventLink = false }: { items: EmailApproval[]; showEventLink?: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();

  const invalidate = (eventId: number) => {
    qc.invalidateQueries({ queryKey: ['email-approvals'] });
    qc.invalidateQueries({ queryKey: ['email-status', eventId] });
    qc.invalidateQueries({ queryKey: ['stats'] });
  };

  const approve = useMutation({
    mutationFn: (a: EmailApproval) => api.approveEmail(a.id),
    onSuccess: (r, a) => {
      invalidate(a.eventId);
      toast.success(`Sent ${r.sent}/${r.total}${r.failed ? ` · ${r.failed} failed` : ''}.`);
    },
    onError: (e) => toast.error(describeError(e)),
  });
  const dismiss = useMutation({
    mutationFn: (a: EmailApproval) => api.dismissEmail(a.id),
    onSuccess: (_r, a) => {
      invalidate(a.eventId);
      toast.success('Dismissed. No email was sent.');
    },
    onError: (e) => toast.error(describeError(e)),
  });

  if (items.length === 0) return null;
  const busy = approve.isPending || dismiss.isPending;

  return (
    <div className="rounded-lg border border-warning-300 bg-warning-50 p-3 dark:border-warning-900/50 dark:bg-warning-900/15">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-bold text-warning-800 dark:text-warning-200">
        <MailWarning size={16} /> Pending email approvals ({items.length})
      </div>
      <p className="mb-3 text-xs text-warning-700 dark:text-warning-300/90">
        The system will not send these until you approve them.
      </p>
      <div className="space-y-2">
        {items.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-md bg-white p-2.5 dark:bg-fuselage-900">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-warning-100 text-warning-700 dark:bg-warning-900/40 dark:text-warning-300">
              {TYPE_META[a.type].icon}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                {TYPE_META[a.type].label}
                {showEventLink ? (
                  <>
                    {' · '}
                    <Link to={`/admin/events/${a.eventId}/email`} className="text-atmos-600 hover:underline dark:text-atmos-400">
                      {a.eventName}
                    </Link>
                  </>
                ) : null}
              </div>
              <div className="text-xs text-fuselage-500">
                {a.audienceCount} pilot(s) · queued {fmtUtc(a.createdAt)}
              </div>
            </div>
            <div className="ml-auto flex gap-1.5">
              <button
                className="btn-primary px-3 py-1.5 text-xs"
                onClick={() => approve.mutate(a)}
                disabled={busy}
                title="Send this email now"
              >
                {approve.isPending ? <Spinner /> : <><Send size={13} /> Approve &amp; send</>}
              </button>
              <button
                className="btn-ghost px-2 py-1.5 text-xs text-fuselage-500 hover:bg-fuselage-100 dark:hover:bg-fuselage-800"
                onClick={() => dismiss.mutate(a)}
                disabled={busy}
                title="Dismiss without sending"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
