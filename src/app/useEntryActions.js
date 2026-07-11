import { useApp } from "./AppContext.jsx";
import {
  removeEntry,
  removePayment,
  createPayment,
  clearPayments,
  reverseCreditApplication,
} from "../db/actions.js";
import { formatMoney, todayISODate } from "../lib/format.js";
import { confettiBurst } from "../lib/confetti.js";
import { haptic } from "../lib/haptics.js";

/* Shared Pay / Edit / Delete handlers for fill-ups and payments, so every
   screen that renders an EntryCard (Dashboard, History, Group Detail) behaves
   identically. */
export function useEntryActions() {
  const { openSheet, askConfirm, toast } = useApp();

  const onRecordPayment = (entry, who, ownedByMe) =>
    openSheet({ type: "payment", entry, who, ownedByMe });

  const onEditPayment = (entry, payment, ownedByMe) =>
    openSheet({ type: "payment", entry, who: payment.who, payment, ownedByMe });

  const onDeletePayment = async (entry, payment) => {
    const ok = await askConfirm({
      title: "Delete this payment?",
      body: `Removing ${formatMoney(payment.amount)} recorded on ${payment.date}. Their outstanding balance will go back up. This can't be undone.`,
      confirmLabel: "Delete payment",
      danger: true,
    });
    if (!ok) return;
    haptic("medium"); // fire on the confirming tap, not after the DB write
    await removePayment(payment.id);
    toast("Payment deleted");
  };

  // Swipe-to-settle: record a payment for the full outstanding in one go, then
  // celebrate (the balance just hit zero).
  const onQuickSettle = async (entry, who, amount) => {
    if (!(amount > 0.005)) return;
    await createPayment({
      entryId: entry.id,
      who,
      amount,
      date: todayISODate(),
      note: "settled",
    });
    toast("Settled! 🎉");
    confettiBurst();
  };

  // Swipe a passenger row right and tap the X: wipe all their payments on this
  // fill-up in one shot. The X is the confirm, so no extra modal here.
  const onClearPayments = async (entry, who, paymentIds) => {
    if (!paymentIds?.length) return;
    haptic("medium");
    await clearPayments(paymentIds);
    toast("Payments cleared");
  };

  const onEditEntry = (entry, focusField) =>
    openSheet({ type: "addEntry", entryId: entry.id, focusField });

  // Undo a credit application shown inside an entry card (soft-reverse: restores
  // the credit and the debt, keeps an audit row).
  const onReverseCredit = async (app) => {
    const ok = await askConfirm({
      title: "Undo this credit application?",
      body: `Restores ${formatMoney(app.amount)} to the credit balance and puts that much back onto this debt. It stays in history, marked reversed.`,
      confirmLabel: "Undo",
    });
    if (!ok) return;
    await reverseCreditApplication(app.id);
    toast("Credit application reversed");
  };

  // Duplicate: open a fresh Add sheet pre-filled from this entry (today's date,
  // no payments carried over).
  const onDuplicateEntry = (entry) =>
    openSheet({ type: "addEntry", duplicateOf: entry });

  const onDeleteEntry = async (entry, ownedByMe) => {
    const noun = ownedByMe ? "refuel" : "trip";
    const ok = await askConfirm({
      title: `Delete this ${noun}?`,
      body: "This removes the entry and any payments recorded against it. This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    haptic("medium");
    await removeEntry(entry.id);
    toast(`${ownedByMe ? "Refuel" : "Trip"} deleted`);
  };

  return {
    onRecordPayment,
    onEditPayment,
    onDeletePayment,
    onQuickSettle,
    onClearPayments,
    onEditEntry,
    onDuplicateEntry,
    onDeleteEntry,
    onReverseCredit,
  };
}
