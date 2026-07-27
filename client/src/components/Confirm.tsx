import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { Trash2, CircleHelp } from 'lucide-react';
import { Modal } from './ui';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Danger styles the confirm button red - for destructive actions. Default true. */
  danger?: boolean;
  icon?: ReactNode;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface Pending {
  opts: ConfirmOptions;
  resolve: (result: boolean) => void;
}

/**
 * Replaces the browser's native window.confirm with an in-app dialog that
 * matches the rest of the UI. Usage:
 *   const confirm = useConfirm();
 *   if (await confirm({ title: 'Delete slot?' })) del();
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (opts) => new Promise((resolve) => setPending({ opts, resolve })),
    []
  );

  const settle = (result: boolean) => {
    pending?.resolve(result);
    setPending(null);
  };

  const o = pending?.opts;
  const danger = o?.danger ?? true;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {o && (
        <Modal open onClose={() => settle(false)} title={o.title} maxWidth="max-w-sm">
          <div className="flex gap-3">
            <div
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                danger
                  ? 'bg-danger-100 text-danger-600 dark:bg-danger-900/30 dark:text-danger-400'
                  : 'bg-atmos-100 text-atmos-600 dark:bg-atmos-900/30 dark:text-atmos-400'
              }`}
              aria-hidden
            >
              {o.icon ?? (danger ? <Trash2 size={18} /> : <CircleHelp size={18} />)}
            </div>
            {o.message && <p className="pt-1.5 text-sm text-fuselage-600 dark:text-fuselage-300">{o.message}</p>}
          </div>
          <div className="mt-5 flex gap-2">
            <button className="btn-secondary flex-1" onClick={() => settle(false)}>
              {o.cancelLabel ?? 'Cancel'}
            </button>
            <button
              className={`${danger ? 'btn-danger' : 'btn-primary'} flex-1`}
              onClick={() => settle(true)}
              autoFocus
            >
              {o.confirmLabel ?? (danger ? 'Delete' : 'Confirm')}
            </button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}
