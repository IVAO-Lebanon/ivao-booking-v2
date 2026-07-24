import { Radio, Plane, Headset, Wifi } from 'lucide-react';
import type { EventLive, LiveFlight } from '../api/types';

export type LiveTone = 'green' | 'amber' | 'blue' | 'muted';

export interface LiveStatus {
  tone: LiveTone;
  label: string;
  detail: string;
}

/** Derives a compact live status for a booked flight from its Whazzup track. */
export function liveStatus(f?: LiveFlight | null): LiveStatus | null {
  if (!f) return null;
  if (!f.connected) return { tone: 'muted', label: 'Offline', detail: '' };

  const fl = f.altitude != null ? `FL${String(Math.round(f.altitude / 100)).padStart(3, '0')}` : null;
  const gs = f.groundSpeed != null ? `${f.groundSpeed}kt` : null;
  const detail = [fl, gs].filter(Boolean).join(' · ');
  const st = (f.state || '').toLowerCase();

  if (f.onGround) return { tone: 'amber', label: 'On ground', detail: '' };
  if (st.includes('approach') || (f.arrivalDistance != null && f.arrivalDistance < 40))
    return { tone: 'blue', label: 'Arriving', detail };
  return { tone: 'green', label: 'Airborne', detail };
}

const TONE: Record<LiveTone, string> = {
  green: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-300',
  amber: 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-300',
  blue: 'bg-atmos-100 text-atmos-700 dark:bg-atmos-900/40 dark:text-atmos-300',
  muted: 'bg-fuselage-100 text-fuselage-400 dark:bg-fuselage-800 dark:text-fuselage-400',
};

export function LiveFlightChip({ status }: { status: LiveStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${TONE[status.tone]}`}>
      {status.tone !== 'muted' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {status.label}
      {status.detail && <span className="font-mono font-semibold opacity-80">{status.detail}</span>}
    </span>
  );
}

function PulseTile({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10">
      <span className="text-atmos-300">{icon}</span>
      <div>
        <div className="font-mono text-lg font-extrabold leading-none tabular-nums text-white">{value}</div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-fuselage-400">{label}</div>
      </div>
    </div>
  );
}

export function LiveEventBoard({ data }: { data: EventLive }) {
  const c = data.connections;
  const tracked = data.flights.filter((f) => f.connected).length;
  const airborne = data.flights.filter((f) => f.connected && !f.onGround).length;

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-danger-500/40 bg-fuselage-950 text-white shadow-lg">
      <div className="terminal-grid relative">
        <div className="relative flex flex-wrap items-center gap-3 px-4 py-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-600 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            Live
          </span>
          <span className="font-head text-sm font-bold">Event in progress</span>
          {c && (
            <span className="ml-auto font-mono text-[11px] text-fuselage-400">
              network updated {new Date(c.updatedAt).toUTCString().slice(17, 22)}z
            </span>
          )}
        </div>

        <div className="relative flex flex-wrap gap-2 px-4 pb-4">
          <PulseTile icon={<Plane size={16} />} value={`${airborne}/${data.flights.length}`} label="Flights airborne" />
          <PulseTile icon={<Radio size={16} />} value={tracked} label="On network" />
          {c && <PulseTile icon={<Wifi size={16} />} value={c.pilots.toLocaleString()} label="Pilots online" />}
          {c && <PulseTile icon={<Headset size={16} />} value={c.atc.toLocaleString()} label="ATC online" />}
        </div>

        {data.atc.length > 0 && (
          <div className="relative border-t border-white/10 px-4 py-3">
            <div className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-fuselage-400">
              ATC on station
            </div>
            <div className="flex flex-wrap gap-1.5">
              {data.atc.map((a) => (
                <span
                  key={a.callsign}
                  className="inline-flex items-center gap-1.5 rounded-md bg-success-500/15 px-2 py-1 font-mono text-xs font-semibold text-success-300 ring-1 ring-success-500/30"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-success-400" />
                  {a.callsign}
                  {a.frequency ? <span className="opacity-80">{a.frequency.toFixed(3)}</span> : null}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
