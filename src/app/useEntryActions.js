import { useApp } from "./AppContext.jsx";
import { removeEntry, removePayment } from "../db/actions.js";
import { formatMoney } from "../lib/format.js";

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
    onEditEntry,
    onDeleteEntry,
  };
}
