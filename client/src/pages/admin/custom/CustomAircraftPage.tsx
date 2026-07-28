import { FormEvent, useState } from 'react';
import { Plus, Trash2, Plane } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client';
import type { CustomAircraft } from '../../../api/types';
import { Modal, Spinner, PageLoader, EmptyState, FormError } from '../../../components/ui';
import { Select } from '@ivao/atmosphere-react';
import { useToast } from '../../../components/Toast';
import { useConfirm } from '../../../components/Confirm';
import { describeError } from '../../../lib/format';

type Form = { icao: string; iata: string; model: string; manufacturer: string; wtc: string };
const EMPTY: Form = { icao: '', iata: '', model: '', manufacturer: '', wtc: '' };

const WTC = [
  { value: '', label: 'Not set' },
  { value: 'L', label: 'L - Light' },
  { value: 'M', label: 'M - Medium' },
  { value: 'H', label: 'H - Heavy' },
  { value: 'J', label: 'J - Super' },
];

const toForm = (a: CustomAircraft): Form => ({
  icao: a.icao,
  iata: a.iata ?? '',
  model: a.model,
  manufacturer: a.manufacturer ?? '',
  wtc: a.wtc ?? '',
});

function AircraftForm({ editing, onClose }: { editing: CustomAircraft | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState<Form>(() => (editing ? toForm(editing) : { ...EMPTY }));
  const [error, setError] = useState('');
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: () => (editing ? api.updateCustomAircraft(editing.icao, f) : api.createCustomAircraft(f)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-aircraft'] });
      toast.success(editing ? 'Aircraft updated.' : 'Aircraft added.');
      onClose();
    },
    onError: (e) => setError(describeError(e)),
  });

  const validate = (): string => {
    if (!editing && !/^[A-Za-z0-9]{2,4}$/.test(f.icao.trim())) return 'ICAO type must be 2 to 4 letters or digits.';
    if (!f.model.trim()) return 'Enter a model name.';
    return '';
  };

  return (
    <Modal open onClose={onClose} title={editing ? 'Edit custom aircraft' : 'Add custom aircraft'}>
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
            <label className="label">ICAO type</label>
            <input
              className="input font-mono uppercase disabled:opacity-60"
              value={f.icao}
              onChange={(e) => setF((s) => ({ ...s, icao: e.target.value.toUpperCase() }))}
              placeholder="A320"
              disabled={!!editing}
              required
            />
            {editing && <p className="mt-1 text-xs text-fuselage-400">ICAO can't be changed.</p>}
          </div>
          <div>
            <label className="label">IATA (optional)</label>
            <input className="input font-mono uppercase" value={f.iata} onChange={(e) => setF((s) => ({ ...s, iata: e.target.value.toUpperCase() }))} placeholder="320" />
          </div>
        </div>
        <div>
          <label className="label">Model</label>
          <input className="input" value={f.model} onChange={set('model')} placeholder="Airbus A320neo" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Manufacturer (optional)</label>
            <input className="input" value={f.manufacturer} onChange={set('manufacturer')} placeholder="Airbus" />
          </div>
          <div>
            <label className="label">Wake category (optional)</label>
            <Select
              items={WTC}
              value={f.wtc}
              onValueChange={(v: string) => setF((s) => ({ ...s, wtc: v }))}
              placeholder="Not set"
              position="popper"
            />
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex-1" disabled={save.isPending}>{save.isPending ? <Spinner /> : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function CustomAircraftPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; editing: CustomAircraft | null }>({ open: false, editing: null });

  const { data, isLoading } = useQuery({ queryKey: ['custom-aircraft'], queryFn: () => api.customAircraft() });
  const del = useMutation({
    mutationFn: (icao: string) => api.deleteCustomAircraft(icao),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['custom-aircraft'] }); toast.success('Aircraft removed.'); },
    onError: (e) => toast.error(describeError(e)),
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm text-fuselage-500">Aircraft types not in the IVAO API, or overrides for ones that are.</p>
        <button className="btn-primary" onClick={() => setModal({ open: true, editing: null })}>
          <Plus size={16} /> Add aircraft
        </button>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : !data || data.length === 0 ? (
        <EmptyState title="No custom aircraft" hint="Add a type the IVAO API is missing." />
      ) : (
        <div className="space-y-2">
          {data.map((a) => (
            <div key={a.icao} className="card flex flex-wrap items-center gap-3 p-4">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-atmos-50 text-atmos-600 dark:bg-atmos-900/30 dark:text-atmos-300">
                <Plane size={18} />
              </span>
              <span className="badge bg-fuselage-100 font-mono uppercase dark:bg-fuselage-800">{a.icao}</span>
              <span className="font-semibold">{a.model}</span>
              <span className="text-sm text-fuselage-500">
                {a.manufacturer || ''}
                {a.wtc ? ` · WTC ${a.wtc}` : ''}
              </span>
              <div className="ml-auto flex gap-1.5">
                <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setModal({ open: true, editing: a })}>Edit</button>
                <button
                  className="btn-ghost px-2 py-1.5 text-xs text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-900/20"
                  title="Remove custom aircraft"
                  onClick={async () => {
                    if (await confirm({ title: 'Remove this custom aircraft?', message: `"${a.model}" (${a.icao}) will be removed. The type will fall back to IVAO data if it exists there.`, confirmLabel: 'Remove aircraft' }))
                      del.mutate(a.icao);
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal.open && <AircraftForm editing={modal.editing} onClose={() => setModal({ open: false, editing: null })} />}
    </div>
  );
}
