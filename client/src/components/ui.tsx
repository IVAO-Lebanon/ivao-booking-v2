import { ReactNode } from 'react';
import { PlaneLanding, ChevronLeft, ChevronRight, TriangleAlert } from 'lucide-react';
import { DialogRoot, DialogContent, DialogTitle, DialogTopRightClose } from '@ivao/atmosphere-react';

/** Inline validation/error banner shown inside a form modal. Renders nothing when empty. */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-danger-300 bg-danger-50 px-3 py-2 text-sm text-danger-700 dark:border-danger-900/50 dark:bg-danger-900/20 dark:text-danger-300">
      <TriangleAlert size={15} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

/**
 * IVAO globe mark — a simplified rendition of the IVAO brand logo
 * (globe with meridians + an orbiting flight path). See https://brand.ivao.aero/logo/.
 */
export function IvaoMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true">
      <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="2.5" />
      <ellipse cx="24" cy="24" rx="7" ry="16" stroke="currentColor" strokeWidth="2" opacity="0.85" />
      <path d="M9 19h30M9 29h30" stroke="currentColor" strokeWidth="2" opacity="0.85" />
      {/* orbiting flight path */}
      <path
        d="M6 34c8 6 28 6 36-6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="1 5"
        opacity="0.9"
      />
      <circle cx="42" cy="28" r="2.4" fill="currentColor" />
    </svg>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" width="20" height="20">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24 text-atmos-600">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-fuselage-100 text-fuselage-400 dark:bg-fuselage-800">
        <PlaneLanding size={24} />
      </div>
      <p className="font-semibold">{title}</p>
      {hint && <p className="text-sm text-fuselage-500">{hint}</p>}
    </div>
  );
}

// One source of truth for every booking/event status: a human label, badge
// styles, and the rail colour used on flight strips. Labels use the operator's
// vocabulary rather than the raw DB enum ("Open" reads clearer than "free").
type StatusMeta = { label: string; badge: string; rail: string };
const STATUS_META: Record<string, StatusMeta> = {
  free: { label: 'Open', badge: 'bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-300', rail: '#2EC662' },
  prebooked: { label: 'Awaiting', badge: 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-300', rail: '#E6B507' },
  booked: { label: 'Booked', badge: 'bg-atmos-100 text-atmos-700 dark:bg-atmos-900/40 dark:text-atmos-300', rail: '#1342E4' },
  scheduled: { label: 'Scheduled', badge: 'bg-atmos-100 text-atmos-700 dark:bg-atmos-900/40 dark:text-atmos-300', rail: '#1342E4' },
  created: { label: 'Draft', badge: 'bg-fuselage-150 text-fuselage-600 dark:bg-fuselage-800 dark:text-fuselage-300', rail: '#a7a8bb' },
  finished: { label: 'Finished', badge: 'bg-fuselage-200 text-fuselage-500 dark:bg-fuselage-800 dark:text-fuselage-400', rail: '#8b8ca9' },
  cancelled: { label: 'Cancelled', badge: 'bg-danger-100 text-danger-700 dark:bg-danger-900/30 dark:text-danger-300', rail: '#E93434' },
};

const fallbackMeta: StatusMeta = STATUS_META.free;

export function statusRail(status: string): string {
  return (STATUS_META[status] ?? fallbackMeta).rail;
}

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? fallbackMeta;
  return <span className={`badge badge-dot ${meta.badge}`}>{meta.label}</span>;
}

// Backed by Atmosphere's Radix Dialog (focus-trap, Esc-to-close, scroll-lock,
// ARIA all handled for us). The props API is unchanged so every existing
// <Modal open onClose title maxWidth> call site keeps working as-is.
export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
}) {
  return (
    <DialogRoot open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={`${maxWidth} max-h-[92vh] w-[calc(100%-2rem)] overflow-y-auto`}>
        <DialogTopRightClose />
        <DialogTitle className="mb-4 pr-8 font-head text-lg font-bold">{title}</DialogTitle>
        {children}
      </DialogContent>
    </DialogRoot>
  );
}

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-center gap-3 text-sm">
      <button className="btn-secondary px-3 py-1.5" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft size={16} /> Prev
      </button>
      <span className="font-mono text-fuselage-500">
        {page} / {totalPages}
      </span>
      <button
        className="btn-secondary px-3 py-1.5"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        Next <ChevronRight size={16} />
      </button>
    </div>
  );
}

/**
 * Split-flap display — renders a short string (e.g. a Zulu time or ICAO code)
 * as individual airport-board tiles. The signature aviation motif of the app.
 */
export function SplitFlap({
  value,
  className = '',
  cellClassName = '',
}: {
  value: string;
  className?: string;
  cellClassName?: string;
}) {
  return (
    <span className={`inline-flex items-stretch gap-0.5 ${className}`} aria-label={value}>
      {value.split('').map((ch, i) =>
        ch === ':' || ch === ' ' ? (
          <span key={i} aria-hidden className="grid place-items-center px-0.5 text-atmos-300/70">
            {ch === ':' ? ':' : ''}
          </span>
        ) : (
          <span key={i} aria-hidden className={`flap ${cellClassName}`}>
            {ch}
          </span>
        )
      )}
    </span>
  );
}
