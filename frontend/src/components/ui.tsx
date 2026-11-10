import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { BottomSheet } from './AccountMenu';

/** Title, one-line lead, optional "← parent" and actions (platform UI rules). */
export function PageHeader({ title, lead, back, children }: { title: string; lead?: string; back?: { to: string; label: string }; children?: ReactNode }) {
  return (
    <div className="mb-6">
      {back && (
        <Link to={back.to} className="mb-3 inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-ink dark:text-slate-400">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          {lead && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{lead}</p>}
        </div>
        {children && <div className="flex flex-wrap gap-2">{children}</div>}
      </div>
    </div>
  );
}

export function Card({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl border border-line bg-surface p-5 shadow-sm ${className}`}>
      {title && <h2 className="mb-3 font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

/** A phone, even one showing the desktop site (class set by public/theme-init.js). */
export const phoneDevice = () => document.documentElement.classList.contains('phone');

/**
 * Text fields focus themselves only with a mouse: on touch screens the keyboard would pop
 * up at once and push the sheet out of place - people tap the field when they want to type.
 */
export const autoFocusText = () => !phoneDevice() && (window.matchMedia?.('(pointer: fine)').matches ?? true);

/** Phones (below sm, or a phone in desktop mode): true while the screen is that narrow. */
export function usePhone(): boolean {
  const query = typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 639px)') : null;
  const [phone, setPhone] = useState(() => phoneDevice() || (query?.matches ?? false));
  useEffect(() => {
    if (!query) return;
    const onChange = () => setPhone(phoneDevice() || query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return phone;
}

/**
 * Phones: the platform's bottom sheet - pull it down or flick to close, it scrolls on its own
 * (the page behind stays put) and stays above the keyboard. Desktop: a centred card. Both
 * close on a tap beside them or Escape.
 */
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  const phone = usePhone();
  useEffect(() => {
    if (phone) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, phone]);
  if (phone) {
    return createPortal(
      <BottomSheet label={title} onClosed={onClose}>
        {() => (
          <div className="pb-5">
            <h2 className="mb-4 text-lg font-bold">{title}</h2>
            {children}
          </div>
        )}
      </BottomSheet>,
      document.body,
    );
  }
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label={t('common.close')} onClick={onClose} className="dlg-fade absolute inset-0 bg-slate-900/40 backdrop-blur-sm dark:bg-black/60" />
      <div className="dlg-in relative max-h-[88vh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-3xl border border-line bg-surface px-6 pb-6 shadow-2xl">
        <div className="sticky top-0 z-10 -mx-6 mb-3 flex items-center justify-between gap-3 bg-surface/90 px-6 pt-5 pb-3 backdrop-blur">
          <h2 className="min-w-0 truncate text-lg font-bold">{title}</h2>
          <button type="button" aria-label={t('common.close')} onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full text-slate-500 transition hover:bg-ink/5 hover:text-ink dark:hover:bg-white/10">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const field =
  'app-field block min-h-11 w-full rounded-2xl border border-line bg-ink/[0.025] px-3.5 py-2.5 font-normal tracking-normal text-ink outline-none transition duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-brand focus:bg-surface focus:ring-4 focus:ring-brand/15 dark:bg-white/[0.04] dark:hover:border-white/20 dark:focus:bg-surface';
/** The label above a field. */
export const fieldLabel = 'block min-w-0 text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400';
export const primaryButton =
  'inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-white shadow-sm shadow-brand/25 transition duration-200 hover:bg-brand-hover hover:shadow-md hover:shadow-brand/30 active:scale-[0.98] disabled:opacity-50';
export const secondaryButton =
  'inline-flex min-h-11 items-center justify-center rounded-full border border-line px-4 text-sm font-semibold transition duration-200 hover:bg-ink/5 active:scale-[0.98] disabled:opacity-50 dark:hover:bg-white/10';
export const linkButton = 'min-h-9 rounded-full px-3 text-sm font-medium text-slate-600 transition duration-200 hover:bg-ink/5 dark:text-slate-300 dark:hover:bg-white/10';

// ------------------------------------------------------------- confirm

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
}

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

/** The app's own confirmation dialog instead of window.confirm: `await confirm({...})`. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const confirm = useCallback((options: ConfirmOptions) => {
    setPending(options);
    return new Promise<boolean>((resolve) => (resolver.current = resolve));
  }, []);
  const close = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setPending(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <Dialog title={pending.title} onClose={() => close(false)}>
          {pending.message && <p className="text-sm text-slate-600 dark:text-slate-300">{pending.message}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => close(false)} className={secondaryButton}>
              {t('common.cancel')}
            </button>
            <button
              autoFocus
              onClick={() => close(true)}
              className={pending.danger ? 'inline-flex min-h-11 items-center rounded-full bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700' : primaryButton}
            >
              {pending.confirmLabel ?? t('common.ok')}
            </button>
          </div>
        </Dialog>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm needs a ConfirmProvider');
  return confirm;
}

// ------------------------------------------------------------- toast

interface Toast {
  message: string;
  action?: { label: string; run: () => void };
}

const ToastContext = createContext<((toast: Toast) => void) | null>(null);

const TOAST_MS = 6000;

/**
 * A short note at the bottom - "Block deleted · Undo". Results show briefly where the
 * action was (UI rules), and an undo makes a quick delete safe without asking first.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((next: Toast) => {
    window.clearTimeout(timer.current);
    setToast(next);
    timer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast &&
        createPortal(
          <div role="status" className="dlg-in fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-canvas shadow-2xl lg:bottom-8">
            <span className="min-w-0 flex-1">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.run();
                  setToast(null);
                }}
                className="min-h-9 shrink-0 rounded-full px-3 font-semibold text-brand hover:bg-white/10"
              >
                {toast.action.label}
              </button>
            )}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast needs a ToastProvider');
  return show;
}

/** Delete: a soft red pill with a bin - clear, but not shouting. */
export const deleteButton =
  'inline-flex min-h-11 items-center gap-2 rounded-full bg-red-50 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-100 active:scale-[0.98] dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20';

export function BinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  );
}
