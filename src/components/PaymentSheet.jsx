import React, { useState } from "react";
import { Sheet } from "./ui/Sheet.jsx";
import { Field, MoneyInput } from "./ui/Primitives.jsx";
import { createPayment, updatePayment, removePayment } from "../db/actions.js";
import { useApp } from "../app/AppContext.jsx";
import { usePaymentsForEntry } from "../db/hooks.js";
import { outstanding } from "../lib/calc.js";
import { formatMoney, formatMoneyShort, todayISODate } from "../lib/format.js";
import { whoName } from "../lib/names.js";
import { Trash2 } from "./ui/Icons.jsx";

/* Record OR edit a payment against a specific entry + passenger (§7.3, §8).
   Overpayment is allowed — we never cap the amount at the remaining outstanding.
   When `payment` is passed, the sheet edits (and can delete) that payment. */
export function PaymentSheet({ entry, who, payment, peopleMap, onClose }) {
  const editing = Boolean(payment);
  const { toast, askConfirm } = useApp();
  const entryPayments = usePaymentsForEntry(entry.id) || [];
  // Outstanding excluding the payment being edited (so the prefill is sensible).
  const others = editing
    ? entryPayments.filter((p) => p.id !== payment.id)
    : entryPayments;
  const out = outstanding(entry, who, others);

  const [amount, setAmount] = useState(
    editing ? String(payment.amount) : out > 0 ? out.toFixed(2) : ""
  );
  const [date, setDate] = useState(editing ? payment.date : todayISODate());
  const [note, setNote] = useState(editing ? payment.note || "" : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
          <strong>{entry.title || "this fill-up"}</strong>
          <div style={{ marginTop: "0.35rem", width: "100%" }}>
            {out > 0 ? (
              <span className="faint">Outstanding: {formatMoney(out)}</span>
            ) : out < 0 ? (
              <span className="faint">
                Already {formatMoneyShort(Math.abs(out))} in credit — extra goes further into credit.
              </span>
            ) : (
              <span className="faint">Settled — any amount becomes a credit.</span>
            )}
          </div>
        </div>

        <Field label="Amount">
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>

        <div className="field-inline">
          <Field label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
