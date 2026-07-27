import { useEffect, useRef, useState } from 'react';
import { Mail, Megaphone, Bell, Send, TriangleAlert, CalendarClock, Ban, Check, X, ChevronDown, ChevronRight, FlaskConical, Users } from 'lucide-react';
import { Switch, Select } from '@ivao/atmosphere-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { EmailFields, EmailStatus, EmailLogEntry, EmailType, EventModel } from '../api/types';
import { Modal, Spinner } from './ui';
import { useToast } from './Toast';
import { describeError, fmtUtc } from '../lib/format';

// The four email types. Each is admin-sent, re-sendable, and computed from live
// bookings when sent. Only the announcement lets the admin choose the audience.
const MODE_META: Record<EmailType, { label: string; title: string; icon: React.ReactNode; audience: (s: EmailStatus) => string; pickAudience: boolean }> = {
  reminder: { label: 'Reminder', title: 'Reminder to pilots who booked', icon: <Bell size={14} />, audience: (s) => `${s.participantCount} pilot(s) who booked`, pickAudience: false },
  confirmReminder: { label: 'Confirm reminder', title: 'Reminder to confirm booking', icon: <CalendarClock size={14} />, audience: (s) => `${s.unconfirmedCount} pilot(s) awaiting confirmation`, pickAudience: false },
  notam: { label: 'Announcement', title: 'Announcement (NOTAM)', icon: <Megaphone size={14} />, audience: (s) => `${s.participantCount} participant(s)`, pickAudience: true },
  cancellation: { label: 'Cancellation', title: 'Cancellation notice', icon: <Ban size={14} />, audience: (s) => `${s.participantCount} pilot(s) who booked`, pickAudience: false },
};

