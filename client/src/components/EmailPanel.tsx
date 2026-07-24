import { useEffect, useRef, useState } from 'react';
import { Mail, Megaphone, Bell, Send, TriangleAlert } from 'lucide-react';
import { Switch } from '@ivao/atmosphere-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../api/client';
import type { EmailFields, EmailStatus, EventModel } from '../api/types';
import { Modal, Spinner } from './ui';
import { useToast } from './Toast';
import { friendlyError } from '../lib/format';

type Mode = 'reminder' | 'notam';

const MODE_META: Record<Mode, { title: string; audience: (s: EmailStatus) => string; once: boolean }> = {
  reminder: { title: 'Reminder to pilots who booked', audience: (s) => `${s.participantCount} pilot(s) who booked`, once: true },
  notam: { title: 'NOTAM to participating pilots', audience: (s) => `${s.participantCount} participant(s)`, once: false },
};

function Composer({ event, mode, status, onClose }: { event: EventModel; mode: Mode; status: EmailStatus; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const msgRef = useRef<HTMLTextAreaElement>(null);
  const [f, setF] = useState<EmailFields>(() => ({ ...status.defaults[mode] }));
  const set = <K extends keyof EmailFields>(k: K, v: EmailFields[K]) => setF((p) => ({ ...p, [k]: v }));
  const [preview, setPreview] = useState('');

  // Live preview — re-render (debounced) whenever any field changes.
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

  const send = useMutation({
    mutationFn: () => (mode === 'reminder' ? api.sendReminder(event.id, f) : api.sendNotam(event.id, f)),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['email-status', event.id] });
      toast.success(`Sent ${r.sent}/${r.total}${r.failed ? ` · ${r.failed} failed` : ''}.`);
      onClose();
    },
    onError: (e) => toast.error(friendlyError(apiErrorMessage(e))),
  });

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
    <Modal open onClose={onClose} title={MODE_META[mode].title} maxWidth="max-w-5xl">
      <div className="space-y-3">
        {!status.configured && (
          <div className="flex items-center gap-2 rounded-lg border border-warning-300 bg-warning-50 px-3 py-2 text-xs text-warning-800 dark:border-warning-900/50 dark:bg-warning-900/20 dark:text-warning-200">
            <TriangleAlert size={14} /> SMTP is not configured, so this is preview mode. Messages are simulated, not delivered.
          </div>
        )}
        <p className="text-xs text-fuselage-500">
          Recipients: <b>{MODE_META[mode].audience(status)}</b>{MODE_META[mode].once ? ' · can be sent once' : ' · unlimited'}
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Editor — everything is editable */}
          <div className="max-h-[460px] space-y-3 overflow-y-auto scroll-thin pr-1">
            {field('subject', 'Subject', '{{eventName}}')}
            <div className="grid grid-cols-2 gap-3">
              {field('headerTag', 'Header tag', 'Events')}
              {field('label', 'Eyebrow label', 'Event NOTAM')}
            </div>
            {field('title', 'Heading', '{{eventName}}')}
            {field('greeting', 'Greeting', 'Dear {{pilotName}},')}

            <div>
              <label className="label">Message</label>
              <textarea ref={msgRef} className="input min-h-[130px] text-sm leading-relaxed" value={f.message} onChange={(e) => set('message', e.target.value)}
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

            <div className="flex flex-wrap gap-4 rounded-lg bg-fuselage-50 p-3 dark:bg-fuselage-800/50">
              {mode === 'notam' && toggle('showFlightCard', 'Flight card')}
              {mode === 'reminder' && toggle('showEventStrip', 'Event date/time')}
              {toggle('ctaShow', 'Button')}
            </div>
            {f.ctaShow && (
              <div className="grid grid-cols-2 gap-3">
                {field('ctaLabel', 'Button label', 'Book your slot')}
                {field('ctaUrl', 'Button link (URL)', 'https://…')}
              </div>
            )}
            {field('footerNote', 'Footer note (optional)', 'e.g. Questions? Reply to this email.')}
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

        <div className="flex pt-1">
          <button className="btn-primary ml-auto" onClick={() => send.mutate()} disabled={send.isPending}>
            {send.isPending ? <Spinner /> : <><Send size={15} /> Send to {MODE_META[mode].audience(status)}</>}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function EmailPanel({ event }: { event: EventModel }) {
  const { data: status, isLoading } = useQuery({ queryKey: ['email-status', event.id], queryFn: () => api.emailStatus(event.id) });
  const [mode, setMode] = useState<Mode | null>(null);

  if (isLoading || !status) return null;

  const Btn = ({ m, icon, label, disabled }: { m: Mode; icon: React.ReactNode; label: string; disabled?: boolean }) => (
    <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setMode(m)} disabled={disabled} title={disabled ? 'Already sent (one-time)' : ''}>
      {icon} {label}
    </button>
  );

  return (
    <div className="card mb-4 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 inline-flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-fuselage-400">
          <Mail size={13} /> Email
        </span>
        <Btn m="reminder" icon={<Bell size={14} />} label={status.reminderSent ? 'Reminder sent' : 'Send reminder'} disabled={status.reminderSent} />
        <Btn m="notam" icon={<Megaphone size={14} />} label="Send NOTAM" />
        {!status.configured && <span className="ml-auto text-[11px] text-warning-600">SMTP not configured (preview mode)</span>}
      </div>
      {status.log.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-fuselage-100 pt-2 text-[11px] text-fuselage-400 dark:border-fuselage-800">
          {status.log.slice(0, 4).map((l, i) => (
            <span key={i} className="font-mono">
              {l.type}: {l.sent}/{l.recipients} sent{l.failed ? ` · ${l.failed} failed` : ''}
            </span>
          ))}
        </div>
      )}
      {mode && <Composer event={event} mode={mode} status={status} onClose={() => setMode(null)} />}
    </div>
  );
}
