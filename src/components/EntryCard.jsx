import React, { useState } from "react";
import {
  share,
  outstanding,
  statusOf,
  paymentsFor,
  entryEfficiency,
  entryTotalPaid,
  splitMethodOf,
} from "../lib/calc.js";
import {
  formatMoney,
  formatMoneyShort,
  formatDate,
  formatDateShort,
  formatLiters,
  formatKm,
  formatKmpl,
} from "../lib/format.js";
import { whoName } from "../lib/names.js";
import { splitMethodLabel } from "../lib/splitMethods.js";
import { StatusBadge } from "./ui/Primitives.jsx";
import { Fuel, ChevronDown, Pencil, Trash2, Wallet } from "./ui/Icons.jsx";

/* One fill-up. Collapsed: date/title + collected/owed + a roll-up status.
   Expanded: the fuel breakdown, the split method, and each passenger's share /
   outstanding / status, with per-passenger payment history (edit/delete) and a
   "record payment" affordance. Used on Dashboard, Group Detail and History. */
export function EntryCard({
  entry,
  payments,
  peopleMap,
  onRecordPayment,
  onEditPayment,
  onDeletePayment,
  onEdit,
  onDelete,
  defaultExpanded = false,
}) {
  const [open, setOpen] = useState(defaultExpanded);
  const entryPayments = (payments || []).filter((p) => p.entryId === entry.id);
  const passengers = entry.passengers || [];
  const eff = entryEfficiency(entry);
  const method = splitMethodOf(entry);

  const collected = entryTotalPaid(entry, entryPayments);
  const hasPax = passengers.length > 0;

  // roll-up status across passengers (for the collapsed badge)
  let rollup = null;
  if (hasPax) {
    const statuses = passengers.map((p) => statusOf(entry, p.who, entryPayments));
    if (statuses.every((s) => s === "paid")) rollup = "paid";
    else if (statuses.some((s) => s === "credit")) rollup = "credit";
    else if (statuses.some((s) => s === "partial" || s === "paid")) rollup = "partial";
    else rollup = "unpaid";
  }

  return (
    <div className="entry-card">
      <button
        className="entry-card__head"
        data-no-pop
        onClick={() => setOpen((o) => !o)}
        type="button"
        aria-expanded={open}
      >
        <span className="list-row__icon">
          <Fuel size={20} />
        </span>
        <div className="list-row__body">
          <div className="list-row__title">{entry.title || "Fill-up"}</div>
          <div className="list-row__meta">
            {formatDate(entry.date)} · {formatLiters(entry.totalLiters)}
            {eff != null ? ` · ${formatKmpl(eff)}` : ""}
          </div>
        </div>
        <div className="list-row__trailing">
          {hasPax ? (
            <span className="list-row__amount">
              {formatMoneyShort(collected)}
              <span className="faint">/{formatMoneyShort(entry.totalCost)}</span>
            </span>
          ) : (
            <span className="list-row__amount">{formatMoney(entry.totalCost)}</span>
          )}
          {rollup && <StatusBadge status={rollup} />}
        </div>
        <ChevronDown
          size={18}
          className={"entry-card__chev" + (open ? " is-open" : "")}
        />
      </button>

      {open && (
        <div className="entry-card__body">
          <div className="entry-facts">
            <Fact label="Distance" value={formatKm(entry.totalDistance)} />
            <Fact label="Liters" value={formatLiters(entry.totalLiters)} />
            <Fact label="Fuel price" value={`${formatMoneyShort(entry.fuelPricePerLiter)}/L`} />
            <Fact
              label="Efficiency"
              value={eff != null ? formatKmpl(eff) : "—"}
              hint={eff == null ? "not measured" : "measured"}
            />
          </div>

          {hasPax && (
            <div className="split-chip-row">
              <span className="chip-fact">Split: {splitMethodLabel(method)}</span>
              {method === "driver_comp" && (
                <span className="chip-fact">
                  Tolls {formatMoneyShort(entry.tolls || 0)} · Parking{" "}
                  {formatMoneyShort(entry.parking || 0)} · +{entry.maintenancePct || 0}%
                </span>
              )}
            </div>
          )}

          {!hasPax ? (
            <p className="faint" style={{ fontSize: "0.8rem", margin: "0.4rem 0 0" }}>
              Personal fill-up — no passengers to split with.
            </p>
          ) : (
            <div className="pax-list">
              {passengers.map((p, i) => {
                const s = share(entry, p.who);
                const paid = paymentsFor(entry, p.who, entryPayments);
                const out = outstanding(entry, p.who, entryPayments);
                const status = statusOf(entry, p.who, entryPayments);
                const theirPayments = entryPayments.filter((pm) =>
                  sameWho(pm.who, p.who)
                );
                return (
                  <div className="pax-row" key={i}>
                    <div className="pax-row__top">
                      <div className="pax-row__main">
                        <span className="pax-row__name">{whoName(p.who, peopleMap)}</span>
                        <span className="pax-row__sub">
                          {method === "distance"
                            ? `${formatKm(p.distanceAssigned)} · `
                            : ""}
                          share {formatMoney(s)}
                          {paid > 0 ? ` · paid ${formatMoney(paid)}` : ""}
                        </span>
                      </div>
                      <div className="pax-row__end">
                        <StatusBadge
                          status={status}
                          label={
                            status === "credit"
                              ? `${formatMoneyShort(Math.abs(out))} credit`
                              : status === "unpaid" || status === "partial"
                              ? `owes ${formatMoneyShort(out)}`
                              : "Paid"
                          }
                        />
                        {onRecordPayment && (
                          <button
                            className="mini-btn"
                            type="button"
                            onClick={() => onRecordPayment(entry, p.who)}
                          >
                            <Wallet size={13} /> Pay
                          </button>
                        )}
                      </div>
                    </div>

                    {theirPayments.length > 0 && (
                      <div className="pay-history">
                        {theirPayments.map((pm) => (
                          <div className="pay-chip" key={pm.id}>
                            <span className="pay-chip__amt">{formatMoney(pm.amount)}</span>
                            <span className="pay-chip__meta">
                              {formatDateShort(pm.date)}
                              {pm.note ? ` · ${pm.note}` : ""}
                            </span>
                            {onEditPayment && (
                              <button
                                className="pay-chip__btn"
                                type="button"
                                aria-label="Edit payment"
                                onClick={() => onEditPayment(entry, pm)}
                              >
                                <Pencil size={12} />
                              </button>
                            )}
                            {onDeletePayment && (
                              <button
                                className="pay-chip__btn pay-chip__btn--danger"
                                type="button"
                                aria-label="Delete payment"
                                onClick={() => onDeletePayment(entry, pm)}
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="entry-card__actions">
            {onEdit && (
              <button className="mini-btn" type="button" onClick={() => onEdit(entry)}>
                <Pencil size={13} /> Edit
              </button>
            )}
            {onDelete && (
              <button
                className="mini-btn mini-btn--danger"
                type="button"
                onClick={() => onDelete(entry)}
              >
                <Trash2 size={13} /> Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function sameWho(a, b) {
  if (!a || !b || a.type !== b.type) return false;
  return a.type === "me" ? true : a.personId === b.personId;
}

function Fact({ label, value, hint }) {
  return (
    <div className="fact">
      <span className="fact__label">{label}</span>
      <span className="fact__value">{value}</span>
      {hint && <span className="fact__hint">{hint}</span>}
    </div>
  );
}
