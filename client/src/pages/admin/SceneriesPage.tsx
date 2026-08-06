import { FormEvent, useState } from 'react';
import { Plus } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../api/client';
import type { Scenery } from '../../api/types';
import { Select } from '@ivao/atmosphere-react';
import { Modal, Spinner, PageLoader, EmptyState, Pagination, FormError } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/Confirm';
import { friendlyError, describeError, isHttpUrl } from '../../lib/format';

const EMPTY = { icao: '', title: '', license: 'freeware', link: '', simulator: 'msfs' };

function SceneryForm({ editing, onClose }: { editing: Scenery | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: sims } = useQuery({ queryKey: ['simulators'], queryFn: () => api.simulators() });
  const [f, setF] = useState(() => (editing ? { ...editing } : { ...EMPTY }));
  const [error, setError] = useState('');
  const save = useMutation({
    mutationFn: () => (editing ? api.updateScenery(editing.id, f) : api.createScenery(f)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-sceneries'] });
      toast.success(editing ? 'Scenery updated.' : 'Scenery added.');
      onClose();
    },
    onError: (e) => setError(describeError(e)),
  });
  const set = (k: string) => (e: any) => setF((s: any) => ({ ...s, [k]: e.target.value }));
  const setVal = (k: string) => (v: string) => setF((s: any) => ({ ...s, [k]: v }));

  const validate = (): string => {
    if (!/^[A-Z]{4}$/.test(f.icao.trim())) return 'ICAO must be a 4-letter code (e.g. EGLL).';
    if (!f.title.trim()) return 'Enter a title.';
    if (f.title.length > 255) return 'Title is too long (max 255 characters).';
    if (!['freeware', 'payware'].includes(f.license)) return 'Pick a license.';
    if (!f.simulator) return 'Pick a simulator.';
    if (!isHttpUrl(f.link)) return 'Download link must be a valid http(s) URL.';
    return '';
  };

  return (
    <Modal open onClose={onClose} title={editing ? 'Edit scenery' : 'Add scenery'}>
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
            <label className="label">ICAO</label>
            <input className="input font-mono uppercase" value={f.icao} onChange={(e) => setF((s: any) => ({ ...s, icao: e.target.value.toUpperCase() }))} maxLength={4} required />
          </div>
          <div>
            <label className="label">Simulator</label>
            <Select
              position="popper"
              value={f.simulator}
              onValueChange={setVal('simulator')}
              placeholder="Select simulator"
              items={(sims ?? []).map((s) => ({ value: s.code, label: s.name }))}
            />
          </div>
        </div>
        <div>
          <label className="label">Title</label>
          <input className="input" value={f.title} onChange={set('title')} maxLength={255} required />
        </div>
        <div>
          <label className="label">License</label>
          <Select
            position="popper"
            value={f.license}
            onValueChange={setVal('license')}
            placeholder="Select license"
            items={[
              { value: 'freeware', label: 'Freeware' },
              { value: 'payware', label: 'Payware' },
            ]}
          />
        </div>
        <div>
          <label className="label">Download link</label>
          <input className="input" value={f.link} onChange={set('link')} placeholder="https://…" required />
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex-1" disabled={save.isPending}>{save.isPending ? <Spinner /> : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function SceneriesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const { data: sims } = useQuery({ queryKey: ['simulators'], queryFn: () => api.simulators() });
  const simName = (code: string) => sims?.find((s) => s.code === code)?.name ?? code;
  const [page, setPage] = useState(1);
  const [icao, setIcao] = useState('');
  const [modal, setModal] = useState<{ open: boolean; editing: Scenery | null }>({ open: false, editing: null });

  const { data, isLoading } = useQuery({
    queryKey: ['admin-sceneries', page, icao],
    queryFn: () => api.sceneries({ page, perPage: 15, ...(icao ? { icao } : {}) }),
  });
  const del = useMutation({
    mutationFn: (id: number) => api.deleteScenery(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-sceneries'] }); toast.success('Deleted.'); },
    onError: (e) => toast.error(describeError(e)),
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input className="input w-40 font-mono uppercase" placeholder="Filter ICAO" value={icao} onChange={(e) => { setIcao(e.target.value.toUpperCase()); setPage(1); }} />
        <button className="btn-primary ml-auto" onClick={() => setModal({ open: true, editing: null })}><Plus size={16} /> Add scenery</button>
      </div>
      {isLoading ? <PageLoader /> : !data || data.data.length === 0 ? (
        <EmptyState title="No sceneries" />
      ) : (
        <>
          <div className="space-y-2">
            {data.data.map((s) => (
              <div key={s.id} className="card flex flex-wrap items-center gap-3 p-4">
                <span className="badge bg-fuselage-100 font-mono dark:bg-fuselage-800">{s.icao}</span>
                <span className="font-semibold">{s.title}</span>
                <span className="text-xs text-fuselage-500">{simName(s.simulator)} · {s.license}</span>
                <div className="ml-auto flex gap-1.5">
                  <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setModal({ open: true, editing: s })}>Edit</button>
                  <button
                    className="btn-ghost px-3 py-1.5 text-xs text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-900/20"
                    onClick={async () => {
                      if (await confirm({ title: 'Delete this scenery?', message: `${s.title} (${s.icao}) will be removed from the recommended list.`, confirmLabel: 'Delete scenery' }))
                        del.mutate(s.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}
      {modal.open && <SceneryForm editing={modal.editing} onClose={() => setModal({ open: false, editing: null })} />}
    </div>
  );
}
