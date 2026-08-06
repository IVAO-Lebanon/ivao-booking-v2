import { FormEvent, useState } from 'react';
import { Plus, Trash2, Route } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../api/client';
import type { EventTypeModel } from '../../api/types';
import { Switch } from '@ivao/atmosphere-react';
import { Modal, Spinner, PageLoader, EmptyState, FormError } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/Confirm';
import { friendlyError, describeError } from '../../lib/format';

const EMPTY = { code: '', name: '', description: '', opsSlots: false, sortOrder: 0 };

function TypeForm({ editing, onClose }: { editing: EventTypeModel | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState<typeof EMPTY>(() => (editing ? { ...editing } : { ...EMPTY }));
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: () =>
      editing ? api.updateEventType(editing.code, f) : api.createEventType(f),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event-types'] });
      toast.success(editing ? 'Event type updated.' : 'Event type added.');
      onClose();
    },
    onError: (e) => setError(describeError(e)),
  });

  const validate = (): string => {
    if (!editing && !/^[a-z0-9_-]{2,16}$/.test(f.code.trim())) return 'Code must be 2 to 16 characters: lowercase letters, digits, - or _.';
    if (!f.name.trim()) return 'Enter a name.';
    if (f.name.length > 80) return 'Name is too long (max 80 characters).';
    if (f.description.length > 255) return 'Description is too long (max 255 characters).';
    if (!Number.isInteger(Number(f.sortOrder))) return 'Sort order must be a whole number.';
    return '';
  };

  return (
    <Modal open onClose={onClose} title={editing ? 'Edit event type' : 'Add event type'}>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          const err = validate();
          if (err) { setError(err); return; }
          setError('');
          save.mutate();
        }}
        className="space-y-3"
      >
        <FormError message={error} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Code</label>
            <input
              className="input font-mono lowercase disabled:opacity-60"
              value={f.code}
              onChange={(e) => setF((s) => ({ ...s, code: e.target.value.toLowerCase() }))}
              placeholder="rfo"
              maxLength={16}
              disabled={!!editing}
              required
            />
            {editing && <p className="mt-1 text-xs text-fuselage-400">Code can't be changed.</p>}
          </div>
          <div>
            <label className="label">Sort order</label>
            <input
              type="number"
              className="input"
              value={f.sortOrder}
              onChange={(e) => setF((s) => ({ ...s, sortOrder: Number(e.target.value) }))}
            />
          </div>
        </div>
        <div>
          <label className="label">Name</label>
          <input className="input" value={f.name} onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))} placeholder="Real Flight Operations" maxLength={80} required />
        </div>
        <div>
          <label className="label">Description</label>
          <input className="input" value={f.description} onChange={(e) => setF((s) => ({ ...s, description: e.target.value }))} placeholder="Short summary shown to staff." maxLength={255} />
        </div>
        <label className="flex items-start gap-2 rounded-lg bg-fuselage-50 p-3 text-sm dark:bg-fuselage-800/60">
          <Switch className="mt-0.5" checked={f.opsSlots} onCheckedChange={(v) => setF((s) => ({ ...s, opsSlots: v }))} />
          <span>
            <span className="font-semibold">Ops-style slots</span>
            <span className="block text-xs text-fuselage-500">
              Enables directional (departure / arrival) and private slot filtering, like RFO events.
            </span>
          </span>
        </label>
        <div className="flex gap-2 pt-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex-1" disabled={save.isPending}>{save.isPending ? <Spinner /> : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function EventTypesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; editing: EventTypeModel | null }>({ open: false, editing: null });

  const { data, isLoading } = useQuery({ queryKey: ['event-types'], queryFn: () => api.eventTypes() });
  const del = useMutation({
    mutationFn: (code: string) => api.deleteEventType(code),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['event-types'] }); toast.success('Event type deleted.'); },
    onError: (e) => toast.error(describeError(e)),
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm text-fuselage-500">Event types available when creating events.</p>
        <button className="btn-primary" onClick={() => setModal({ open: true, editing: null })}>
          <Plus size={16} /> Add type
        </button>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : !data || data.length === 0 ? (
        <EmptyState title="No event types" hint="Add one to start creating events." />
      ) : (
        <div className="space-y-2">
          {data.map((t) => (
            <div key={t.code} className="card flex flex-wrap items-center gap-3 p-4">
              <span className="badge bg-fuselage-100 font-mono uppercase dark:bg-fuselage-800">{t.code}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-semibold">
                  {t.name}
                  {t.opsSlots && (
                    <span className="badge bg-atmos-100 text-atmos-700 dark:bg-atmos-900/40 dark:text-atmos-300">
                      <Route size={12} /> Ops slots
                    </span>
                  )}
                </div>
                {t.description && <div className="truncate text-xs text-fuselage-500">{t.description}</div>}
              </div>
              <div className="flex gap-1.5">
                <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setModal({ open: true, editing: t })}>Edit</button>
                <button
                  className="btn-ghost px-2 py-1.5 text-xs text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-900/20"
                  title="Delete event type"
                  onClick={async () => {
                    if (await confirm({ title: 'Delete this event type?', message: `"${t.name}" (${t.code}) will be removed. Events using it must be reassigned first.`, confirmLabel: 'Delete type' }))
                      del.mutate(t.code);
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal.open && <TypeForm editing={modal.editing} onClose={() => setModal({ open: false, editing: null })} />}
    </div>
  );
}
