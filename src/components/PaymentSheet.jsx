import React, { useEffect, useState } from "react";
import { Sheet } from "./ui/Sheet.jsx";
import { Field, MoneyInput } from "./ui/Primitives.jsx";
import { DatePicker } from "./ui/DatePicker.jsx";
import { createPayment, updatePayment, removePayment } from "../db/actions.js";
import { useApp } from "../app/AppContext.jsx";
import {
  usePaymentsForEntry,
  useEntry,
  useEntriesForGroup,
  usePayments,
  useCreditApplicationsForGroup,
  useGroup,
} from "../db/hooks.js";
import { outstanding, availableCredit, outstandingDebtsFor } from "../lib/calc.js";
import { ME, person as mkPerson } from "../lib/identity.js";
import { formatMoney, formatMoneyShort, todayISODate, isFutureDate } from "../lib/format.js";
import { whoName } from "../lib/names.js";
import { confettiBurst } from "../lib/confetti.js";
import { Trash2, Wallet } from "./ui/Icons.jsx";

/* Record OR edit a payment against a specific entry + passenger.
   Overpayment is allowed - we never cap the amount at the remaining outstanding.
   When `payment` is passed, the sheet edits (and can delete) that payment. */
export function PaymentSheet({ entry, who, payment, peopleMap, ownedByMe, onClose }) {
  const editing = Boolean(payment);
  const { toast, askConfirm, openSheet } = useApp();
  const entryPaymentsRaw = usePaymentsForEntry(entry.id);
  const entryPayments = entryPaymentsRaw || [];

  // Credit offset: if this passenger holds unapplied credit from the owner AND
  // still owes them elsewhere, offer to apply it right here (rule 2 entry point).
  const groupEntries = useEntriesForGroup(entry.groupId) || [];
  const allPayments = usePayments() || [];
  const groupApps = useCreditApplicationsForGroup(entry.groupId) || [];
  const group = useGroup(entry.groupId);
  const creditorWho = ownedByMe ? ME : group?.ownerPersonId ? mkPerson(group.ownerPersonId) : null;
  const availCredit = availableCredit(groupEntries, who, allPayments, groupApps);
  const canApplyCredit =
    availCredit > 0.005 &&
    Boolean(creditorWho) &&
    outstandingDebtsFor(groupEntries, who, allPayments, groupApps).length > 0;
  // Re-read the entry live rather than trusting the snapshot the caller
  // opened this sheet with - if it was edited (e.g. from another tab) while
  // this sheet is open, outstanding() should reflect the current shares, not
  // the moment-of-open ones. Falls back to the snapshot until the query
  // resolves (or if the entry's been deleted from under).
  const liveEntry = useEntry(entry.id) || entry;
  // Outstanding excluding the payment being edited (so the prefill is sensible).
  const others = editing
    ? entryPayments.filter((p) => p.id !== payment.id)
    : entryPayments;
  const out = outstanding(liveEntry, who, others);

  const [amount, setAmount] = useState(editing ? String(payment.amount) : "");
  const [amtInited, setAmtInited] = useState(editing);
  const [date, setDate] = useState(editing ? payment.date : todayISODate());
  const [note, setNote] = useState(editing ? payment.note || "" : "");
  const [busy, setBusy] = useState(false);

  // Default the amount to the outstanding balance once payments have loaded
  // Doing this in an effect avoids seeding from a stale pre-load value.
  useEffect(() => {
    if (!amtInited && entryPaymentsRaw !== undefined) {
      setAmount(out > 0 ? out.toFixed(2) : "");
      setAmtInited(true);
    }
  }, [entryPaymentsRaw, amtInited, out]);

  async function save() {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast("Enter how much they paid.", "error");
      return;
    }
    // Overpayment is allowed (it becomes credit),
    // amount owed on this fill-up is `out`, so anything beyond it is extra.
    const extra = amt - out;
    if (extra > 0.005) {
      const owedLabel = out > 0.005 ? formatMoney(out) : "nothing";
      const ok = await askConfirm({
        title: "More than they owe?",
        body: `${name} owes ${owedLabel} on this ${ownedByMe ? "refuel" : "trip"}. Recording ${formatMoney(amt)} leaves ${formatMoney(extra)} as credit toward future ${ownedByMe ? "refuels" : "trips"}. Record anyway?`,
        confirmLabel: "Record anyway",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      if (editing) {
        await updatePayment(payment.id, { amount: amt, date, note });
        toast("Payment updated");
      } else {
        await createPayment({ entryId: entry.id, who, amount: amt, date, note });
        toast(`Payment of ${formatMoney(amt)} recorded`);
      }
      // Celebrate when this payment clears their balance for the fill-up.
      if (amt >= out - 0.005) confettiBurst();
      onClose();
    } catch (e) {
      toast(e.message, "error");
      setBusy(false);
    }
  }

  async function del() {
    const ok = await askConfirm({
      title: "Delete this payment?",
      body: `Removing ${formatMoney(payment.amount)} recorded on ${payment.date}. Their outstanding balance will go back up. This can't be undone.`,
      confirmLabel: "Delete payment",
      danger: true,
    });
    if (!ok) return;
    await removePayment(payment.id);
    toast("Payment deleted");
    onClose();
  }

  const name = whoName(who, peopleMap);
  const isUpcoming = isFutureDate(liveEntry.date);

  return (
    <Sheet
      title={editing ? "Edit payment" : "Record payment"}
      onClose={onClose}
      banner={
        isUpcoming
          ? `This ${ownedByMe ? "refuel" : "trip"} is upcoming - the payment is saved now as a prepayment and starts counting toward balances once its date arrives.`
          : undefined
      }
      footer={
        <>
          <button className="cta-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="cta-primary btn-block"
            type="button"
            onClick={save}
            disabled={busy}
          >
            {editing ? "Save changes" : "Save payment"}
          </button>
        </>
      }
    >
      <div className="field-grid">
        <div className="payment-context">
          <span className="muted">From</span>
          <strong>{name}</strong>
          <span className="muted">for</span>
          <strong>{liveEntry.title || (ownedByMe ? "this refuel" : "this trip")}</strong>
          <div className="payment-context__balance">
            {out > 0 ? (
              <>
                <span className="payment-context__label">Outstanding</span>
                <span className="payment-context__amount neg">{formatMoney(out)}</span>
              </>
            ) : out < 0 ? (
              <>
                <span className="payment-context__label">In credit</span>
                <span className="payment-context__amount accent-text">
                  {formatMoney(Math.abs(out))}
                </span>
              </>
            ) : (
              <>
                <span className="payment-context__label">Settled</span>
                <span className="payment-context__amount pos">{formatMoney(0)}</span>
              </>
            )}
          </div>
        </div>

        {canApplyCredit && (
          <button
            type="button"
            className="apply-credit-btn"
            onClick={() =>
              openSheet({
                type: "applyCredit",
                groupId: entry.groupId,
                debtorWho: who,
                creditorWho,
              })
            }
          >
            <Wallet size={13} /> Apply {formatMoneyShort(availCredit)} credit instead
          </button>
        )}

        <Field label="Amount">
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>

        <div className="field-inline">
          <Field label="Date">
            <DatePicker value={date} onChange={setDate} />
          </Field>
          <Field label="Note (optional)">
            <input
              type="text"
              placeholder="cash, transfer…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </div>

        {editing && (
          <button className="action-btn btn-block btn-danger" type="button" onClick={del}>
            <Trash2 size={15} /> Delete this payment
          </button>
        )}
      </div>
    </Sheet>
  );
}
