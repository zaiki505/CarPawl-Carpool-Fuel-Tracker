import React from "react";
import { Sheet } from "./ui/Sheet.jsx";
import { formatMoneyShort, formatDate } from "../lib/format.js";
import { Fuel, ChevronRight } from "./ui/Icons.jsx";

/* Bottom-sheet trip picker used when a person owes on more than one trip - "which
   trip is this payment for?". Uses the same row styling as the apply-credit debt
   list so picking a trip, applying credit, and recording a payment all look of a
   piece. Each row taps straight through to record the payment on that trip. */
export function PickTripSheet({ title, subtitle, trips, groupName, onPick, onClose }) {
  return (
    <Sheet
      title={title}
      onClose={onClose}
      manageBack
      footer={
        <button className="cta-secondary btn-block" type="button" onClick={onClose}>
          Cancel
        </button>
      }
    >
      <div className="field-grid">
        {subtitle && (
          <p className="field-hint" style={{ marginTop: 0 }}>
            {subtitle}
          </p>
        )}
        <div className="credit-debt-list">
          {trips.map(({ entry, amount }) => (
            <button
              key={entry.id}
              type="button"
              className="credit-debt-row credit-debt-row--pick"
              onClick={() => onPick(entry)}
            >
              <span className="credit-debt-row__lead">
                <Fuel size={18} />
              </span>
              <span className="credit-debt-row__info">
                <span className="credit-debt-row__name">{entry.title || groupName}</span>
                <span className="credit-debt-row__sub">
                  {amount > 0.005 ? `owes ${formatMoneyShort(amount)}` : "settled - add credit"} ·{" "}
                  {formatDate(entry.date)}
                </span>
              </span>
              <ChevronRight size={18} className="credit-debt-row__chev" />
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
