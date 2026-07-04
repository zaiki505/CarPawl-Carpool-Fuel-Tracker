import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "./Icons.jsx";

/* A styled dropdown that replaces the native <select> (#9-Pass4) and supports
   multi-select with checkboxes (#10-Pass4).

   The menu is PORTALLED to <body> and fixed-positioned from the trigger's rect.
   This is deliberate: our glass panels use backdrop-filter, which creates a
   stacking context that would otherwise trap the menu's z-index beneath sibling
   content. */
export function Select({ value, onChange, options, multi = false, placeholder = "Select", allLabel }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const place = () => {
    if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (
        triggerRef.current?.contains(e.target) ||
        menuRef.current?.contains(e.target)
      )
        return;
      setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    // Close on page scroll, but not when scrolling within the menu's own list.
    const onScroll = (e) => {
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const selectedArr = multi ? value || [] : value != null ? [value] : [];

  let triggerText;
  if (multi) {
    if (selectedArr.length === 0) triggerText = allLabel || placeholder;
    else if (selectedArr.length === 1)
      triggerText = options.find((o) => o.value === selectedArr[0])?.label || "1 selected";
    else triggerText = `${selectedArr.length} selected`;
  } else {
    triggerText = options.find((o) => o.value === value)?.label || placeholder;
  }

  function toggle() {
    if (!open) place();
    setOpen((o) => !o);
  }
  function pick(v) {
    if (multi) {
      const set = new Set(selectedArr);
      if (set.has(v)) set.delete(v);
      else set.add(v);
      onChange([...set]);
    } else {
      onChange(v);
      setOpen(false);
    }
  }

  // Downward by default; flip up when there isn't room.
  const estH = Math.min(260, options.length * 42 + 12);
  const flipUp = rect && rect.bottom + estH + 8 > window.innerHeight && rect.top > estH;
  const menuStyle = rect
    ? {
        position: "fixed",
        left: rect.left,
        width: rect.width,
        ...(flipUp
          ? { bottom: window.innerHeight - rect.top + 6 }
          : { top: rect.bottom + 6 }),
      }
    : {};

  return (
    <div className="z-select">
      <button
        ref={triggerRef}
        type="button"
        className="z-select__trigger"
        aria-expanded={open}
        onClick={toggle}
      >
        <span className="z-select__value">{triggerText}</span>
        <ChevronDown size={16} className={"z-select__chev" + (open ? " is-open" : "")} />
      </button>
      {open &&
        createPortal(
          <div className="z-select__menu" role="listbox" ref={menuRef} style={menuStyle}>
            {options.map((o) => {
              const on = selectedArr.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={"z-select__opt" + (on ? " is-on" : "")}
                  onClick={() => pick(o.value)}
                >
                  <span className="z-select__check">{on && <Check size={14} />}</span>
                  {o.label}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
