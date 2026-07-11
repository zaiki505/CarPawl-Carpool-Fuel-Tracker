import React from "react";
import { Sheet } from "./ui/Sheet.jsx";
import { ChevronRight } from "./ui/Icons.jsx";

/* Bottom-sheet breakdown behind a dashboard summary card (#2). Generic: the
   caller passes ready-made rows so the same sheet serves "To collect", "To pay",
   fuel spend by vehicle, and this month's refuels. When `onRowClick` is given,
   rows become tappable (e.g. To collect / To pay -> record a payment). */
export function BreakdownSheet({ title, subtitle, rows = [], emptyText, onRowClick, onClose }) {
  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <button className="cta-secondary btn-block" type="button" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="field-grid">
        {subtitle && (
          <p className="field-hint" style={{ marginTop: 0 }}>
            {subtitle}
          </p>
        )}
        {rows.length === 0 ? (
          <p className="muted" style={{ textAlign: "center", padding: "1rem 0" }}>
            {emptyText}
          </p>
        ) : (
          <div className="breakdown-list">
            {rows.map((r, i) => {
              const inner = (
                <>
                  <span className="breakdown-row__info">
                    <span className="breakdown-row__label">{r.label}</span>
                    {r.sublabel && <span className="breakdown-row__sub">{r.sublabel}</span>}
                  </span>
                  <span className={"breakdown-row__amt " + (r.tone || "")}>{r.amount}</span>
                  {onRowClick && (
                    <ChevronRight size={16} className="breakdown-row__chev" />
                  )}
                </>
              );
              return onRowClick ? (
                <button
                  key={i}
                  type="button"
                  className="breakdown-row breakdown-row--tappable"
                  onClick={() => onRowClick(r)}
                >
                  {inner}
                </button>
              ) : (
                <div className="breakdown-row" key={i}>
                  {inner}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Sheet>
  );
}
