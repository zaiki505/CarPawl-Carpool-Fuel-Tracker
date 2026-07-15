import React, { useMemo, useRef, useState } from "react";
import { useAppOptional } from "../app/AppContext.jsx";
import {
  entryShares,
  outstanding,
  statusOf,
  paymentsFor,
  entryEfficiencyDisplay,
  splitMethodOf,
  appliedCreditTo,
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
import { recurrenceLabel } from "../lib/recurrence.js";
import { StatusBadge } from "./ui/Primitives.jsx";
import { SwipeSettle } from "./ui/SwipeSettle.jsx";
import { Fuel, ChevronDown, Pencil, Copy, Trash2, Wallet, Repeat, Undo2, Check } from "./ui/Icons.jsx";

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
  ownerWho,
  vehicleName,
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
  applications = [],
  onReverseCredit,
  defaultExpanded = false,
}) {
  const [open, setOpen] = useState(defaultExpanded);
  // whoKey -> bool: which passengers have their full payment history expanded.
  // Per-passenger so one rider's "+N more" doesn't expand everyone's list.
  const [expandedPay, setExpandedPay] = useState({});
  const [dissolving, setDissolving] = useState(null); // whoKey mid-dissolve

  // Multi-select: long-press (touch) or right-click (desktop) selects this card
  // and enters selection mode; in that mode a tap toggles selection.
  const app = useAppOptional();
  const selectionMode = app?.selectionMode || false;
  const selectEntry = app?.selectEntry || (() => {});
  const toggleSelectEntry = app?.toggleSelectEntry || (() => {});
  const selected = app?.selectedEntries ? app.selectedEntries.has(entry.id) : false;
  const lpTimer = useRef(null);
  const lpFired = useRef(false);
  const lpStart = useRef(null);

  function onHeadPointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return; // right/middle -> contextmenu
    lpFired.current = false;
    lpStart.current = { x: e.clientX, y: e.clientY };
    clearTimeout(lpTimer.current);
    lpTimer.current = setTimeout(() => {
      lpFired.current = true;
      selectEntry(entry);
    }, 500);
  }
  function onHeadPointerMove(e) {
    if (!lpStart.current) return;
    if (Math.abs(e.clientX - lpStart.current.x) > 10 || Math.abs(e.clientY - lpStart.current.y) > 10) {
      clearTimeout(lpTimer.current);
    }
  }
  function cancelLongPress() {
    clearTimeout(lpTimer.current);
  }
  function onHeadClick() {
    if (lpFired.current) {
      lpFired.current = false;
      return; // the long-press already selected; don't also expand
    }
    if (selectionMode) {
      toggleSelectEntry(entry);
      return;
    }
    setOpen((o) => !o);
  }
  function onCardContextMenu(e) {
    e.preventDefault();
    selectEntry(entry);
  }

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
  // Credit applied to this entry offsets debts on it (rule 8: a debt settled by
  // credit reads exactly like a paid one).
  const entryApps = (applications || []).filter((a) => a.targetEntryId === entry.id);
  const activeEntryApps = entryApps.filter((a) => !a.reversedAt);
  const allPassengers = entry.passengers || [];
  const method = splitMethodOf(entry);
  const effDisp = entryEfficiencyDisplay(entry);
  // A future-dated refuel is "upcoming" - not yet counted in any balance or
  // spend total (see calc.balanceForWho / fuelSpend), just shown as scheduled.
  const upcoming = isFutureDate(entry.date);
  const recurLabel = recurrenceLabel(entry.recurrence);

  // Applied credit reads like a payment (it settles a debt), so it renders as a
  // purple payment-chip - now sat right alongside that debtor's payment chips in
  // their pay-history (#6/BATCH_3). `showName` is only for the fallback block.
  const creditChip = (a, { showName } = {}) => (
    <div className="pay-chip pay-chip--credit" key={a.id}>
      <Wallet size={12} className="pay-chip__lead" />
      <span className="pay-chip__amt">{formatMoney(a.amount)}</span>
      <span className="pay-chip__meta">
        via credit{showName && a.debtorWho ? ` · ${whoName(a.debtorWho, peopleMap)}` : ""}
      </span>
      {onReverseCredit && (
        <button
          className="pay-chip__btn pay-chip__btn--undo"
          type="button"
          onClick={() => onReverseCredit(a)}
          aria-label="Undo credit application"
          title="Undo credit application"
        >
          <Undo2 size={12} />
        </button>
      )}
    </div>
  );

  // Tap a detail/chip to jump straight into the editor with that field focused
  // (#6). No-op (falls through to the row toggle) when this card isn't editable.
  const tapEdit = (field) => (e) => {
    if (selectionMode) {
      e.stopPropagation();
      toggleSelectEntry(entry);
      return;
    }
    if (!onEdit) return;
    e.stopPropagation();
    onEdit(entry, field);
  };

  // Passengers we actually show/count (the History filter applied). In your own
  // vehicle your "Me" share is billed and already covered - it counts toward
  // the fill-up total but never shows up as something owed to chase.
  const passengers = onlyWho
    ? allPassengers.filter((p) => onlyWho.has(whoKey(p.who)))
    : allPassengers;
  // The entry's payer - "Me" in my own car, or the carpool's owner - is billed
  // but never owed: their share is "covered" (they paid the pump), so they're
  // dropped from the collectible passengers (#6, generalising the old Me-only).
  const isCoveredPayer = (who) =>
    (ownedByMe && isMe(who)) || (ownerWho && whoEquals(who, ownerWho));
  const otherPax = passengers.filter((p) => !isCoveredPayer(p.who));
  const coveredShare = passengers
    .filter((p) => isCoveredPayer(p.who))
    .reduce((sum, p) => sum + shareOf(p.who), 0);

  // Billed includes the payer's own share; collected counts that share as
  // already covered (they paid the pump) plus real passenger payments.
  const billable = passengers.reduce((sum, p) => sum + shareOf(p.who), 0);
  const collected =
    otherPax.reduce((sum, p) => sum + paymentsFor(entry, p.who, entryPayments), 0) +
    coveredShare;
  const hasPax = passengers.length > 0;

  // roll-up status across the collectible (non-Me) passengers
  let rollup = null;
  if (otherPax.length) {
    const statuses = otherPax.map((p) => statusOf(entry, p.who, entryPayments, entryApps));
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
    <div
      className={
        "entry-card" +
        (upcoming ? " entry-card--upcoming" : "") +
        (selectionMode ? " entry-card--selectable" : "") +
        (selected ? " entry-card--selected" : "")
      }
      onContextMenu={onCardContextMenu}
    >
      <button
        className="entry-card__head"
        data-no-pop
        onClick={onHeadClick}
        onPointerDown={onHeadPointerDown}
        onPointerMove={onHeadPointerMove}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onPointerCancel={cancelLongPress}
        type="button"
        aria-expanded={open}
      >
        {/* The trip icon is the edit affordance (with a pencil badge) */}
        <span
          className={
            "list-row__icon " +
            (ownedByMe ? "list-row__icon--fillup" : "list-row__icon--carpool") +
            (onEdit && !selectionMode ? " list-row__icon--editable" : "")
          }
          onClick={(e) => {
            if (selectionMode || !onEdit) return; // let the tap bubble to the head
            e.stopPropagation();
            onEdit(entry);
          }}
        >
          <Fuel size={20} />
          {onEdit && !selectionMode && (
            <span className="list-row__icon-pencil" aria-hidden="true">
              <Pencil size={8} />
            </span>
          )}
        </span>
        <div className="list-row__body">
          <div className="list-row__title">
            {/* No car name here - it's on the chip below; a generic label reads
                cleaner for an untitled entry (#1). */}
            {entry.title || (ownedByMe ? "Refuel" : "Trip")}
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
              {vehicleName || (ownedByMe ? "You" : ownerName || "Someone")}
            </span>
            {upcoming && (
              <span
                className={"upcoming-pill" + (onEdit ? " is-tappable" : "")}
                onClick={tapEdit("date")}
              >
                Upcoming
              </span>
            )}
            {recurLabel && (
              <span
                className={"recur-pill" + (onEdit ? " is-tappable" : "")}
                onClick={tapEdit("recurrence")}
              >
                <Repeat size={11} /> {recurLabel}
              </span>
            )}
          </div>
        </div>
        <div className="list-row__trailing">
          {hasPax ? (
            rollup === "paid" ? (
              // All owed shares settled - show the total + a done tick instead
              // of "RM3 / RM3" (#2).
              <span className="list-row__amount list-row__amount--done" title="All settled">
                {formatMoneyShort(billable)}
                <span className="list-row__done-badge">
                  <Check size={12} strokeWidth={3} />
                </span>
              </span>
            ) : (
              <span className="list-row__amount">
                <span style={{ color: STATUS_COLOR[rollup] }}>
                  {formatMoneyShort(collected)}
                </span>
                <span className="faint">/{formatMoneyShort(billable)}</span>
              </span>
            )
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
          <div
            className={"entry-facts" + (onEdit || selectionMode ? " entry-facts--tappable" : "")}
            onClick={
              selectionMode
                ? () => toggleSelectEntry(entry)
                : onEdit
                ? () => onEdit(entry, "cost")
                : undefined
            }
          >
            <Fact
              label="Distance"
              value={formatKm(entry.totalDistance)}
              onTap={onEdit ? tapEdit("distance") : undefined}
            />
            <Fact
              label="Liters"
              value={formatLiters(entry.totalLiters)}
              onTap={onEdit ? tapEdit("liters") : undefined}
            />
            <Fact
              label="Fuel price"
              value={`${formatMoneyShort(entry.fuelPricePerLiter)}/L`}
              onTap={onEdit ? tapEdit("fuelPrice") : undefined}
            />
            <Fact
              label="Efficiency"
              value={effText || "-"}
              hint={effDisp.estimated ? "estimate" : "measured"}
              onTap={onEdit ? tapEdit("efficiency") : undefined}
            />
          </div>

          {hasPax && method === "driver_comp" && (
            <div className="split-chip-row">
              <button
                type="button"
                className={"chip-fact" + (onEdit || selectionMode ? " chip-fact--tappable" : "")}
                onClick={onEdit || selectionMode ? tapEdit("tolls") : undefined}
              >
                Tolls {formatMoneyShort(entry.tolls || 0)} · Parking{" "}
                {formatMoneyShort(entry.parking || 0)} · +{entry.maintenancePct || 0}%
              </button>
            </div>
          )}

          {!hasPax ? (
            <p className="faint" style={{ fontSize: "0.8rem", margin: "0.4rem 0 0" }}>
              Personal {ownedByMe ? "refuel" : "trip"} - no passengers to split with.
            </p>
          ) : (
            <div className="pax-list">
              {passengers.map((p, i) => {
                const covered = isCoveredPayer(p.who);
                const s = shareOf(p.who);
                // The payer's share (you in your own car, or the carpool owner):
                // reference only - covered by them, never owed (#6).
                if (covered) {
                  const self = isMe(p.who);
                  return (
                    <div className="pax-row pax-row--me" key={i}>
                      <div className="pax-row__top">
                        <div className="pax-row__main">
                          <span className="pax-row__name">
                            {self ? "You" : whoName(p.who, peopleMap)}
                          </span>
                          <span className="pax-row__sub">
                            {self ? "your" : "their"} share {formatMoney(s)} · covered by{" "}
                            {self ? "you" : "them"}
                          </span>
                        </div>
                        <span className="badge badge--paid">billed</span>
                      </div>
                    </div>
                  );
                }
                const paid = paymentsFor(entry, p.who, entryPayments);
                const out = outstanding(entry, p.who, entryPayments, entryApps);
                const status = statusOf(entry, p.who, entryPayments, entryApps);
                const creditApplied = appliedCreditTo(entry.id, p.who, entryApps);
                const theirPayments = entryPayments.filter((pm) =>
                  whoEquals(pm.who, p.who)
                );
                const showThisPay = !!expandedPay[whoKey(p.who)];
                const visiblePay = showThisPay ? theirPayments : theirPayments.slice(0, 2);
                // This debtor's applied credit - shown as chips in the same
                // pay-history strip as their payments (#6/BATCH_3).
                const paxApps = activeEntryApps.filter(
                  (a) => a.debtorWho && whoEquals(a.debtorWho, p.who)
                );
                // Upcoming (future-dated) refuels accept payments IN ADVANCE.
                // Those payments (and the refuel's shares) stay out of the live
                // balances until the refuel date arrives, then net out - see
                // calc.balanceForWho, which skips future entries wholesale.
                const canSettle = onQuickSettle && out > 0.005;
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
                          {creditApplied > 0.005 ? ` · ${formatMoney(creditApplied)} via credit` : ""}
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
                            onClick={() => onRecordPayment(entry, p.who, ownedByMe)}
                            title={upcoming ? "Record a payment in advance" : "Record a payment"}
                          >
                            <Wallet size={13} /> {upcoming ? "Prepay" : "Pay"}
                          </button>
                        )}
                      </div>
                    </div>

                    {(theirPayments.length > 0 || paxApps.length > 0) && (
                      <div
                        className={
                          "pay-history" +
                          (dissolving === whoKey(p.who) ? " is-dissolving" : "")
                        }
                      >
                        {visiblePay.map((pm) => (
                          <div className="pay-chip" key={pm.id}>
                            {onEditPayment ? (
                              <button
                                type="button"
                                className="pay-chip__main"
                                onClick={() => onEditPayment(entry, pm, ownedByMe)}
                                aria-label="Edit payment"
                              >
                                <span className="pay-chip__amt">{formatMoney(pm.amount)}</span>
                                <span className="pay-chip__meta">
                                  {formatDateShort(pm.date)}
                                  {pm.note ? ` · ${pm.note}` : ""}
                                </span>
                              </button>
                            ) : (
                              <>
                                <span className="pay-chip__amt">{formatMoney(pm.amount)}</span>
                                <span className="pay-chip__meta">
                                  {formatDateShort(pm.date)}
                                  {pm.note ? ` · ${pm.note}` : ""}
                                </span>
                              </>
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
                        {paxApps.map((a) => creditChip(a))}
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

          {(() => {
            // Applied credit now lives in each debtor's pay-history row (#6). This
            // fallback only catches credit whose debtor isn't among the shown
            // passengers (e.g. hidden by the History filter), so nothing vanishes.
            const shown = new Set(
              otherPax.map((p) => whoKey(p.who))
            );
            const leftover = activeEntryApps.filter(
              (a) => !a.debtorWho || !shown.has(whoKey(a.debtorWho))
            );
            return leftover.length > 0 ? (
              <div className="pay-history entry-credit-chips">
                {leftover.map((a) => creditChip(a, { showName: true }))}
              </div>
            ) : null;
          })()}

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

function Fact({ label, value, hint, onTap }) {
  const inner = (
    <>
      <span className="fact__label">{label}</span>
      <span className="fact__value">{value}</span>
      {hint && <span className="fact__hint">{hint}</span>}
    </>
  );
  if (onTap) {
    return (
      <button type="button" className="fact fact--tappable" onClick={onTap}>
        {inner}
      </button>
    );
  }
  return <div className="fact">{inner}</div>;
}
