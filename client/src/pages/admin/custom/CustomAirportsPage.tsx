import { FormEvent, useState } from 'react';
import { Plus, Trash2, MapPin } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client';
import type { CustomAirport } from '../../../api/types';
import { Modal, Spinner, PageLoader, EmptyState, FormError } from '../../../components/ui';
import { useToast } from '../../../components/Toast';
import { useConfirm } from '../../../components/Confirm';
import { describeError } from '../../../lib/format';

type Form = {
  icao: string;
  iata: string;
  name: string;
  city: string;
  countryId: string;
  latitude: string;
  longitude: string;
  elevation: string;
};

const EMPTY: Form = { icao: '', iata: '', name: '', city: '', countryId: '', latitude: '', longitude: '', elevation: '' };

const toForm = (a: CustomAirport): Form => ({
  icao: a.icao,
  iata: a.iata ?? '',
  name: a.name,
  city: a.city ?? '',
  countryId: a.countryId ?? '',
  latitude: a.latitude == null ? '' : String(a.latitude),
  longitude: a.longitude == null ? '' : String(a.longitude),
  elevation: a.elevation == null ? '' : String(a.elevation),
});

function AirportForm({ editing, onClose }: { editing: CustomAirport | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState<Form>(() => (editing ? toForm(editing) : { ...EMPTY }));
  const [error, setError] = useState('');
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: () => (editing ? api.updateCustomAirport(editing.icao, f) : api.createCustomAirport(f)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-airports'] });
      toast.success(editing ? 'Airport updated.' : 'Airport added.');
      onClose();
    },
    onError: (e) => setError(describeError(e)),
  });

  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  const validate = (): string => {
    if (!editing && !/^[A-Za-z]{4}$/.test(f.icao.trim())) return 'ICAO must be exactly 4 letters (A to Z).';
    if (!f.name.trim()) return 'Enter an airport name.';
    const lat = num(f.latitude);
    const lon = num(f.longitude);
    if (lat != null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) return 'Latitude must be a number from -90 to 90.';
    if (lon != null && (!Number.isFinite(lon) || lon < -180 || lon > 180)) return 'Longitude must be a number from -180 to 180.';
    if (f.elevation.trim() && !Number.isInteger(Number(f.elevation))) return 'Elevation must be a whole number of feet.';
    return '';
  };

  return (
    <Modal open onClose={onClose} title={editing ? 'Edit custom airport' : 'Add custom airport'}>
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
            <input
              className="input font-mono uppercase disabled:opacity-60"
              value={f.icao}
              onChange={(e) => setF((s) => ({ ...s, icao: e.target.value.toUpperCase() }))}
              placeholder="OLBB"
              disabled={!!editing}
              required
            />
            {editing && <p className="mt-1 text-xs text-fuselage-400">ICAO can't be changed.</p>}
          </div>
          <div>
            <label className="label">IATA (optional)</label>
            <input className="input font-mono uppercase" value={f.iata} onChange={(e) => setF((s) => ({ ...s, iata: e.target.value.toUpperCase() }))} placeholder="BEY" />
          </div>
        </div>
        <div>
          <label className="label">Name</label>
          <input className="input" value={f.name} onChange={set('name')} placeholder="Beirut Rafic Hariri Intl" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">City (optional)</label>
            <input className="input" value={f.city} onChange={set('city')} placeholder="Beirut" />
          </div>
          <div>
            <label className="label">Country (ISO 2, optional)</label>
            <input className="input font-mono uppercase" value={f.countryId} onChange={(e) => setF((s) => ({ ...s, countryId: e.target.value.toUpperCase() }))} placeholder="LB" maxLength={2} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Latitude</label>
            <input className="input" value={f.latitude} onChange={set('latitude')} placeholder="33.821" inputMode="decimal" />
          </div>
          <div>
            <label className="label">Longitude</label>
            <input className="input" value={f.longitude} onChange={set('longitude')} placeholder="35.488" inputMode="decimal" />
          </div>
          <div>
            <label className="label">Elevation (ft)</label>
            <input className="input" value={f.elevation} onChange={set('elevation')} placeholder="87" inputMode="numeric" />
          </div>
        </div>
        <p className="text-xs text-fuselage-400">Latitude and longitude place the airport on the flight map.</p>
        <div className="flex gap-2 pt-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex-1" disabled={save.isPending}>{save.isPending ? <Spinner /> : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function CustomAirportsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; editing: CustomAirport | null }>({ open: false, editing: null });

  const { data, isLoading } = useQuery({ queryKey: ['custom-airports'], queryFn: () => api.customAirports() });
  const del = useMutation({
    mutationFn: (icao: string) => api.deleteCustomAirport(icao),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['custom-airports'] }); toast.success('Airport removed.'); },
    onError: (e) => toast.error(describeError(e)),
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm text-fuselage-500">Airports not in the IVAO catalogue, or overrides for ones that are.</p>
        <button className="btn-primary" onClick={() => setModal({ open: true, editing: null })}>
          <Plus size={16} /> Add airport
        </button>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : !data || data.length === 0 ? (
        <EmptyState title="No custom airports" hint="Add one for an event-only or fictional field." />
      ) : (
        <div className="space-y-2">
          {data.map((a) => (
            <div key={a.icao} className="card flex flex-wrap items-center gap-3 p-4">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-atmos-50 text-atmos-600 dark:bg-atmos-900/30 dark:text-atmos-300">
                <MapPin size={18} />
              </span>
              <span className="badge bg-fuselage-100 font-mono uppercase dark:bg-fuselage-800">{a.icao}</span>
              <span className="font-semibold">{a.name}</span>
              <span className="text-sm text-fuselage-500">
                {a.city ? `${a.city} · ` : ''}
                {a.latitude != null && a.longitude != null ? `${a.latitude}, ${a.longitude}` : 'no coordinates'}
              </span>
              <div className="ml-auto flex gap-1.5">
                <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setModal({ open: true, editing: a })}>Edit</button>
                <button
                  className="btn-ghost px-2 py-1.5 text-xs text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-900/20"
                  title="Remove custom airport"
                  onClick={async () => {
                    if (await confirm({ title: 'Remove this custom airport?', message: `"${a.name}" (${a.icao}) will be removed. The ICAO will fall back to IVAO data if it exists there.`, confirmLabel: 'Remove airport' }))
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

      {modal.open && <AirportForm editing={modal.editing} onClose={() => setModal({ open: false, editing: null })} />}
    </div>
  );
}
