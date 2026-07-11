import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "./Icons.jsx";
import { GLOSSARY } from "../../lib/glossary.js";

/* A small (i) icon that shows a brief explanation on tap. Pass a `term` (key in
   the shared GLOSSARY) or a raw `text`. The popover is portalled to <body> and
   positioned under the icon, so it works inside sheets too. Tap outside, scroll,
   or Escape to dismiss. */
export function InfoTip({ term, text, label }) {
  const g = term ? GLOSSARY[term] : null;
  const title = label || g?.term;
  const content = text || g?.short || "";
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);

  function toggle(e) {
    e.preventDefault();
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current.getBoundingClientRect();
    const width = 240;
    setPos({
      top: r.bottom + 6,
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      width,
    });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDoc = (e) => {
      if (!e.target.closest(".info-tip")) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("click", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("click", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!content) return null;

  return (
    <span className="info-tip">
      {/* A <span role="button"> rather than a real <button>: buttons are
          "labelable", so when this sits inside a Field's <label> the whole
          label forwards its clicks here - making the tap target the entire
          label row. A span isn't labelable, so only the icon triggers it. */}
      <span
        ref={btnRef}
        role="button"
        tabIndex={0}
        className="info-tip__btn"
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle(e);
          }
        }}
        aria-label={title ? `About ${title}` : "More info"}
      >
        <Info size={13} />
      </span>
      {open &&
        pos &&
        createPortal(
          <div
            className="info-tip__pop"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
            role="tooltip"
          >
            {title && <strong className="info-tip__title">{title}</strong>}
            <span className="info-tip__text">{content}</span>
          </div>,
          document.body
        )}
    </span>
  );
}
