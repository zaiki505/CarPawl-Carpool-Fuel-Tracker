import React, { useEffect } from "react";

/* A small centered action menu (list of choices) for quick contextual actions,
   e.g. tapping a passenger's balance. Same glass-modal treatment as the confirm
   dialog. Tap the scrim or press Escape to dismiss. */
export function ActionMenu({ title, subtitle, items, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-scrim"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal" role="menu" aria-label={title}>
        {title && <h3 className="modal__title">{title}</h3>}
        {subtitle && <p className="modal__body" style={{ marginBottom: "1rem" }}>{subtitle}</p>}
        <div className="action-menu">
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              className={"action-menu__item" + (it.danger ? " action-menu__item--danger" : "")}
              onClick={it.onClick}
            >
              {it.icon && <span className="action-menu__icon">{it.icon}</span>}
              <span className="action-menu__body">
                <span className="action-menu__label">{it.label}</span>
                {it.sublabel && (
                  <span className="action-menu__sub">{it.sublabel}</span>
                )}
              </span>
            </button>
          ))}
        </div>
        <button
          className="cta-secondary btn-block"
          type="button"
          onClick={onClose}
          style={{ marginTop: "0.9rem" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
