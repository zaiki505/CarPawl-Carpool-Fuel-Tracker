import React, { useMemo, useState } from "react";
import { Sheet } from "./ui/Sheet.jsx";
import {
  useEntriesForGroup,
  usePayments,
  usePeopleMap,
  useCreditApplicationsForGroup,
} from "../db/hooks.js";
import { availableCredit, outstandingDebtsFor } from "../lib/calc.js";
import { applyCredit } from "../db/actions.js";
import { whoName } from "../lib/names.js";
import { formatMoney, formatMoneyShort, formatDate, parseNum } from "../lib/format.js";
import { useApp } from "../app/AppContext.jsx";
import { Check, Wallet } from "./ui/Icons.jsx";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/* Apply a debtor's overpayment credit against one or more of their outstanding
   debts to the same owner (rules 1-4, 8). The user ticks debts (selection order
   is the allocation order); amounts auto-fill each up to its outstanding until
   the credit runs out, and every amount is clamped so you can never over-apply.
   Confirms before writing (rule 2). */
export function ApplyCreditSheet({ groupId, debtorWho, creditorWho, onClose }) {
  const entries = useEntriesForGroup(groupId) || [];
  const payments = usePayments() || [];
  const applications = useCreditApplicationsForGroup(groupId) || [];
  const peopleMap = usePeopleMap();
  const { toast, askConfirm } = useApp();

  const avail = availableCredit(entries, debtorWho, payments, applications);
  const debts = useMemo(
    () => outstandingDebtsFor(entries, debtorWho, payments, applications),
    [entries, debtorWho, payments, applications]
  );

  // Selection order = allocation order (rule 3, no auto-ordering by us).
  const [selected, setSelected] = useState([]);
  const [amounts, setAmounts] = useState({}); // entryId -> string
  const [busy, setBusy] = useState(false);

  const debtorName = whoName(debtorWho, peopleMap);
  const creditorName = whoName(creditorWho, peopleMap);

  function autoAllocate(ids) {
    let left = avail;
    const next = {};
    for (const id of ids) {
      const debt = debts.find((d) => d.entry.id === id);
      if (!debt) continue;
      const give = Math.min(left, debt.amount);
      next[id] = String(round2(give));
      left = Math.max(0, left - give);
    }
    setAmounts(next);
  }

  function toggle(id) {
    const ids = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    setSelected(ids);
    autoAllocate(ids);
  }

  function editAmount(id, val) {
    const num = parseNum(val) || 0;
    const debt = debts.find((d) => d.entry.id === id);
    const othersTotal = selected
      .filter((x) => x !== id)
      .reduce((s, x) => s + (parseNum(amounts[x]) || 0), 0);
    const maxHere = Math.max(0, Math.min(debt ? debt.amount : 0, avail - othersTotal));
    const clamped = Math.min(Math.max(0, num), maxHere);
    setAmounts((m) => ({ ...m, [id]: val === "" ? "" : String(round2(clamped)) }));
  }

  const totalToApply = selected.reduce((s, id) => s + (parseNum(amounts[id]) || 0), 0);
  const creditLeft = round2(avail - totalToApply);

  async function onApply() {
    const allocations = selected
      .map((id) => ({ entryId: id, amount: parseNum(amounts[id]) || 0 }))
      .filter((a) => a.amount > 0.005);
    if (!allocations.length) {
      toast("Pick a debt and an amount to apply.", "error");
      return;
    }
    const lines = allocations
      .map((a) => {
        const d = debts.find((x) => x.entry.id === a.entryId);
        const name = d?.entry.title || formatDate(d?.entry.date);
        return `${formatMoney(a.amount)} to ${name}`;
      })
      .join(", ");
    const ok = await askConfirm({
      title: "Apply this credit?",
      body: `Apply ${lines}. This offsets ${debtorName}'s debt to ${creditorName} and is recorded in history - you can undo it later.`,
      confirmLabel: "Apply credit",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await applyCredit({ debtorWho, creditorWho, groupId, allocations });
      toast(`Applied ${formatMoney(totalToApply)} credit`);
      onClose();
    } catch (e) {
      toast(e.message, "error");
      setBusy(false);
    }
  }

  return (
    <Sheet
      title="Apply credit"
      onClose={onClose}
      banner={
        <div className="sheet-banner">
          <span className="sheet-banner__label">
            {debtorName}'s credit from {creditorName}
          </span>
          <span className="sheet-banner__amount accent-text">{formatMoney(avail)}</span>
        </div>
      }
      footer={
        <>
          <button className="cta-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="cta-primary btn-block"
            type="button"
            onClick={onApply}
            disabled={busy || totalToApply < 0.005}
          >
            <Wallet size={15} /> Apply {formatMoney(totalToApply)}
          </button>
        </>
      }
    >
      {debts.length === 0 ? (
        <p className="muted" style={{ textAlign: "center", padding: "1rem 0" }}>
          {debtorName} has {formatMoney(avail)} credit from {creditorName}, but no outstanding
          debts to apply it to yet. It stays available for the next time they owe.
        </p>
      ) : (
        <div className="field-grid">
          <p className="field-hint" style={{ marginTop: 0 }}>
            Tick the debts to offset. Amounts fill each in order until the credit runs out - edit any
            of them. Credit left: <strong>{formatMoney(creditLeft)}</strong>
          </p>
          <div className="credit-debt-list">
            {debts.map((d) => {
              const on = selected.includes(d.entry.id);
              return (
                <div className={"credit-debt-row" + (on ? " is-on" : "")} key={d.entry.id}>
                  <button
                    type="button"
                    className="credit-debt-row__pick"
                    aria-pressed={on}
                    onClick={() => toggle(d.entry.id)}
                  >
                    <span className="credit-debt-row__check">{on && <Check size={13} />}</span>
                    <span className="credit-debt-row__info">
                      <span className="credit-debt-row__name">
                        {d.entry.title || formatDate(d.entry.date)}
                      </span>
                      <span className="credit-debt-row__sub">
                        owes {formatMoneyShort(d.amount)} · {formatDate(d.entry.date)}
                      </span>
                    </span>
                  </button>
                  {on && (
                    <div className="credit-debt-row__amt field-prefix">
                      <span>RM</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={amounts[d.entry.id] ?? ""}
                        onChange={(e) => editAmount(d.entry.id, e.target.value)}
                        aria-label={`Amount for ${d.entry.title || formatDate(d.entry.date)}`}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Sheet>
  );
}
