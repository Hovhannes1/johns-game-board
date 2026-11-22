'use client';

import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  /** Called when the user dismisses with Escape or the backdrop. Omit to make the dialog mandatory. */
  onClose?: () => void;
  className?: string;
}

/**
 * Modal built on the native <dialog> element: focus is moved inside and the
 * page behind becomes inert, which keeps keyboard and screen reader use sane.
 */
export function Dialog({ open, title, children, onClose, className = '' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose?.();
      }}
      onClick={(event) => {
        if (onClose && event.target === event.currentTarget) onClose();
      }}
      className={`m-auto max-h-[92dvh] w-[min(34rem,94vw)] overflow-auto rounded-xl border border-brass/40 bg-felt-900 p-0 text-parchment shadow-2xl backdrop:bg-black/65 backdrop:backdrop-blur-[2px] ${className}`}
    >
      <div className="p-5 sm:p-6">
        <h2 id={titleId} className="mb-4 font-display text-2xl font-semibold text-brass">
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabledReason,
  className = '',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  /** When set, the button is inert and the reason is exposed to assistive tech. */
  disabledReason?: string | null;
  className?: string;
  type?: 'button' | 'submit';
}) {
  const disabled = Boolean(disabledReason);
  const styles = {
    primary: 'bg-brass text-felt-950 hover:bg-[#d9b45c] font-semibold',
    secondary: 'border border-parchment/30 bg-felt-800 text-parchment hover:border-brass/70',
    ghost: 'text-parchment/80 hover:text-parchment hover:bg-white/5',
  }[variant];
  return (
    <button
      type={type}
      aria-disabled={disabled || undefined}
      title={disabledReason ?? undefined}
      onClick={disabled ? undefined : onClick}
      className={`rounded-lg px-4 py-2 text-sm transition-colors ${styles} ${disabled ? 'cursor-not-allowed opacity-45' : ''} ${className}`}
    >
      {children}
    </button>
  );
}
