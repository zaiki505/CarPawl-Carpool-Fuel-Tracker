import React, { useMemo, useState } from "react";
import {
  entryShares,
  outstanding,
  statusOf,
  paymentsFor,
  entryEfficiencyDisplay,
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
  isFutureDate,
} from "../lib/format.js";
import { whoName } from "../lib/names.js";
import { whoKey, whoEquals, isMe } from "../lib/identity.js";
import { splitMethodShort } from "../lib/splitMethods.js";
import { StatusBadge } from "./ui/Primitives.jsx";
import { SwipeSettle } from "./ui/SwipeSettle.jsx";
import { Fuel, ChevronDown, Pencil, Copy, Trash2, Wallet } from "./ui/Icons.jsx";

// Roll-up status: text colour for the collected figure in the collapsed row.
const STATUS_COLOR = {
  unpaid: "#ff6b81",
  partial: "var(--tier-intermediate)",
  paid: "#34d399",
  credit: "var(--tag-web)",
};

/* One fill-up.
   - `ownedByMe`: your own vehicle -> your "Me" share shows for reference, never billed or collectible.
   - `onlyWho`: a Set of whoKeys to show; when set, non-matching passengers are hidden
                and the collected/total figures reflect only the selected ones. */
export function EntryCard({
  entry,
  payments,
  peopleMap,
  ownedByMe = false,
  ownerName,
  onlyWho = null,
  fallbackTitle,
  onRecordPayment,
  onEditPayment,
  onDeletePayment,
  onQuickSettle,
  onClearPayments,
  onEdit,
  onDuplicate,
  onDelete,
  defaultExpanded = false,
}) {
  const [open, setOpen] = useState(defaultExpanded);
  // whoKey -> bool: which passengers have their full payment history expanded.
  // Per-passenger so one rider's "+N more" doesn't expand everyone's list.
  const [expandedPay, setExpandedPay] = useState({});
  const [dissolving, setDissolving] = useState(null); // whoKey mid-dissolve

  // The entry's cent-rounded shares, computed once and indexed by whoKey, so
  // the per-passenger renders below don't each re-derive the whole entry.
  const shareByWho = useMemo(() => {
    const m = new Map();
    const arr = entryShares(entry);
    (entry.passengers || []).forEach((p, i) => m.set(whoKey(p.who), arr[i] || 0));
    return m;
  }, [entry]);
  const shareOf = (who) => shareByWho.get(whoKey(who)) || 0;

  // Thanos-dissolve their payment chips, then wipe the records once the dust
  // settles so the row doesn't flicker before the animation plays.
  function clearWithDissolve(who, ids) {
    setDissolving(whoKey(who));
    window.setTimeout(() => {
      onClearPayments(entry, who, ids);
      setDissolving(null);
    }, 560);
  }
  const entryPayments = (payments || []).filter((p) => p.entryId === entry.id);
  const allPassengers = entry.passengers || [];
  const method = splitMethodOf(entry);
  const effDisp = entryEfficiencyDisplay(entry);
  // A future-dated refuel is "upcoming" - not yet counted in any balance or
  // spend total (see calc.balanceForWho / fuelSpend), just shown as scheduled.
  const upcoming = isFutureDate(entry.date);

  // Passengers we actually show/count (the History filter applied). In your own
  // vehicle your "Me" share is billed and already covered - it counts toward
  // the fill-up total but never shows up as something owed to chase.
  const passengers = onlyWho
    ? allPassengers.filter((p) => onlyWho.has(whoKey(p.who)))
    : allPassengers;
  const otherPax = passengers.filter((p) => !(ownedByMe && isMe(p.who)));
  const meShare = passengers
    .filter((p) => ownedByMe && isMe(p.who))
    .reduce((sum, p) => sum + shareOf(p.who), 0);

  // Billed includes your own share; collected counts that share as already
  // covered (you paid the pump) plus real passenger payments.
  const billable = passengers.reduce((sum, p) => sum + shareOf(p.who), 0);
  const collected =
    otherPax.reduce((sum, p) => sum + paymentsFor(entry, p.who, entryPayments), 0) +
    meShare;
  const hasPax = passengers.length > 0;

  // roll-up status across the collectible (non-Me) passengers
  let rollup = null;
  if (otherPax.length) {
    const statuses = otherPax.map((p) => statusOf(entry, p.who, entryPayments));
    if (statuses.every((s) => s === "paid")) rollup = "paid";
    else if (statuses.some((s) => s === "credit")) rollup = "credit";
    else if (statuses.some((s) => s === "partial" || s === "paid")) rollup = "partial";
    else rollup = "unpaid";
  } else if (hasPax) {
    rollup = "paid"; // only your own covered share
  }

  const effText =
    effDisp.value != null
      ? (effDisp.estimated ? "~" : "") + formatKmpl(effDisp.value)
      : null;

  return (
    <div className={"entry-card" + (upcoming ? " entry-card--upcoming" : "")}>
      <button
        className="entry-card__head"
        data-no-pop
        onClick={() => setOpen((o) => !o)}
        type="button"
        aria-expanded={open}
      >
        <span
          className={
            "list-row__icon " +
            (ownedByMe ? "list-row__icon--fillup" : "list-row__icon--carpool")
          }
        >
          <Fuel size={20} />
        </span>
        <div className="list-row__body">
          <div className="list-row__title">
            {entry.title || fallbackTitle || (ownedByMe ? "Refuel" : "Trip")}
          </div>
          <div className="list-row__meta">
            <span>
              {hasPax ? splitMethodShort(method) : ownedByMe ? "Personal refuel" : "Personal trip"}
            </span>
            <span
              className={
                "owner-chip " + (ownedByMe ? "owner-chip--mine" : "owner-chip--other")
              }
            >
              {ownedByMe ? "You" : ownerName || "Someone"}
            </span>
            {upcoming && <span className="upcoming-pill">Upcoming</span>}
          </div>
        </div>
        <div className="list-row__trailing">
          {hasPax ? (
            <span className="list-row__amount">
              <span style={{ color: STATUS_COLOR[rollup] }}>
                {formatMoneyShort(collected)}
              </span>
              <span className="faint">/{formatMoneyShort(billable)}</span>
            </span>
          ) : (
            <span className="list-row__amount">{formatMoney(entry.totalCost)}</span>
          )}
          <span className="entry-date">{formatDate(entry.date)}</span>
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
              value={effText || "-"}
              hint={effDisp.estimated ? "estimate" : "measured"}
            />
          </div>

          {hasPax && method === "driver_comp" && (
            <div className="split-chip-row">
              <span className="chip-fact">
                Tolls {formatMoneyShort(entry.tolls || 0)} · Parking{" "}
                {formatMoneyShort(entry.parking || 0)} · +{entry.maintenancePct || 0}%
              </span>
            </div>
          )}

          {!hasPax ? (
            <p className="faint" style={{ fontSize: "0.8rem", margin: "0.4rem 0 0" }}>
              Personal {ownedByMe ? "refuel" : "trip"} - no passengers to split with.
            </p>
          ) : (
            <div className="pax-list">
              {passengers.map((p, i) => {
                const meInOwned = ownedByMe && isMe(p.who);
                const s = shareOf(p.who);
                // your own share in your own vehicle: reference only.
                if (meInOwned) {
                  return (
                    <div className="pax-row pax-row--me" key={i}>
                      <div className="pax-row__top">
                        <div className="pax-row__main">
                          <span className="pax-row__name">You</span>
                          <span className="pax-row__sub">
                            your share {formatMoney(s)} · covered by you
                          </span>
                        </div>
                        <span className="badge badge--paid">billed</span>
                      </div>
                    </div>
                  );
                }
                const paid = paymentsFor(entry, p.who, entryPayments);
                const out = outstanding(entry, p.who, entryPayments);
                const status = statusOf(entry, p.who, entryPayments);
                const theirPayments = entryPayments.filter((pm) =>
                  whoEquals(pm.who, p.who)
                );
                const showThisPay = !!expandedPay[whoKey(p.who)];
                const visiblePay = showThisPay ? theirPayments : theirPayments.slice(0, 2);
                // Upcoming (future-dated) refuels aren't in effect yet - it
                // shares don't count toward balances (see calc.balanceForWho).
                // Clearing an already-recorded payment stays available.
                const canSettle = onQuickSettle && out > 0.005 && !upcoming;
                const canClear = onClearPayments && theirPayments.length > 0;
                const payIds = theirPayments.map((pm) => pm.id);
                const rowEl = (
                  <div className="pax-row">
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
                        {onRecordPayment && !upcoming && (
                          <button
                            className="mini-btn"
                            type="button"
                            onClick={() => onRecordPayment(entry, p.who, ownedByMe)}
                          >
                            <Wallet size={13} /> Pay
                          </button>
                        )}
                      </div>
                    </div>

                    {theirPayments.length > 0 && (
                      <div
                        className={
                          "pay-history" +
                          (dissolving === whoKey(p.who) ? " is-dissolving" : "")
                        }
                      >
                        {visiblePay.map((pm) => (
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
                                onClick={() => onEditPayment(entry, pm, ownedByMe)}
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
                        {theirPayments.length > 2 && (
                          <button
                            className="see-more-btn"
                            type="button"
                            onClick={() =>
                              setExpandedPay((mp) => ({
                                ...mp,
                                [whoKey(p.who)]: !mp[whoKey(p.who)],
                              }))
                            }
                          >
                            {showThisPay
                              ? "Show less"
                              : `+${theirPayments.length - 2} more payment${
                                  theirPayments.length - 2 === 1 ? "" : "s"
                                }`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
                return canSettle || canClear ? (
                  <SwipeSettle
                    key={i}
                    onSettle={
                      canSettle ? () => onQuickSettle(entry, p.who, out) : undefined
                    }
                    onDelete={
                      canClear ? () => clearWithDissolve(p.who, payIds) : undefined
                    }
                  >
                    {rowEl}
                  </SwipeSettle>
                ) : (
                  <React.Fragment key={i}>{rowEl}</React.Fragment>
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
            {onDuplicate && (
              <button className="mini-btn" type="button" onClick={() => onDuplicate(entry)}>
                <Copy size={13} /> Duplicate
              </button>
            )}
            {onDelete && (
              <button
                className="mini-btn mini-btn--danger"
                type="button"
                onClick={() => onDelete(entry, ownedByMe)}
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

function Fact({ label, value, hint }) {
  return (
    <div className="fact">
      <span className="fact__label">{label}</span>
      <span className="fact__value">{value}</span>
      {hint && <span className="fact__hint">{hint}</span>}
    </div>
  );
}
