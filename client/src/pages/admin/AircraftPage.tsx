import { FormEvent, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../api/client';
import type { Aircraft } from '../../api/types';
import { Modal, Spinner, PageLoader, EmptyState, Pagination } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/Confirm';
import { friendlyError } from '../../lib/format';

const EMPTY = { icao: '', iata: '', name: '', speed: 0 };

function AircraftForm({ editing, onClose }: { editing: Aircraft | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState<any>(() => (editing ? { ...editing } : { ...EMPTY }));
  const save = useMutation({
    mutationFn: () => (editing ? api.updateAircraft(editing.id, f) : api.createAircraft(f)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-aircraft'] });
      toast.success(editing ? 'Aircraft updated.' : 'Aircraft added.');
      onClose();
    },
    onError: (e) => toast.error(friendlyError(apiErrorMessage(e))),
  });

  return (
    <Modal open onClose={onClose} title={editing ? 'Edit aircraft' : 'Add aircraft'}>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">ICAO</label>
            <input className="input font-mono uppercase" value={f.icao} onChange={(e) => setF((s: any) => ({ ...s, icao: e.target.value.toUpperCase() }))} required />
          </div>
          <div>
            <label className="label">IATA</label>
            <input className="input font-mono uppercase" value={f.iata} onChange={(e) => setF((s: any) => ({ ...s, iata: e.target.value.toUpperCase() }))} />
          </div>
        </div>
        <div>
          <label className="label">Name</label>
          <input className="input" value={f.name} onChange={(e) => setF((s: any) => ({ ...s, name: e.target.value }))} required />
        </div>
        <div>
          <label className="label">Cruise speed (kts)</label>
          <input type="number" className="input" value={f.speed} onChange={(e) => setF((s: any) => ({ ...s, speed: Number(e.target.value) }))} />
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex-1" disabled={save.isPending}>{save.isPending ? <Spinner /> : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function AircraftPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ open: boolean; editing: Aircraft | null }>({ open: false, editing: null });

  const { data, isLoading } = useQuery({ queryKey: ['admin-aircraft', page], queryFn: () => api.aircraft({ page, perPage: 25 }) });
  const del = useMutation({
    mutationFn: (id: number) => api.deleteAircraft(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-aircraft'] }); toast.success('Deleted.'); },
    onError: (e) => toast.error(friendlyError(apiErrorMessage(e))),
  });

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button className="btn-primary" onClick={() => setModal({ open: true, editing: null })}><Plus size={16} /> Add aircraft</button>
      </div>
      {isLoading ? <PageLoader /> : !data || data.data.length === 0 ? (
        <EmptyState title="No aircraft" />
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.data.map((a) => (
              <div key={a.id} className="card flex items-center gap-3 p-4">
                <span className="badge bg-fuselage-100 font-mono dark:bg-fuselage-800">{a.icao}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{a.name}</div>
                  <div className="text-xs text-fuselage-500">{a.iata || 'N/A'} · {a.speed} kts</div>
                </div>
                <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setModal({ open: true, editing: a })}>Edit</button>
                <button
                  className="btn-ghost px-2 py-1.5 text-xs text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-900/20"
                  title="Delete aircraft"
                  onClick={async () => {
                    if (await confirm({ title: 'Delete this aircraft?', message: `${a.name} (${a.icao}) will be removed from the fleet.`, confirmLabel: 'Delete aircraft' }))
                      del.mutate(a.id);
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}
      {modal.open && <AircraftForm editing={modal.editing} onClose={() => setModal({ open: false, editing: null })} />}
    </div>
  );
}
