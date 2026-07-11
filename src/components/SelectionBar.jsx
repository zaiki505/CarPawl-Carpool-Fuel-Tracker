import React, { useEffect } from "react";
import { useApp } from "../app/AppContext.jsx";
import { duplicateEntries, removeEntries } from "../db/actions.js";
import { Pencil, Copy, Trash2, X } from "./ui/Icons.jsx";
import { haptic } from "../lib/haptics.js";

/* Floating action bar for entry multi-select (#5). Shown at the top of the
   screen whenever one or more entry cards are selected (via long-press on touch
   or right-click on desktop). Edit / Duplicate / Delete act on the selection.
   Edit on a single card is a normal edit; on several it's a multi-edit that
   overwrites only the fields you changed onto every selected card. */
export function SelectionBar() {
  const {
    selectionMode,
    selectedEntries,
    clearSelection,
    openSheet,
    askConfirm,
    toast,
  } = useApp();
  const count = selectedEntries.size;

  // Escape cancels the selection - but let an open sheet/confirm consume it first.
  useEffect(() => {
    if (!selectionMode) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (document.querySelector(".sheet-scrim, .modal-scrim")) return;
      clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectionMode, clearSelection]);

  if (!selectionMode) return null;

  const entries = [...selectedEntries.values()];

  function onEdit() {
    if (entries.length === 1) {
      openSheet({ type: "addEntry", entryId: entries[0].id });
    } else {
      openSheet({ type: "addEntry", entryId: entries[0].id, multiEntries: entries });
    }
    clearSelection();
  }

  async function onDuplicate() {
    const n = await duplicateEntries(entries);
    haptic("light");
    clearSelection();
    toast(`Duplicated ${n} ${n === 1 ? "entry" : "entries"}`);
  }

  async function onDelete() {
    const ok = await askConfirm({
      title: `Delete ${count} ${count === 1 ? "entry" : "entries"}?`,
      body: "This removes the selected entries and any payments recorded against them. This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    haptic("medium");
    const n = await removeEntries(entries.map((e) => e.id));
    clearSelection();
    toast(`Deleted ${n} ${n === 1 ? "entry" : "entries"}`);
  }

  return (
    <div className="selection-bar" role="toolbar" aria-label="Selected entries">
      <button
        className="selection-bar__close"
        type="button"
        onClick={clearSelection}
        aria-label="Cancel selection"
      >
        <X size={18} />
      </button>
      <span className="selection-bar__count">{count} selected</span>
      <div className="selection-bar__actions">
        <button className="selection-pill" type="button" onClick={onEdit}>
          <Pencil size={15} /> <span className="selection-pill__label">Edit</span>
        </button>
        <button className="selection-pill" type="button" onClick={onDuplicate}>
          <Copy size={15} /> <span className="selection-pill__label">Duplicate</span>
        </button>
        <button
          className="selection-pill selection-pill--danger"
          type="button"
          onClick={onDelete}
        >
          <Trash2 size={15} /> <span className="selection-pill__label">Delete</span>
        </button>
      </div>
    </div>
  );
}
