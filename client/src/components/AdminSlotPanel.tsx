import { FormEvent, useRef, useState } from 'react';
import { Plus, Upload, Download, TriangleAlert, CircleCheck, Plane, FileSpreadsheet } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage, apiErrorDetails } from '../api/client';
import type { EventModel, Slot } from '../api/types';
import { Modal, Spinner } from './ui';
import { AircraftInput } from './AircraftInput';
import { AirportInput } from './AirportInput';
import { DateTimeUtcInput } from './DateTimeUtcInput';
import { useToast } from './Toast';
import { friendlyError, describeError, fmtUtc } from '../lib/format';

function CreateSlotModal({ event, onClose }: { event: EventModel; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState({ flightNumber: '', origin: '', destination: '', aircraft: '', gate: '', slotTime: '' });

  const create = useMutation({
    mutationFn: () =>
      api.createSlot(event.id, {
        flightNumber: f.flightNumber || null,
        origin: f.origin || null,
        destination: f.destination || null,
        aircraft: f.aircraft || null,
        gate: f.gate || null,
        slotTime: f.slotTime ? f.slotTime.replace('T', ' ') + ':00' : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['slots', event.id] });
      qc.invalidateQueries({ queryKey: ['slot-counts', event.id] });
      toast.success('Slot created. Empty fields become pilot-fillable.');
      onClose();
    },
    onError: (e) => toast.error(describeError(e)),
  });

  const set = (k: string) => (e: any) => setF((s) => ({ ...s, [k]: e.target.value.toUpperCase() }));

  return (
    <Modal open onClose={onClose} title="Create slot">
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (!f.slotTime) {
            toast.error('Slot time is required.');
            return;
          }
          create.mutate();
        }}
        className="space-y-3"
      >
        <p className="rounded-lg bg-fuselage-100 px-3 py-2 text-xs text-fuselage-500 dark:bg-fuselage-800">
          Fill a field to <b>fix</b> it; leave it empty to let pilots choose it when booking. A slot with an open
          origin and/or destination is a <b>Private</b> slot; a fully-set route is a Departure or Arrival.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Flight #</label>
            <input className="input font-mono uppercase" value={f.flightNumber} onChange={set('flightNumber')} placeholder="ABC123" />
          </div>
          <div>
            <label className="label">Aircraft</label>
            <AircraftInput value={f.aircraft} onChange={(v) => setF((s) => ({ ...s, aircraft: v }))} />
          </div>
          <div>
            <label className="label">Origin</label>
            <AirportInput value={f.origin} onChange={(v) => setF((s) => ({ ...s, origin: v }))} placeholder="EGLL" />
          </div>
          <div>
            <label className="label">Destination</label>
            <AirportInput value={f.destination} onChange={(v) => setF((s) => ({ ...s, destination: v }))} placeholder="LFPG" />
          </div>
          <div>
            <label className="label">Gate</label>
            <input className="input font-mono uppercase" value={f.gate} onChange={set('gate')} placeholder="B4" />
          </div>
          <div>
            <label className="label">Slot time (UTC)<span className="ml-0.5 text-danger-500">*</span></label>
            <DateTimeUtcInput value={f.slotTime} onChange={(v) => setF((s) => ({ ...s, slotTime: v }))} required />
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary flex-1" disabled={create.isPending}>
            {create.isPending ? <Spinner /> : 'Create slot'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function OverlapModal({ event, onClose }: { event: EventModel; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['overlapping', event.id],
    queryFn: () => api.overlapping(event.id),
  });
  const entries = Object.entries(data || {});
  return (
    <Modal open onClose={onClose} title="Overlapping bookings" maxWidth="max-w-xl">
      {isLoading ? (
        <div className="py-8 text-center">
          <Spinner className="mx-auto h-6 w-6 text-atmos-600" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-fuselage-500">
          <CircleCheck className="text-success-500" size={28} />
          No pilots have overlapping slots.
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map(([vid, slots]) => (
            <div key={vid} className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-900/20">
              <div className="mb-2 text-sm font-bold">Pilot {vid}</div>
              <ul className="space-y-1 text-sm">
                {(slots as Slot[]).map((s) => (
                  <li key={s.id} className="flex items-center gap-2 font-mono">
                    <span className="font-bold">{s.flightNumber || 'N/A'}</span>
                    <span className="flex items-center gap-1">
                      {s.origin || '····'}
                      <Plane size={12} className="rotate-90 text-atmos-500" aria-hidden />
                      {s.destination || '····'}
                    </span>
                    <span className="ml-auto text-xs">{fmtUtc(s.slotTime, 'dd MMM HH:mm')}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

const CSV_COLUMNS: { name: string; desc: string }[] = [
  { name: 'flightNumber', desc: 'Callsign, e.g. ABC123.' },
  { name: 'origin', desc: 'Departure airport ICAO (4 letters), e.g. EGLL.' },
  { name: 'destination', desc: 'Arrival airport ICAO, e.g. LFPG.' },
  { name: 'aircraft', desc: 'Aircraft ICAO type, e.g. A320.' },
  { name: 'gate', desc: 'Gate / parking stand, e.g. B4.' },
  { name: 'slotTime', desc: 'Required. Slot time in UTC, format "YYYY-MM-DD HH:MM:SS".' },
];

function ImportCsvModal({
  event,
  onChooseFile,
  onClose,
  pending,
}: {
  event: EventModel;
  onChooseFile: () => void;
  onClose: () => void;
  pending: boolean;
}) {
  const toast = useToast();
  return (
    <Modal open onClose={onClose} title="Import slots from CSV" maxWidth="max-w-xl">
      <div className="space-y-4 text-sm">
        <p className="text-fuselage-600 dark:text-fuselage-300">
          Upload a <span className="font-semibold">.csv</span> file with a header row and one row per slot.
        </p>

        <div className="rounded-lg border border-atmos-100 bg-atmos-50 px-3 py-2 text-atmos-800 dark:border-atmos-900/50 dark:bg-atmos-900/20 dark:text-atmos-200">
          <span className="font-semibold">How fields work:</span> leave a cell <b>empty</b> to let the pilot choose
          that value when booking. <b>Fill</b> a cell to fix it. Fixed values are staff-set and pilots can’t change
          them (shown to pilots with a <span className="font-bold text-danger-500">*</span>). A row with an open
          origin and/or destination becomes a <b>Private</b> slot; a full route is a Departure or Arrival.
          <b> slotTime is required on every row.</b>
        </div>

        <div className="panel p-3">
          <div className="eyebrow mb-2">Columns</div>
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full text-left text-xs">
              <tbody>
                {CSV_COLUMNS.map((c) => (
                  <tr key={c.name} className="border-b border-fuselage-150 last:border-0 dark:border-fuselage-800">
                    <td className="py-1.5 pr-3 align-top font-mono font-semibold text-atmos-700 dark:text-atmos-300">{c.name}</td>
                    <td className="py-1.5 text-fuselage-500">{c.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="eyebrow mb-1">Example</div>
          <pre className="overflow-x-auto scroll-thin rounded-lg bg-fuselage-950 px-3 py-2 font-mono text-[11px] text-atmos-100">
{`flightNumber,origin,destination,aircraft,gate,slotTime
BAW201,EGLL,LFPG,A320,B4,2026-08-01 16:00:00
,EGLL,,A320,,2026-08-01 16:30:00`}
          </pre>
          <p className="mt-1 text-xs text-fuselage-400">
            Row 2 is a full route (a Departure/Arrival). Row 3 leaves the destination open, so it's a Private slot
            the pilot completes.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className="btn-secondary flex-1"
            onClick={() => api.downloadSlotTemplate(event.id).catch(() => toast.error('Template download failed.'))}
          >
            <Download size={15} /> Download template
          </button>
          <button type="button" className="btn-primary flex-1" onClick={onChooseFile} disabled={pending}>
            {pending ? <Spinner /> : <><Upload size={15} /> Choose CSV file</>}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function AdminSlotPanel({ event }: { event: EventModel }) {
  const toast = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showOverlap, setShowOverlap] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [csvIssues, setCsvIssues] = useState<{ issues: { row: number; field: string; message: string }[]; total: number } | null>(null);

  const importMut = useMutation({
    mutationFn: (file: File) => api.importSlots(event.id, file),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['slots', event.id] });
      qc.invalidateQueries({ queryKey: ['slot-counts', event.id] });
      toast.success(`Imported ${r.imported} slots.`);
    },
    onError: (e) => {
      // A validation failure carries the full list of problems - show them so the
      // admin can fix every one, rather than a single vague toast.
      const details = apiErrorDetails<{ issues?: { row: number; field: string; message: string }[]; total?: number }>(e);
      if (details?.issues?.length) setCsvIssues({ issues: details.issues, total: details.total ?? details.issues.length });
      else toast.error(describeError(e));
    },
  });

  return (
    <div className="card mb-4 flex flex-wrap items-center gap-2 border-dashed p-3">
      <span className="mr-1 font-mono text-[11px] font-bold uppercase tracking-wider text-fuselage-400">Staff</span>
      <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => setShowCreate(true)}>
        <Plus size={15} /> Slot
      </button>
      <button
        className="btn-secondary px-3 py-1.5 text-xs"
        onClick={() => setShowImport(true)}
        disabled={importMut.isPending}
      >
        {importMut.isPending ? (
          <Spinner />
        ) : (
          <>
            <FileSpreadsheet size={15} /> Import CSV
          </>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) importMut.mutate(file);
          e.target.value = '';
          setShowImport(false);
        }}
      />
      <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => api.exportSlots(event.id).catch(() => toast.error('Export failed.'))}>
        <Download size={15} /> Export CSV
      </button>
      <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setShowOverlap(true)}>
        <TriangleAlert size={15} /> Overlaps
      </button>

      {showCreate && <CreateSlotModal event={event} onClose={() => setShowCreate(false)} />}
      {showOverlap && <OverlapModal event={event} onClose={() => setShowOverlap(false)} />}
      {showImport && (
        <ImportCsvModal
          event={event}
          pending={importMut.isPending}
          onChooseFile={() => fileRef.current?.click()}
          onClose={() => setShowImport(false)}
        />
      )}
      {csvIssues && (
        <Modal open onClose={() => setCsvIssues(null)} title="CSV not imported - fix these first" maxWidth="max-w-2xl">
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-danger-300 bg-danger-50 px-3 py-2 text-sm text-danger-700 dark:border-danger-900/50 dark:bg-danger-900/20 dark:text-danger-300">
              <TriangleAlert size={15} className="mt-0.5 shrink-0" />
              <span>
                Nothing was imported. Found <b>{csvIssues.total}</b> problem{csvIssues.total === 1 ? '' : 's'}
                {csvIssues.issues.length < csvIssues.total ? ` (showing the first ${csvIssues.issues.length})` : ''}. Fix the file and import again.
              </span>
            </div>
            <div className="max-h-[50vh] overflow-auto scroll-thin rounded-lg border border-fuselage-200 dark:border-fuselage-700">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-fuselage-50 dark:bg-fuselage-800">
                  <tr className="text-left text-[11px] uppercase tracking-wide text-fuselage-400">
                    <th className="px-3 py-1.5 font-semibold">Row</th>
                    <th className="px-3 py-1.5 font-semibold">Field</th>
                    <th className="px-3 py-1.5 font-semibold">Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {csvIssues.issues.map((it, i) => (
                    <tr key={i} className="border-t border-fuselage-100 dark:border-fuselage-800">
                      <td className="px-3 py-1.5 font-mono text-fuselage-500">{it.row}</td>
                      <td className="px-3 py-1.5 font-mono text-fuselage-500">{it.field}</td>
                      <td className="px-3 py-1.5 text-fuselage-700 dark:text-fuselage-200">{it.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <button className="btn-primary" onClick={() => setCsvIssues(null)}>Got it</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
