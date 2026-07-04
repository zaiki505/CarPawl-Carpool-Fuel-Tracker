import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatDate, todayISODate } from "../../lib/format.js";
import { Calendar, ChevronLeft, ChevronRight, X } from "./Icons.jsx";

/* A branded date picker with a month-grid calendar popover, replacing the
   browser's native date input (#5). Value is an ISO 'YYYY-MM-DD' string;
   onChange("") clears (when `clearable`).

   The calendar is PORTALLED to <body> and fixed-positioned from the trigger so
   it escapes the glass panels' backdrop-filter stacking contexts. */
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MENU_H = 300;

function toISO(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function DatePicker({ value, onChange, placeholder = "Pick a date", clearable = false }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const base = value ? new Date(value) : new Date();
  const [view, setView] = useState({ y: base.getFullYear(), m: base.getMonth() });

  useEffect(() => {
    if (value) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) setView({ y: d.getFullYear(), m: d.getMonth() });
    }
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (triggerRef.current?.contains(e.target) || menuRef.current?.contains(e.target))
        return;
      setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
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

  const firstDay = new Date(view.y, view.m, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const todayISO = todayISODate();
  const monthLabel = firstDay.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const openMenu = () => {
    if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    setOpen((o) => !o);
  };
  const pick = (d) => {
    onChange(toISO(view.y, view.m, d));
    setOpen(false);
  };
  const shift = (delta) =>
    setView((v) => {
      const nm = v.m + delta;
      return { y: v.y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 };
    });

  const flipUp = rect && rect.bottom + MENU_H + 8 > window.innerHeight && rect.top > MENU_H;
  const menuStyle = rect
    ? {
        position: "fixed",
        left: Math.min(rect.left, window.innerWidth - 288),
        ...(flipUp
          ? { bottom: window.innerHeight - rect.top + 6 }
          : { top: rect.bottom + 6 }),
      }
    : {};

  return (
    <div className="z-datepicker">
      <button
        ref={triggerRef}
        type="button"
        className="z-select__trigger"
        aria-expanded={open}
        onClick={openMenu}
      >
        <span className="z-select__value">
          {value ? formatDate(value) : <span className="faint">{placeholder}</span>}
        </span>
        {clearable && value ? (
          <span
            className="z-dp-clear"
            role="button"
            tabIndex={0}
            aria-label="Clear date"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
          >
            <X size={14} />
          </span>
        ) : (
          <Calendar size={15} className="z-select__chev" />
        )}
      </button>
      {open &&
        createPortal(
          <div className="z-dp-menu" ref={menuRef} style={menuStyle}>
            <div className="z-dp-head">
              <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label="Previous month">
                <ChevronLeft size={16} />
              </button>
              <span className="z-dp-month">{monthLabel}</span>
              <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label="Next month">
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="z-dp-grid z-dp-weekdays">
              {WEEKDAYS.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="z-dp-grid">
              {cells.map((d, i) =>
                d === null ? (
                  <span key={i} />
                ) : (
                  <button
                    key={i}
                    type="button"
                    className={
                      "z-dp-day" +
                      (toISO(view.y, view.m, d) === value ? " is-sel" : "") +
                      (toISO(view.y, view.m, d) === todayISO ? " is-today" : "")
                    }
                    onClick={() => pick(d)}
                  >
                    {d}
                  </button>
                )
              )}
            </div>
            <div className="z-dp-foot">
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  onChange(todayISODate());
                  setOpen(false);
                }}
              >
                Today
              </button>
              {clearable && (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
