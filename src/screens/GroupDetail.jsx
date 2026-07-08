import React, { useMemo, useState } from "react";
import {
  useGroup,
  useEntriesForGroup,
  usePayments,
  usePeopleMap,
} from "../db/hooks.js";
import { useApp } from "../app/AppContext.jsx";
import { useEntryActions } from "../app/useEntryActions.js";
import { updateGroup, removeGroup, setGroupOverrideDefault } from "../db/actions.js";
import { groupBalances, outstanding, share } from "../lib/calc.js";
import { formatMoney, formatMoneyShort, formatKmpl, formatDate, isFutureDate } from "../lib/format.js";
import { whoName, personName } from "../lib/names.js";
import { whoEquals, whoKey, ME } from "../lib/identity.js";
import { buildWhatsAppText, shareText } from "../lib/exportText.js";
import { EntryCard } from "../components/EntryCard.jsx";
import { ActionMenu } from "../components/ui/ActionMenu.jsx";
import { EmptyState, Field, NumberInput } from "../components/ui/Primitives.jsx";
import { ScreenLoading } from "../components/ui/ScreenLoading.jsx";
import {
  ArrowLeft,
  Pencil,
  Check,
  Share2,
  Archive,
  Fuel,
  User,
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
  // Tapping a balance records a payment straight away; if they owe on several
  // fill-ups, this holds the "which fill-up?" picker.
  const [payPickerWho, setPayPickerWho] = useState(null);

  // Everyone who's ever ridden in this carpool - for managing their
  // Compensate-method override default (a saved fixed amount that pre-fills
  // new refuels, still editable per trip). Computed before the ready-guard
  // below so this hook always runs in the same order every render.
  const distinctPassengers = useMemo(() => {
    const map = new Map();
    for (const e of entries) {
      for (const p of e.passengers || []) {
        const key = whoKey(p.who);
        if (!map.has(key)) map.set(key, p.who);
      }
    }
    return [...map.values()];
  }, [entries]);

  if (!group || !peopleMap) return <ScreenLoading />;

  const isOwned = group.ownerType === "me";
  const balances = groupBalances(entries, payments, { excludeMe: isOwned }).filter(
    (b) => b.owed > 0 || b.credit > 0
  );
  // Your own share across this vehicle's fill-ups (billed, covered by you), shown
  // for reference, never collectable.
  const meBilled = isOwned
    ? entries
        .filter((e) => !isFutureDate(e.date))
        .reduce((sum, e) => sum + share(e, ME), 0)
    : 0;

  // Fill-ups a person can have a payment applied to: those they still owe on,
  // or (if they only hold credit) any fill-up they're on. Upcoming (future-dated) refuels are excluded.
  const payableEntriesFor = (who) => {
    const dueEntries = entries.filter((e) => !isFutureDate(e.date));
    const owing = dueEntries.filter((e) => outstanding(e, who, payments) > 0.005);
    if (owing.length) return owing;
    return dueEntries.filter((e) => (e.passengers || []).some((p) => whoEquals(p.who, who)));
  };

  function recordPaymentFor(who) {
    const payable = payableEntriesFor(who);
    if (payable.length === 1) {
      openSheet({ type: "payment", entry: payable[0], who, ownedByMe: isOwned });
    } else if (payable.length > 1) setPayPickerWho(who);
  }

  function startEdit() {
    setName(group.name);
    setKmpl(String(group.defaultKmPerLiter));
    setEditing(true);
  }
  async function saveEdit() {
    const nm = name.trim();
    if (!nm) {
      toast("Give this car a name.", "error");
      return;
    }
    const kmplNum = Number(kmpl);
    if (!(kmplNum > 0)) {
      toast("Fuel efficiency must be greater than 0.", "error");
      return;
    }
    const effChanged = kmplNum !== Number(group.defaultKmPerLiter);
    try {
      await updateGroup(group.id, { name: nm, defaultKmPerLiter: kmplNum });
      setEditing(false);
      toast(effChanged ? "Efficiency saved - applies to new trips" : "Car updated");
    } catch (e) {
      toast(e.message, "error");
    }
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
            <Field
              label="Fuel efficiency (km/L)"
              hint="Applies to new trips only - past trips keep their own saved figures."
            >
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
                {entries.length} {isOwned ? "refuel" : "trip"}
                {entries.length === 1 ? "" : "s"}
              </span>
            </div>
            <button className="icon-btn" type="button" onClick={startEdit} aria-label="Edit car">
              <Pencil size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Balances (owed & credit shown separately, never netted) */}
      {(balances.length > 0 || meBilled > 0.005) && (
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
                onClick={() => recordPaymentFor(b.who)}
              >
                <span className="balance-row__name">{whoName(b.who, peopleMap)}</span>
                <span className="balance-row__vals">
                  {b.owed > 0 && (
                    <span className={isOwned ? "pos" : "neg"}>{formatMoney(b.owed)}</span>
                  )}
                  {b.owed > 0 && b.credit > 0 && <span className="faint"> · </span>}
                  {b.credit > 0 && (
                    <span className="accent-text">{formatMoneyShort(b.credit)} credit</span>
                  )}
                </span>
              </button>
            ))}
            {meBilled > 0.005 && (
              <div className="balance-row balance-row--me">
                <span className="balance-row__name">You</span>
                <span className="balance-row__vals faint">
                  {formatMoney(meBilled)} · your share (billed)
                </span>
              </div>
            )}
          </div>
          <p className="field-hint" style={{ textAlign: "center", marginTop: "0.4rem" }}>
            Tap a person to record a payment.
          </p>
          <button className="action-btn btn-block" type="button" onClick={onExport} style={{ marginTop: "0.7rem" }}>
            <Share2 size={16} /> Share balances
          </button>
        </section>
      )}

      {/* Custom Split Defaults - saved per person, per carpool */}
      {distinctPassengers.length > 0 && (
        <section className="section-block">
          <h2 className="section-block__title" style={{ marginBottom: "0.6rem" }}>
            Custom Split Defaults
          </h2>
          <p className="field-hint" style={{ marginTop: 0 }}>
            A saved fixed amount for the custom split method - pre-fills on every new{" "}
            {isOwned ? "refuel" : "trip"}, still editable each time.
          </p>
          <div className="detail-panel people-list">
            {distinctPassengers.map((who) => (
              <OverrideDefaultRow
                key={whoKey(who)}
                group={group}
                who={who}
                peopleMap={peopleMap}
                toast={toast}
              />
            ))}
          </div>
        </section>
      )}

      {/* Entries */}
      <section className="section-block">
        <h2 className="section-block__title" style={{ marginBottom: "0.6rem" }}>
          {isOwned ? "Refuels" : "Trips"}
        </h2>
        {entries.length === 0 ? (
          <EmptyState emoji="⛽" title={isOwned ? "No refuels yet" : "No trips yet"}>
            Tap the + button to log this {isOwned ? "car's" : "carpool's"} first
            fuel entry.
          </EmptyState>
        ) : (
          entries.map((e) => (
            <EntryCard
              key={e.id}
              entry={e}
              payments={payments}
              peopleMap={peopleMap}
              ownedByMe={isOwned}
              ownerName={personName(group.ownerPersonId, peopleMap)}
              fallbackTitle={group.name}
              onRecordPayment={entryActions.onRecordPayment}
              onEditPayment={entryActions.onEditPayment}
              onDeletePayment={entryActions.onDeletePayment}
              onQuickSettle={entryActions.onQuickSettle}
              onClearPayments={entryActions.onClearPayments}
              onEdit={entryActions.onEditEntry}
              onDuplicate={entryActions.onDuplicateEntry}
              onDelete={entryActions.onDeleteEntry}
            />
          ))
        )}
      </section>

      {/* Danger zone - same heading treatment as Settings' danger zone. */}
      <section className="section-block">
        <h2 className="section-block__title" style={{ marginBottom: "0.6rem", color: "#ff6b81" }}>
          Danger zone
        </h2>
        <button className="action-btn btn-block btn-danger" type="button" onClick={onArchive}>
          <Archive size={16} /> Archive this {isOwned ? "car" : "carpool"}
        </button>
      </section>

      {/* Pay-picker: which fill-up to apply the payment to */}
      {payPickerWho && (
        <ActionMenu
          title={`Pay for ${whoName(payPickerWho, peopleMap)}`}
          subtitle={`Which ${isOwned ? "refuel" : "trip"} is this payment for?`}
          onClose={() => setPayPickerWho(null)}
          items={payableEntriesFor(payPickerWho).map((e) => {
            const out = outstanding(e, payPickerWho, payments);
            return {
              icon: <Fuel size={18} />,
              label: e.title || group.name,
              sublabel:
                `${formatDate(e.date)} · ` +
                (out > 0.005 ? `owes ${formatMoney(out)}` : "settled, add a credit"),
              onClick: () => {
                const who = payPickerWho;
                setPayPickerWho(null);
                openSheet({ type: "payment", entry: e, who, ownedByMe: isOwned });
              },
            };
          })}
        />
      )}
    </div>
  );
}

function OverrideDefaultRow({ group, who, peopleMap, toast }) {
  const key = whoKey(who);
  const saved = group.overrideDefaults?.[key];
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(saved != null ? String(saved) : "");

  async function save() {
    const trimmed = value.trim();
    let amount = null;
    if (trimmed !== "") {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 0) {
        toast("Enter a valid amount (0 or more).", "error");
        return;
      }
      amount = n;
    }
    await setGroupOverrideDefault(group.id, who, amount);
    setEditing(false);
    toast(amount == null ? "Default cleared" : `Default saved: RM${amount} fixed`);
  }

  if (editing) {
    return (
      <div className="people-row">
        <span className="people-row__name">{whoName(who, peopleMap)}</span>
        <div className="pax-dist-row__input" style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
          <span>RM</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            style={{ width: "5.5rem" }}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
          <button className="mini-btn" type="button" onClick={save}>
            <Check size={13} /> Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="people-row">
      <span className="people-row__name">{whoName(who, peopleMap)}</span>
      <button className="mini-btn" type="button" onClick={() => setEditing(true)}>
        <Pencil size={13} /> {saved != null ? `RM${saved} fixed` : "No default"}
      </button>
    </div>
  );
}
