import React from "react";
import { groupBalances, balanceForWho, share } from "../lib/calc.js";
import { periodRange, FUEL_PERIODS } from "../lib/fuelSpend.js";
import { ME } from "../lib/identity.js";
import { formatMoney, formatMoneyShort, formatMoneyCompact, isFutureDate, parseISODate } from "../lib/format.js";
import { personName } from "../lib/names.js";
import { Car, ChevronRight, Fuel } from "./ui/Icons.jsx";

/* A group summary row for the Dashboard/Groups lists. Owned groups surface what
   others owe you; carpools surface what you owe the driver. Owed and credit are
   shown separately, never netted. */
export function GroupCard({
  group,
  entries,
  payments,
  peopleMap,
  applications = [],
  spendPeriod = "month",
  onOpen,
}) {
  const list = entries || [];
  const isOwned = group.ownerType === "me";

  // Applied credit settles debt just like a payment, so the card's "to collect"
  // / "to pay" figure must net it out too (BATCH_1 #1).
  let amount = 0;
  let credit = 0;
  if (isOwned) {
    for (const row of groupBalances(list, payments, { excludeMe: true, applications })) {
      amount += row.owed;
      credit += row.credit;
    }
  } else {
    const b = balanceForWho(list, { type: "me" }, payments, { applications });
    amount = b.owed;
    credit = b.credit;
  }
  const label = amount > 0 ? (isOwned ? "to collect" : "to pay") : "Settled";
  const hasCredit = credit > 0.005;
  const settled = amount <= 0.005 && !hasCredit;
  // When there's nothing owed (and no credit), show my fuel spend on this
  // vehicle instead of a bare RM0.00 (BATCH_2 #2). Gross scope, matching the
  // dashboard Total Fuel Spend (own car: full pump cost of trips I drove;
  // carpool: my rider share), and scoped to the same remembered period (#2).
  const { start, end } = periodRange(spendPeriod);
  const inSpendPeriod = (e) => {
    if (isFutureDate(e.date)) return false;
    const d = parseISODate(e.date) || new Date(e.date);
    return d >= start && d < end;
  };
  const mySpend = settled
    ? list
        .filter(inSpendPeriod)
        .reduce((s, e) => s + (isOwned ? Number(e.totalCost) || 0 : share(e, ME)), 0)
    : 0;
  const periodLabel = (FUEL_PERIODS.find((p) => p.value === spendPeriod) || FUEL_PERIODS[1]).label;

  return (
    <button className="list-row" type="button" onClick={() => onOpen(group.id)}>
      <span
        className={
          "list-row__icon " +
          (isOwned ? "list-row__icon--vehicle" : "list-row__icon--carpool")
        }
      >
        <Car size={20} />
      </span>
      <div className="list-row__body">
        <div className="list-row__title">{group.name}</div>
        <div className="list-row__meta">
          {isOwned
            ? `${list.length} refuel${list.length === 1 ? "" : "s"}`
            : `${personName(group.ownerPersonId, peopleMap)}'s car · ${list.length} trip${
                list.length === 1 ? "" : "s"
              }`}
        </div>
      </div>
      <div className="list-row__trailing">
        {amount > 0 ? (
          <>
            <span
              className={"list-row__amount " + (isOwned ? "pos" : "neg")}
              title={formatMoney(amount)}
            >
              {formatMoneyCompact(amount)}
            </span>
            <span className="faint list-row__amount-sub">{label}</span>
          </>
        ) : hasCredit ? (
          <>
            <span className="faint" style={{ fontSize: "0.8rem" }}>
              {formatMoney(0)}
            </span>
            <span className="faint list-row__amount-sub">
              {formatMoneyShort(credit)} credit
            </span>
          </>
        ) : (
          // Settled: show my all-time fuel spend on this vehicle instead of RM0.
          <>
            <span
              className="list-row__spend"
              title={`Fuel spent (${periodLabel}): ${formatMoney(mySpend)}`}
            >
              <Fuel size={11} />
              {formatMoneyCompact(mySpend)}
            </span>
            <span className="faint list-row__amount-sub">fuel · {periodLabel}</span>
          </>
        )}
      </div>
      <ChevronRight size={18} className="faint" style={{ flexShrink: 0 }} />
    </button>
  );
}
