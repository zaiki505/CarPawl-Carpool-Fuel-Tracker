import React, { useEffect, useState } from "react";
import { Sheet } from "./ui/Sheet.jsx";
import { Field, MoneyInput } from "./ui/Primitives.jsx";
import { DatePicker } from "./ui/DatePicker.jsx";
import { createPayment, updatePayment, removePayment } from "../db/actions.js";
import { useApp } from "../app/AppContext.jsx";
import { usePaymentsForEntry } from "../db/hooks.js";
import { outstanding } from "../lib/calc.js";
import { formatMoney, formatMoneyShort, todayISODate } from "../lib/format.js";
import { whoName } from "../lib/names.js";
import { confettiBurst } from "../lib/confetti.js";
import { Trash2 } from "./ui/Icons.jsx";

/* Record OR edit a payment against a specific entry + passenger.
   Overpayment is allowed - we never cap the amount at the remaining outstanding.
   When `payment` is passed, the sheet edits (and can delete) that payment. */
export function PaymentSheet({ entry, who, payment, peopleMap, onClose }) {
  const editing = Boolean(payment);
  const { toast, askConfirm } = useApp();
  const entryPaymentsRaw = usePaymentsForEntry(entry.id);
  const entryPayments = entryPaymentsRaw || [];
  // Outstanding excluding the payment being edited (so the prefill is sensible).
  const others = editing
    ? entryPayments.filter((p) => p.id !== payment.id)
    : entryPayments;
  const out = outstanding(entry, who, others);

  const [amount, setAmount] = useState(editing ? String(payment.amount) : "");
  const [amtInited, setAmtInited] = useState(editing);
  const [date, setDate] = useState(editing ? payment.date : todayISODate());
  const [note, setNote] = useState(editing ? payment.note || "" : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Default the amount to the outstanding balance once payments have loaded
  // Doing this in an effect avoids seeding from a stale pre-load value.
  useEffect(() => {
    if (!amtInited && entryPaymentsRaw !== undefined) {
      setAmount(out > 0 ? out.toFixed(2) : "");
      setAmtInited(true);
    }
  }, [entryPaymentsRaw, amtInited, out]);

  async function save() {
    setError("");
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setError("Enter how much they paid.");
      return;
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
      setError(e.message);
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

  return (
    <Sheet
      title={editing ? "Edit payment" : "Record payment"}
      onClose={onClose}
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
          <strong>{entry.title || "this refuel"}</strong>
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

        {error && (
          <div className="form-status is-visible" data-state="error">
            {error}
          </div>
        )}
      </div>
    </Sheet>
  );
}
