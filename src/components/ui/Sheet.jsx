import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "./Icons.jsx";
import { haptic } from "../../lib/haptics.js";

/* Bottom sheet - the slide-up panel. Glass panel treatment, enters with the
   sheetUp (blur-slide) keyframe. Tapping the scrim or the close button, or
   pressing Escape, dismisses it. The grip + header are also a drag handle: the
   sheet follows your finger up (with resistance) and down, springs back when
   released, and dismisses when dragged down past a threshold. Every dismiss
   plays a slide-to-bottom outro before it unmounts. */
const DISMISS_THRESHOLD_PX = 110;
const OUTRO_MS = 260;

export function Sheet({ title, onClose, children, footer, banner }) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);
  const startY = useRef(null);
  const closeTimer = useRef(null);

  // Play the slide-down outro, then actually unmount (via the parent's onClose).
  function requestClose() {
    if (closing) return;
    setClosing(true);
    closeTimer.current = setTimeout(onClose, OUTRO_MS);
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      // Defer to whatever's layered above the sheet: a confirm dialog / action
      // menu (.modal-scrim) or a portalled popover (date picker / select menu)
      // each handle their own Escape, so this press should close only the
      // topmost one, not the sheet underneath it in the same keystroke.
      if (document.querySelector(".modal-scrim, .z-dp-menu, .z-select__menu")) return;
      requestClose();
    };
    window.addEventListener("keydown", onKey);
    // lock body scroll while open
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      clearTimeout(closeTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  // ---- Drag (grip + header): follow finger up/down, spring back or dismiss ----
  function onDragStart(e) {
    if (closing) return;
    // Don't hijack a tap on the close button (or any control) as a drag.
    if (e.target.closest("button")) return;
    startY.current = e.clientY;
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onDragMove(e) {
    if (startY.current == null) return;
    const raw = e.clientY - startY.current;
    // Downward moves 1:1; upward gets rubber-band resistance (it springs back,
    // the sheet doesn't actually expand upward).
    setDragY(raw >= 0 ? raw : raw * 0.35);
  }
  function onDragEnd(e) {
    if (startY.current == null) return;
    const dy = e.clientY - startY.current;
    startY.current = null;
    setDragging(false);
    if (dy > DISMISS_THRESHOLD_PX) {
      haptic("light");
      requestClose();
    } else {
      setDragY(0); // spring back (transition handles the ease)
    }
  }

  // Portalled to <body> so the sheet always sits in the ROOT stacking context -
  // above the FAB (z-index 41) and free of any screen-level transform/animation
  // stacking context (a sheet rendered inline inside a `.stagger` screen would
  // otherwise be trapped under the FAB and inherit the wrong entrance animation).
  return createPortal(
    <div
      className={"sheet-scrim" + (closing ? " sheet-scrim--closing" : "")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        className={"sheet" + (closing ? " sheet--closing" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? "none" : undefined,
        }}
      >
        <div
          className="sheet__drag-handle"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <div className="sheet__grip" />
          <div className="sheet__head">
            <h2 className="sheet__title">{title}</h2>
            <button className="icon-btn" onClick={requestClose} aria-label="Close" type="button">
              <X size={18} />
            </button>
          </div>
        </div>
        {banner && <div className="sheet__banner">{banner}</div>}
        <div className="sheet__body">{children}</div>
        {footer && <div className="sheet__foot">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
