import React, { useEffect } from "react";
import { X } from "./Icons.jsx";

/* Bottom sheet - the slide-up panel. Glass panel treatment, enters with the
   sheetUp (blur-slide) keyframe. Tapping the scrim or the close button, or
   pressing Escape, dismisses it. */
export function Sheet({ title, onClose, children, footer, banner }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      // Defer to whatever's layered above the sheet: a confirm dialog / action
      // menu (.modal-scrim) or a portalled popover (date picker / select menu)
      // each handle their own Escape, so this press should close only the
      // topmost one, not the sheet underneath it in the same keystroke.
      if (document.querySelector(".modal-scrim, .z-dp-menu, .z-select__menu")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    // lock body scroll while open
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="sheet-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet__grip" />
        <div className="sheet__head">
          <h2 className="sheet__title">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close" type="button">
            <X size={18} />
          </button>
        </div>
        {banner && <div className="sheet__banner">{banner}</div>}
        <div className="sheet__body">{children}</div>
        {footer && <div className="sheet__foot">{footer}</div>}
      </div>
    </div>
  );
}
