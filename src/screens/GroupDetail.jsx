import React, { useState } from "react";
import {
  useGroup,
  useEntriesForGroup,
  usePayments,
  usePeopleMap,
} from "../db/hooks.js";
import { useApp } from "../app/AppContext.jsx";
import { useEntryActions } from "../app/useEntryActions.js";
import { updateGroup, removeGroup } from "../db/actions.js";
import { groupBalances, outstanding } from "../lib/calc.js";
import { formatMoney, formatMoneyShort, formatKmpl } from "../lib/format.js";
import { whoName, personName } from "../lib/names.js";
import { whoEquals } from "../lib/identity.js";
import { buildWhatsAppText, shareText } from "../lib/exportText.js";
import { EntryCard } from "../components/EntryCard.jsx";
import { ActionMenu } from "../components/ui/ActionMenu.jsx";
import { EmptyState, Field, NumberInput } from "../components/ui/Primitives.jsx";
import {
  ArrowLeft,
  Pencil,
  Check,
  Share2,
  Archive,
  Fuel,
  User,
  Wallet,
  Receipt,
  X,
} from "../components/ui/Icons.jsx";

export function GroupDetail({ groupId }) {
  const group = useGroup(groupId);
  const entries = useEntriesForGroup(groupId) || [];
  const payments = usePayments() || [];
  const peopleMap = usePeopleMap();
  const { back, openSheet, askConfirm, toast } = useApp();
  const entryActions = useEntryActions();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [kmpl, setKmpl] = useState("");
  // Balance-row tap: first-level menu, then a "pick a fill-up to pay" menu,
  // plus a filter that focuses the fill-up list on one person.
  const [menuWho, setMenuWho] = useState(null);
  const [payPickerWho, setPayPickerWho] = useState(null);
  const [focusWho, setFocusWho] = useState(null);

  if (!group || !peopleMap) return <div className="app-shell" />;

  const isOwned = group.ownerType === "me";
  const balances = groupBalances(entries, payments).filter(
    (b) => b.owed > 0 || b.credit > 0
  );

  // Entries a given person owes on (for the pay-picker).
  const outstandingEntriesFor = (who) =>
    entries.filter((e) => outstanding(e, who, payments) > 0.005);

  const shownEntries = focusWho
    ? entries.filter((e) => (e.passengers || []).some((p) => whoEquals(p.who, focusWho)))
    : entries;

  function startEdit() {
    setName(group.name);
    setKmpl(String(group.defaultKmPerLiter));
    setEditing(true);
  }
  async function saveEdit() {
    await updateGroup(group.id, { name, defaultKmPerLiter: Number(kmpl) });
    setEditing(false);
    toast("Car updated");
  }

  async function onArchive() {
    const hasHistory = entries.length > 0;
    const ok = await askConfirm({
      title: `Archive ${group.name}?`,
      body: hasHistory
        ? "It'll be hidden from pickers and lists but all its history stays intact. You can restore it from Settings → Archived."
        : "This car has no history yet, so it'll be removed. You can always add it again.",
      confirmLabel: hasHistory ? "Archive" : "Remove",
      danger: true,
    });
    if (!ok) return;
    const result = await removeGroup(group.id);
    toast(result === "archived" ? `${group.name} archived` : `${group.name} removed`);
    back();
  }

  async function onExport() {
    const text = buildWhatsAppText(group, entries, payments, peopleMap);
    const res = await shareText(text, `${group.name} - fuel balances`);
    if (res === "shared") return;
    if (res === "copied") toast("Balances copied to clipboard");
    else toast("Couldn't open share sheet", "error");
  }

  return (
    <div className="app-shell stagger">
      <header className="screen-head" style={{ alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <button className="icon-btn" type="button" onClick={back} aria-label="Back">
            <ArrowLeft size={18} />
          </button>
          <div>
            <p className="screen-head__kicker">
              {isOwned ? "My vehicle" : "Carpool"}
            </p>
            <h1 className="screen-head__title" style={{ fontSize: "1.5rem" }}>
              {group.name}
            </h1>
          </div>
        </div>
      </header>

      {/* Settings panel */}
      <div className="detail-panel section-block">
        {editing ? (
          <div className="field-grid">
            <Field label="Car name">
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Fuel efficiency (km/L)">
              <NumberInput value={kmpl} onChange={setKmpl} step="0.1" min="0" />
            </Field>
            <div className="btn-row">
              <button className="cta-primary" type="button" onClick={saveEdit}>
                <Check size={16} /> Save
              </button>
              <button className="cta-secondary" type="button" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="detail-summary">
            <div className="detail-summary__facts">
              {!isOwned && (
                <span className="chip-fact">
                  <User size={14} /> {personName(group.ownerPersonId, peopleMap)}'s car
                </span>
              )}
              <span className="chip-fact">
                <Fuel size={14} /> {formatKmpl(group.defaultKmPerLiter)}
              </span>
              <span className="chip-fact">
                {entries.length} fill-up{entries.length === 1 ? "" : "s"}
              </span>
            </div>
            <button className="icon-btn" type="button" onClick={startEdit} aria-label="Edit car">
              <Pencil size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Balances (owed & credit shown separately, never netted) */}
      {balances.length > 0 && (
        <section className="section-block">
          <h2 className="section-block__title" style={{ marginBottom: "0.6rem" }}>
            Balances
          </h2>
          <div className="detail-panel">
            {balances.map((b, i) => (
              <button
                className="balance-row balance-row--tappable"
                key={i}
                type="button"
                onClick={() => setMenuWho(b.who)}
              >
                <span className="balance-row__name">{whoName(b.who, peopleMap)}</span>
                <span className="balance-row__vals">
                  {b.owed > 0 && (
                    <span className={isOwned ? "pos" : "neg"}>
                      {isOwned ? "owes" : "you owe"} {formatMoney(b.owed)}
                    </span>
                  )}
                  {b.owed > 0 && b.credit > 0 && <span className="faint"> · </span>}
                  {b.credit > 0 && (
                    <span className="accent-text">{formatMoneyShort(b.credit)} credit</span>
                  )}
                </span>
              </button>
            ))}
          </div>
          <p className="field-hint" style={{ textAlign: "center", marginTop: "0.4rem" }}>
            Tap a person to record a payment or see their fill-ups.
          </p>
          <button className="action-btn btn-block" type="button" onClick={onExport} style={{ marginTop: "0.7rem" }}>
            <Share2 size={16} /> Share balances
          </button>
        </section>
      )}

      {/* Entries */}
      <section className="section-block">
        <div className="section-block__head">
          <h2 className="section-block__title">Fill-ups</h2>
          {focusWho && (
            <button className="link-btn" type="button" onClick={() => setFocusWho(null)}>
              <X size={12} /> {whoName(focusWho, peopleMap)}'s only — clear
            </button>
          )}
        </div>
        {entries.length === 0 ? (
          <EmptyState emoji="⛽" title="No fill-ups yet">
            Tap the + button to log this {isOwned ? "car's" : "carpool's"} first
            fuel entry.
          </EmptyState>
        ) : shownEntries.length === 0 ? (
          <EmptyState emoji="🔍" title="No matching fill-ups" />
        ) : (
          shownEntries.map((e) => (
            <EntryCard
              key={e.id}
              entry={e}
              payments={payments}
              peopleMap={peopleMap}
              onRecordPayment={entryActions.onRecordPayment}
              onEditPayment={entryActions.onEditPayment}
              onDeletePayment={entryActions.onDeletePayment}
              onEdit={entryActions.onEditEntry}
              onDelete={entryActions.onDeleteEntry}
            />
          ))
        )}
      </section>

      {/* Danger zone */}
      <section className="section-block">
        <button className="action-btn btn-block btn-danger" type="button" onClick={onArchive}>
          <Archive size={16} /> Archive this {isOwned ? "car" : "carpool"}
        </button>
      </section>

      {/* Balance-row tap: choose an action */}
      {menuWho && (
        <ActionMenu
          title={whoName(menuWho, peopleMap)}
          subtitle="What would you like to do?"
          onClose={() => setMenuWho(null)}
          items={[
            {
              icon: <Wallet size={18} />,
              label: "Record a payment",
              sublabel: "settle part or all of what they owe",
              onClick: () => {
                const who = menuWho;
                setMenuWho(null);
                const owing = outstandingEntriesFor(who);
                if (owing.length === 1) {
                  openSheet({ type: "payment", entry: owing[0], who });
                } else {
                  setPayPickerWho(who);
                }
              },
            },
            {
              icon: <Receipt size={18} />,
              label: "See their fill-ups",
              sublabel: "filter the list to their trips",
              onClick: () => {
                setFocusWho(menuWho);
                setMenuWho(null);
              },
            },
          ]}
        />
      )}

      {/* Pay-picker: which fill-up to apply the payment to */}
      {payPickerWho && (
        <ActionMenu
          title={`Pay for ${whoName(payPickerWho, peopleMap)}`}
          subtitle="Which fill-up is this payment for?"
          onClose={() => setPayPickerWho(null)}
          items={outstandingEntriesFor(payPickerWho).map((e) => ({
            icon: <Fuel size={18} />,
            label: e.title || "Fill-up",
            sublabel: `owes ${formatMoney(outstanding(e, payPickerWho, payments))}`,
            onClick: () => {
              const who = payPickerWho;
              setPayPickerWho(null);
              openSheet({ type: "payment", entry: e, who });
            },
          }))}
        />
      )}
    </div>
  );
}
