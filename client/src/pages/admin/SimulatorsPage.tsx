import { FormEvent, useState } from 'react';
import { Plus, Trash2, MonitorPlay } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../api/client';
import type { SimulatorModel } from '../../api/types';
import { Modal, Spinner, PageLoader, EmptyState } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/Confirm';
import { friendlyError } from '../../lib/format';

const EMPTY = { code: '', name: '', sortOrder: 0 };

function SimulatorForm({ editing, onClose }: { editing: SimulatorModel | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState<typeof EMPTY>(() => (editing ? { ...editing } : { ...EMPTY }));

  const save = useMutation({
    mutationFn: () => (editing ? api.updateSimulator(editing.code, f) : api.createSimulator(f)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['simulators'] });
      toast.success(editing ? 'Simulator updated.' : 'Simulator added.');
      onClose();
    },
    onError: (e) => toast.error(friendlyError(apiErrorMessage(e))),
  });

  return (
    <Modal open onClose={onClose} title={editing ? 'Edit simulator' : 'Add simulator'}>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Code</label>
            <input
              className="input font-mono lowercase disabled:opacity-60"
              value={f.code}
              onChange={(e) => setF((s) => ({ ...s, code: e.target.value.toLowerCase() }))}
              placeholder="msfs2024"
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
          <input className="input" value={f.name} onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))} placeholder="Microsoft Flight Simulator 2024" required />
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex-1" disabled={save.isPending}>{save.isPending ? <Spinner /> : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function SimulatorsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; editing: SimulatorModel | null }>({ open: false, editing: null });

  const { data, isLoading } = useQuery({ queryKey: ['simulators'], queryFn: () => api.simulators() });
  const del = useMutation({
    mutationFn: (code: string) => api.deleteSimulator(code),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['simulators'] }); toast.success('Simulator deleted.'); },
    onError: (e) => toast.error(friendlyError(apiErrorMessage(e))),
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm text-fuselage-500">Simulators available when adding sceneries.</p>
        <button className="btn-primary" onClick={() => setModal({ open: true, editing: null })}>
          <Plus size={16} /> Add simulator
        </button>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : !data || data.length === 0 ? (
        <EmptyState title="No simulators" hint="Add one to start tagging sceneries." />
      ) : (
        <div className="space-y-2">
          {data.map((s) => (
            <div key={s.code} className="card flex flex-wrap items-center gap-3 p-4">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-atmos-50 text-atmos-600 dark:bg-atmos-900/30 dark:text-atmos-300">
                <MonitorPlay size={18} />
              </span>
              <span className="badge bg-fuselage-100 font-mono uppercase dark:bg-fuselage-800">{s.code}</span>
              <span className="font-semibold">{s.name}</span>
              <div className="ml-auto flex gap-1.5">
                <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setModal({ open: true, editing: s })}>Edit</button>
                <button
                  className="btn-ghost px-2 py-1.5 text-xs text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-900/20"
                  title="Delete simulator"
                  onClick={async () => {
                    if (await confirm({ title: 'Delete this simulator?', message: `"${s.name}" (${s.code}) will be removed. Sceneries using it must be reassigned first.`, confirmLabel: 'Delete simulator' }))
                      del.mutate(s.code);
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal.open && <SimulatorForm editing={modal.editing} onClose={() => setModal({ open: false, editing: null })} />}
    </div>
  );
}
