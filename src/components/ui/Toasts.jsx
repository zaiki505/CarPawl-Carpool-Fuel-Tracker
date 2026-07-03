import React from "react";
import { useApp } from "../../app/AppContext.jsx";

/* Transient toast stack - extends the FormStatus success/error banner pattern.
   Tap to dismiss early. */
export function Toasts() {
  const { toasts, dismissToast } = useApp();
  if (!toasts.length) return null;
  return (
    <div className="toast-wrap" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="toast"
          data-state={t.state}
          role="status"
          onClick={() => dismissToast(t.id)}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