function Composer({ event, mode, status, onClose }: { event: EventModel; mode: EmailType; status: EmailStatus; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const msgRef = useRef<HTMLTextAreaElement>(null);
  const [f, setF] = useState<EmailFields>(() => ({ ...status.defaults[mode] }));
  const set = <K extends keyof EmailFields>(k: K, v: EmailFields[K]) => setF((p) => ({ ...p, [k]: v }));
  const [preview, setPreview] = useState('');

  // Live preview, debounced, re-rendered whenever any field changes.
  useEffect(() => {
    const t = setTimeout(() => {
      api.emailPreview(event.id, { type: mode, ...f }).then((r) => setPreview(r.html)).catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [event.id, mode, f]);

  const insertToMessage = (token: string) => {
    const el = msgRef.current;
    const msg = f.message || '';
    if (!el) return set('message', msg + token);
    const start = el.selectionStart ?? msg.length;
    const end = el.selectionEnd ?? msg.length;
    set('message', msg.slice(0, start) + token + msg.slice(end));
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = start + token.length; });
  };

  // Only the announcement (NOTAM) lets the admin pick who receives it.
  const [audience, setAudience] = useState<'participants' | 'booked' | 'unconfirmed'>('participants');
  const [vid, setVid] = useState('');
  const meta = MODE_META[mode];

  const send = useMutation({
    mutationFn: () =>
      api.sendEmail(event.id, meta.pickAudience ? { type: mode, ...f, audience, vid: vid.trim() || undefined } : { type: mode, ...f }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['email-status', event.id] });
      toast.success(`Sent ${r.sent}/${r.total}${r.failed ? ` · ${r.failed} failed` : ''}.`);
      onClose();
    },
    onError: (e) => toast.error(describeError(e)),
  });

  const sendTest = useMutation({
    mutationFn: () => api.sendTestEmail(event.id, { type: mode, ...f }),
    onSuccess: (r) => toast.success(`Test email sent to ${r.to}.`),
    onError: (e) => toast.error(describeError(e)),
  });

  const [showAdvanced, setShowAdvanced] = useState(false);
  const audienceCount = !meta.pickAudience
    ? undefined
    : audience === 'booked'
      ? Math.max(0, status.participantCount - status.unconfirmedCount)
      : audience === 'unconfirmed'
        ? status.unconfirmedCount
        : status.participantCount;

  const field = (k: keyof EmailFields, label: string, placeholder = '') => (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={(f[k] as string) ?? ''} onChange={(e) => set(k, e.target.value as EmailFields[typeof k])} placeholder={placeholder} />
    </div>
  );
  const toggle = (k: keyof EmailFields, label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <Switch checked={Boolean(f[k])} onCheckedChange={(v) => set(k, v as EmailFields[typeof k])} />
      {label}
    </label>
  );

  return (
    <Modal open onClose={onClose} title={meta.title} maxWidth="max-w-5xl">
      <div className="space-y-3">
        {!status.configured && (
          <div className="flex items-center gap-2 rounded-lg border border-warning-300 bg-warning-50 px-3 py-2 text-xs text-warning-800 dark:border-warning-900/50 dark:bg-warning-900/20 dark:text-warning-200">
            <TriangleAlert size={14} /> SMTP is not configured, so this is preview mode. Messages are simulated, not delivered.
          </div>
        )}
        <p className="text-xs text-fuselage-500">
          Recipients: <b>{meta.pickAudience ? `${audienceCount} pilot(s)${vid ? ` · VID ${vid}` : ''}` : meta.audience(status)}</b>
          {' · '}computed when you send · can be sent again any time
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Editor */}
          <div className="max-h-[460px] space-y-3 overflow-y-auto scroll-thin pr-1">
            {field('subject', 'Subject', '{{eventName}}')}

            {meta.pickAudience && (
              <div className="space-y-2 rounded-lg border border-fuselage-200 p-3 dark:border-fuselage-700">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-fuselage-400">
                  <Users size={13} /> Audience
                </div>
                <Select
                  position="popper"
                  value={audience}
                  onValueChange={(v) => setAudience(v as typeof audience)}
                  items={[
                    { value: 'participants', label: `All participants (${status.participantCount})` },
                    { value: 'booked', label: `Confirmed only (${Math.max(0, status.participantCount - status.unconfirmedCount)})` },
                    { value: 'unconfirmed', label: `Awaiting confirmation (${status.unconfirmedCount})` },
                  ]}
                />
                <input className="input font-mono" placeholder="Only this VID (optional)" value={vid} onChange={(e) => setVid(e.target.value.replace(/[^0-9]/g, ''))} />
              </div>
            )}

            <div>
              <label className="label">Message</label>
              <textarea ref={msgRef} className="input min-h-[140px] text-sm leading-relaxed" value={f.message} onChange={(e) => set('message', e.target.value)}
                placeholder="Plain text. Leave a blank line to start a new paragraph." />
            </div>

            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-fuselage-400">Insert live value</div>
              <div className="flex flex-wrap gap-1">
                {status.placeholders.map((p) => (
                  <button key={p.key} type="button" title={`{{${p.key}}}`} onClick={() => insertToMessage(`{{${p.key}}}`)}
                    className="rounded bg-fuselage-100 px-1.5 py-0.5 font-mono text-[11px] text-fuselage-600 hover:bg-atmos-100 hover:text-atmos-700 dark:bg-fuselage-800 dark:text-fuselage-300">
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-fuselage-400">Include in email</div>
              <div className="flex flex-wrap gap-4 rounded-lg bg-fuselage-50 p-3 dark:bg-fuselage-800/50">
                {toggle('showFlightCard', "Pilot's flight card")}
                {toggle('showEventStrip', 'Event date & time')}
                {toggle('ctaShow', 'Link button')}
              </div>
            </div>
            {f.ctaShow && (
              <div className="grid grid-cols-2 gap-3">
                {field('ctaLabel', 'Button label', 'View event')}
                {field('ctaUrl', 'Button link', 'Blank = links to the event page')}
              </div>
            )}

            <div className="rounded-lg border border-fuselage-200 dark:border-fuselage-700">
              <button type="button" onClick={() => setShowAdvanced((v) => !v)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-fuselage-500 hover:bg-fuselage-50 dark:hover:bg-fuselage-800/50">
                {showAdvanced ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Advanced (header tag, heading, greeting)
              </button>
              {showAdvanced && (
                <div className="space-y-3 border-t border-fuselage-100 p-3 dark:border-fuselage-800">
                  <div className="grid grid-cols-2 gap-3">
                    {field('headerTag', 'Header tag', 'Events')}
                    {field('label', 'Eyebrow label', 'Event NOTAM')}
                  </div>
                  {field('title', 'Heading', '{{eventName}}')}
                  {field('greeting', 'Greeting', 'Dear {{pilotName}},')}
                  {field('footerNote', 'Footer note (optional)', 'e.g. Questions? Reply to this email.')}
                </div>
              )}
            </div>
          </div>

          {/* Live preview */}
          <div>
            <div className="mb-1 flex items-center gap-1.5 eyebrow">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success-500" /> Live preview
            </div>
            <iframe title="Email preview" srcDoc={preview || '<p style="font-family:sans-serif;color:#888;padding:20px">Rendering…</p>'}
              className="h-[460px] w-full rounded-lg border border-fuselage-200 bg-white dark:border-fuselage-700" />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button className="btn-secondary" onClick={() => sendTest.mutate()} disabled={sendTest.isPending} title="Send one copy to your own email">
            {sendTest.isPending ? <Spinner /> : <><FlaskConical size={15} /> Send test to me</>}
          </button>
          <button className="btn-primary ml-auto" onClick={() => send.mutate()} disabled={send.isPending || (meta.pickAudience && audienceCount === 0)}>
            {send.isPending ? <Spinner /> : <><Send size={15} /> Send{meta.pickAudience ? ` to ${audienceCount} pilot(s)` : ''}</>}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// "Sam Rivera" -> "Sam R." (keep first name, abbreviate the surname).
function abbrevName(full: string): string {
  const parts = (full || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  return `${parts.slice(0, -1).join(' ')} ${last[0].toUpperCase()}.`;
}

// One sent-email row in the log, expandable to show who it went to + delivery status.
function LogRow({ eventId, entry }: { eventId: number; entry: EmailLogEntry }) {
  const [open, setOpen] = useState(false);
  const { data: recipients, isLoading } = useQuery({
    queryKey: ['email-recipients', eventId, entry.id],
    queryFn: () => api.emailRecipients(eventId, entry.id),
    enabled: open,
  });
  return (
    <div className="rounded-md border border-fuselage-100 dark:border-fuselage-800">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[11px] hover:bg-fuselage-50 dark:hover:bg-fuselage-800/50"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="font-mono font-semibold text-fuselage-600 dark:text-fuselage-300">{entry.type}</span>
        <span className="text-fuselage-500 dark:text-fuselage-400">
          {entry.sent}/{entry.recipients} sent{entry.failed ? ` · ${entry.failed} failed` : ''}
        </span>
        <span className="ml-auto text-fuselage-400">{fmtUtc(entry.createdAt)}</span>
      </button>
      {open && (
        <div className="border-t border-fuselage-100 px-2 py-1.5 dark:border-fuselage-800">
          {isLoading ? (
            <p className="text-[11px] text-fuselage-400">Loading recipients…</p>
          ) : !recipients || recipients.length === 0 ? (
            <p className="text-[11px] text-fuselage-400">No per-recipient detail recorded for this send.</p>
          ) : (
            <ul className="space-y-0.5">
              {recipients.map((r, i) => (
                <li key={i} className="flex items-center gap-2 text-[11px]">
                  {r.ok ? <Check size={12} className="shrink-0 text-success-600" /> : <X size={12} className="shrink-0 text-danger-500" />}
                  <span className="text-fuselage-700 dark:text-fuselage-200">{abbrevName(r.name) || `VID ${r.vid}`}</span>
                  {r.vid && <span className="font-mono text-fuselage-400">{r.vid}</span>}
                  {!r.ok && r.error && <span className="text-danger-500">- {r.error}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function EmailPanel({ event }: { event: EventModel }) {
  const { data: status, isLoading } = useQuery({ queryKey: ['email-status', event.id], queryFn: () => api.emailStatus(event.id) });
  const [mode, setMode] = useState<EmailType | null>(null);

  if (isLoading || !status) return null;

  const Btn = ({ m, disabled, hint }: { m: EmailType; disabled?: boolean; hint?: string }) => (
    <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setMode(m)} disabled={disabled} title={hint || MODE_META[m].title}>
      {MODE_META[m].icon} {MODE_META[m].label}
    </button>
  );

  return (
    <div className="card mb-4 p-3">
      <div className="mb-2 flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-fuselage-400">
        <Mail size={13} /> Message pilots
        {!status.configured && <span className="ml-auto normal-case text-warning-600">SMTP not configured (preview mode)</span>}
      </div>
      <p className="mb-2 text-xs text-fuselage-500">
        Pick what to send. Nothing is ever sent automatically, and every email can be sent again and reflects the current bookings.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Btn m="reminder" />
        {status.requireConfirmation && (
          <Btn
            m="confirmReminder"
            disabled={status.unconfirmedCount === 0}
            hint={status.unconfirmedCount === 0 ? 'No pilots are awaiting confirmation' : `${status.unconfirmedCount} awaiting confirmation`}
          />
        )}
        <Btn m="notam" />
        <Btn m="cancellation" />
      </div>
      {status.log.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-fuselage-100 pt-2 dark:border-fuselage-800">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-fuselage-400">Sent history</div>
          {status.log.slice(0, 8).map((l) => (
            <LogRow key={l.id} eventId={event.id} entry={l} />
          ))}
        </div>
      )}
      {mode && <Composer event={event} mode={mode} status={status} onClose={() => setMode(null)} />}
    </div>
  );
}
