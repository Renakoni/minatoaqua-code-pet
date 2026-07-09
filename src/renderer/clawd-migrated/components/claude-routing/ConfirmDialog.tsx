import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Small confirm dialog matching cc-switch's ConfirmDialog usage:
 * delete confirmation and soft-validation "save anyway" prompts.
 * Portaled to <body> so transformed/filtered ancestors cannot trap it.
 */
export function ConfirmDialog({
  title,
  children,
  cancelLabel,
  confirmLabel,
  danger,
  onCancel,
  onConfirm
}: {
  title: string;
  children: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return createPortal(
    <div className="ccs-confirm-backdrop" role="presentation" onClick={onCancel}>
      <div className="ccs-confirm-dialog" role="alertdialog" aria-modal="true" aria-label={title} onClick={event => event.stopPropagation()}>
        <h3>{title}</h3>
        <div className="ccs-confirm-body">{children}</div>
        <footer>
          <button type="button" className="ccs-panel-cancel" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className={danger ? "ccs-confirm-danger" : "ccs-save-button"} onClick={onConfirm}>{confirmLabel}</button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
