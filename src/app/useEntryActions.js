import { useApp } from "./AppContext.jsx";
import { removeEntry, removePayment, createPayment, clearPayments } from "../db/actions.js";
import { formatMoney, todayISODate } from "../lib/format.js";
import { confettiBurst } from "../lib/confetti.js";

/* Shared Pay / Edit / Delete handlers for fill-ups and payments, so every
   screen that renders an EntryCard (Dashboard, History, Group Detail) behaves
   identically. */
export function useEntryActions() {
  const { openSheet, askConfirm, toast } = useApp();

  const onRecordPayment = (entry, who) =>
    openSheet({ type: "payment", entry, who });

  const onEditPayment = (entry, payment) =>
    openSheet({ type: "payment", entry, who: payment.who, payment });

  const onDeletePayment = async (entry, payment) => {
    const ok = await askConfirm({
      title: "Delete this payment?",
      body: `Removing ${formatMoney(payment.amount)} recorded on ${payment.date}. Their outstanding balance will go back up. This can't be undone.`,
      confirmLabel: "Delete payment",
      danger: true,
    });
    if (!ok) return;
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
    await clearPayments(paymentIds);
    toast("Payments cleared");
  };

  const onEditEntry = (entry) => openSheet({ type: "addEntry", entryId: entry.id });

  const onDeleteEntry = async (entry) => {
    const ok = await askConfirm({
      title: "Delete this fill-up?",
      body: "This removes the entry and any payments recorded against it. This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await removeEntry(entry.id);
    toast("Fill-up deleted");
  };

  return {
    onRecordPayment,
    onEditPayment,
    onDeletePayment,
    onQuickSettle,
    onClearPayments,
    onEditEntry,
    onDeleteEntry,
  };
}
