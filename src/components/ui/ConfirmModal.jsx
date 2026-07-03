import React from "react";
import { useApp } from "../../app/AppContext.jsx";

/* Confirmation dialog for destructive / irreversible actions (§8). Driven by
   the promise-based askConfirm() in AppContext. */
export function ConfirmModal() {
  const { confirm, resolveConfirm } = useApp();
  if (!confirm) return null;

  return (
    <div
      className="modal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) resolveConfirm(false);
      }}
    >
      <div className="modal" role="alertdialog" aria-modal="true">
        <h3 className="modal__title">{confirm.title}</h3>
        {confirm.body && <p className="modal__body">{confirm.body}</p>}
        <div className="modal__actions">
          <button
            className="cta-secondary"
            type="button"
            onClick={() => resolveConfirm(false)}
          >
            {confirm.cancelLabel}
          </button>
          <button
            className={confirm.danger ? "cta-primary btn-danger" : "cta-primary"}
            type="button"
            onClick={() => resolveConfirm(true)}
          >
            {confirm.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
