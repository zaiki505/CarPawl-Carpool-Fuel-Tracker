import React from "react";
import { groupBalances, balanceForWho } from "../lib/calc.js";
import { formatMoney, formatMoneyShort } from "../lib/format.js";
import { personName } from "../lib/names.js";
import { Car, ChevronRight } from "./ui/Icons.jsx";

/* A group summary row for the Dashboard/Groups lists. Owned groups surface what
   others owe user; carpools surface what user owe the driver. Owed and credit are
   shown separately, never netted. */
export function GroupCard({ group, entries, payments, peopleMap, onOpen }) {
  const list = entries || [];
  const isOwned = group.ownerType === "me";

  let amount = 0;
  let credit = 0;
  if (isOwned) {
    for (const row of groupBalances(list, payments, { excludeMe: true })) {
      amount += row.owed;
      credit += row.credit;
    }
  } else {
    const b = balanceForWho(list, { type: "me" }, payments);
    amount = b.owed;
    credit = b.credit;
  }
  const label = amount > 0 ? (isOwned ? "to collect" : "to pay") : "settled";

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
            ? `${list.length} fill-up${list.length === 1 ? "" : "s"}`
            : `${personName(group.ownerPersonId, peopleMap)}'s car · ${list.length} trip${
                list.length === 1 ? "" : "s"
              }`}
        </div>
      </div>
      <div className="list-row__trailing">
        {amount > 0 ? (
          <span className={"list-row__amount " + (isOwned ? "pos" : "neg")}>
            {formatMoney(amount)}
          </span>
        ) : (
          <span className="faint" style={{ fontSize: "0.8rem" }}>
            settled
          </span>
        )}
        <span className="faint" style={{ fontSize: "0.64rem" }}>
          {credit > 0 ? `${formatMoneyShort(credit)} credit` : label}
        </span>
      </div>
      <ChevronRight size={18} className="faint" style={{ flexShrink: 0 }} />
    </button>
  );
}
