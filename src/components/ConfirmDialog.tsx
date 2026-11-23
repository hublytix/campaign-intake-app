"use client";

import { useEffect, useId, useRef } from "react";

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onClose,
  danger = false,
  disabled = false,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  const headingId = useId();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-gray-900/40"
      onClose={onClose}
    >
      <form
        method="dialog"
        className="p-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (!disabled) onConfirm();
        }}
      >
        <h2 id={headingId} className="text-lg font-semibold text-gray-900">
          {title}
        </h2>
        <div className="mt-3 text-sm leading-6 text-gray-600">{children}</div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            onClick={onClose}
          >
            {cancelLabel}
          </button>
          <button
            type="submit"
            disabled={disabled}
            className={
              danger
                ? "rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 hover:text-white focus:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:text-white"
                : "btn-primary px-4 py-2"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
