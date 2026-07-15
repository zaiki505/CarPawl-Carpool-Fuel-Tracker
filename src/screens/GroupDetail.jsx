import React, { useState } from "react";
import {
  useGroup,
  useEntriesForGroup,
  usePayments,
  usePeople,
  usePeopleMap,
  useSettings,
  useCreditApplicationsForGroup,
} from "../db/hooks.js";
import { useApp } from "../app/AppContext.jsx";
import { useEntryActions } from "../app/useEntryActions.js";
import { updateGroup, removeGroup, createPerson } from "../db/actions.js";
import { groupBalances, outstanding, share, availableCredit } from "../lib/calc.js";
import { formatMoney, formatMoneyShort, formatKmpl, formatDate, isFutureDate } from "../lib/format.js";
import { whoName, personName } from "../lib/names.js";
import { whoEquals, ME, person as mkPerson } from "../lib/identity.js";
import { buildWhatsAppText, shareText } from "../lib/exportText.js";
import { EntryCard } from "../components/EntryCard.jsx";
import { UpcomingReveal } from "../components/UpcomingReveal.jsx";
import { PickTripSheet } from "../components/PickTripSheet.jsx";
import { EmptyState, Field, NumberInput } from "../components/ui/Primitives.jsx";
import { InfoTip } from "../components/ui/InfoTip.jsx";
import { ScreenLoading } from "../components/ui/ScreenLoading.jsx";
import {
  ArrowLeft,
  Pencil,
  Check,
  Share2,
  Archive,
  Fuel,
  User,
  Wallet,
  Plus,
} from "../components/ui/Icons.jsx";

export function GroupDetail({ groupId }) {
  const group = useGroup(groupId);
  const entries = useEntriesForGroup(groupId) || [];
  const payments = usePayments() || [];
  const people = usePeople() || [];
  const peopleMap = usePeopleMap();
  const settings = useSettings();
  const applications = useCreditApplicationsForGroup(groupId) || [];
  const { back, openSheet, askConfirm, toast } = useApp();
  const entryActions = useEntryActions();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [kmpl, setKmpl] = useState("");
  // Editable carpool owner (#5) - only shown/used for non-owned groups.
  const [ownerId, setOwnerId] = useState(null);
  const [newOwnerName, setNewOwnerName] = useState("");
  // Tapping a balance records a payment straight away; if they owe on several
  // fill-ups, this holds the "which fill-up?" picker.
  const [payPickerWho, setPayPickerWho] = useState(null);

  if (!group || !peopleMap) return <ScreenLoading />;

  const isOwned = group.ownerType === "me";
  // The owner every passenger owes / holds credit from (rule 1's pair).
  const ownerWho = isOwned ? ME : mkPerson(group.ownerPersonId);
  // Default name used when the edit field is left blank (#7): "My Car" for your
  // own vehicle, else "{owner}'s Car" from the currently-picked owner.
  const editOwnerName = (people || []).find((p) => p.id === ownerId)?.name || "";
  const editDefaultName = isOwned
    ? "My Car"
    : editOwnerName
    ? `${editOwnerName}'s Car`
    : "Their Car";
  const balances = groupBalances(entries, payments, {
    excludeMe: isOwned,
    excludeWho: isOwned ? null : ownerWho,
    applications,
  }).filter((b) => b.owed > 0 || b.credit > 0);
  // Your own share across this vehicle's fill-ups (billed, covered by you), shown
  // for reference, never collectable.
  const meBilled = isOwned
    ? entries
        .filter((e) => !isFutureDate(e.date))
        .reduce((sum, e) => sum + share(e, ME), 0)
    : 0;

  // Fill-ups a person can have a payment applied to: those they still owe on,
  // or (if they only hold credit) any fill-up they're on. Upcoming (future-dated)
  // refuels ARE included so you can prepay them; the money math holds those
  // payments out of the live balances until the refuel date arrives.
  const payableEntriesFor = (who) => {
    const owing = entries.filter((e) => outstanding(e, who, payments, applications) > 0.005);
    if (owing.length) return owing;
    return entries.filter((e) => (e.passengers || []).some((p) => whoEquals(p.who, who)));
  };

  function openApplyCredit(who) {
    openSheet({ type: "applyCredit", groupId, debtorWho: who, creditorWho: ownerWho });
  }

  function recordPaymentFor(who) {
    const payable = payableEntriesFor(who);
    if (payable.length === 1) {
      openSheet({ type: "payment", entry: payable[0], who, ownedByMe: isOwned });
    } else if (payable.length > 1) setPayPickerWho(who);
  }

  function startEdit() {
    setName(group.name);
    setKmpl(String(group.defaultKmPerLiter));
    setOwnerId(group.ownerPersonId);
    setNewOwnerName("");
    setEditing(true);
  }
  // Picking an owner only sets the owner; the name keeps whatever you typed and
  // falls back to a "{owner}'s Car" placeholder default when blank (#7).
  function pickEditOwner(p) {
    setOwnerId(p.id);
  }
  async function addOwnerPerson() {
    const nm = newOwnerName.trim();
    if (!nm) return;
    try {
      const p = await createPerson(nm);
      pickEditOwner(p);
      setNewOwnerName("");
    } catch (e) {
      toast(e.message, "error");
    }
  }
  async function saveEdit() {
    // Blank name falls back to the placeholder default (#7).
    const nm = name.trim() || editDefaultName;
    const kmplNum = Number(kmpl);
    if (!(kmplNum > 0)) {
      toast("Fuel efficiency must be greater than 0.", "error");
      return;
    }
    const effChanged = kmplNum !== Number(group.defaultKmPerLiter);
    // Changing a carpool's owner recomputes who's owed across every trip (#5),
    // since the owner is who all passengers owe. Confirm before applying.
    const ownerChanged = !isOwned && ownerId && ownerId !== group.ownerPersonId;
    if (ownerChanged) {
      const ok = await askConfirm({
        title: "Change this carpool's owner?",
        body: `Every trip in ${group.name} is owed to its owner, so changing it recomputes who owes whom across all ${entries.length} trip${entries.length === 1 ? "" : "s"} here.`,
        confirmLabel: "Change owner",
        danger: true,
      });
      if (!ok) return;
    }
    const patch = { name: nm, defaultKmPerLiter: kmplNum };
    if (ownerChanged) patch.ownerPersonId = ownerId;
    try {
      await updateGroup(group.id, patch);
      setEditing(false);
      toast(
        ownerChanged
          ? "Owner changed - balances recomputed"
          : effChanged
          ? "Efficiency saved - applies to new trips"
          : "Car updated"
      );
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function onArchive() {
    const hasHistory = entries.length > 0;
    const noun = isOwned ? "car" : "carpool";
    const ok = await askConfirm({
      title: hasHistory ? `Archive ${group.name}?` : `Remove ${group.name}?`,
      body: hasHistory
        ? "It'll be hidden from pickers and lists but all its history stays intact. You can restore it from Settings → Archived."
        : `This ${noun} has no history yet, so it'll be deleted. You can always add it again later.`,
      confirmLabel: hasHistory ? "Archive" : "Remove",
      danger: true,
    });
    if (!ok) return;
    try {
      const result = await removeGroup(group.id);
      toast(result === "archived" ? `${group.name} archived` : `${group.name} removed`);
      back();
    } catch (e) {
      toast(e.message, "error");
    }
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
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={editDefaultName}
              />
            </Field>
            {!isOwned && (
              <Field
                label="Owner / driver"
                hint="Who owns this car. Changing it recomputes every trip's balances."
              >
                {people.length > 0 && (
                  <div className="chip-wrap">
                    {people.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="pick-chip"
                        aria-pressed={ownerId === p.id}
                        onClick={() => pickEditOwner(p)}
                      >
                        {ownerId === p.id && <Check size={13} />}
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
                <div
                  className="field-inline"
                  style={{ gridTemplateColumns: "1fr auto", marginTop: "0.6rem" }}
                >
                  <input
                    type="text"
                    placeholder="Or add a new person…"
                    value={newOwnerName}
                    onChange={(e) => setNewOwnerName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addOwnerPerson();
                      }
                    }}
                  />
                  <button className="action-btn" type="button" onClick={addOwnerPerson}>
                    <Plus size={15} /> Add
                  </button>
                </div>
              </Field>
            )}
            <Field
              label={
                <>
                  Fuel efficiency (km/L){" "}
                  <InfoTip text="Most cars average about 12 km/L (~8 L/100km). For your car's exact figure, check its trip computer/dashboard or search your model online." />
                </>
              }
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
              <div className="balance-row-wrap" key={i}>
                <button
                  className="balance-row balance-row--tappable"
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
                {b.credit > 0.005 && b.owed > 0.005 && (
                  <button
                    className="apply-credit-btn"
                    type="button"
                    onClick={() => openApplyCredit(b.who)}
                  >
                    <Wallet size={13} /> Apply {formatMoneyShort(b.credit)} credit to a debt
                  </button>
                )}
              </div>
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
          <UpcomingReveal
            entries={entries}
            windowValue={settings?.upcomingWindow}
            renderEntry={(e) => (
              <EntryCard
                key={e.id}
                entry={e}
                payments={payments}
                peopleMap={peopleMap}
                ownedByMe={isOwned}
                ownerName={personName(group.ownerPersonId, peopleMap)}
                ownerWho={ownerWho}
                vehicleName={group.name}
                fallbackTitle={group.name}
                applications={applications}
                onRecordPayment={entryActions.onRecordPayment}
                onEditPayment={entryActions.onEditPayment}
                onDeletePayment={entryActions.onDeletePayment}
                onQuickSettle={entryActions.onQuickSettle}
                onClearPayments={entryActions.onClearPayments}
                onEdit={entryActions.onEditEntry}
                onDuplicate={entryActions.onDuplicateEntry}
                onDelete={entryActions.onDeleteEntry}
                onReverseCredit={entryActions.onReverseCredit}
              />
            )}
          />
        )}
      </section>

      {/* Danger zone - same heading treatment as Settings' danger zone. */}
      <section className="section-block">
        <h2 className="section-block__title" style={{ marginBottom: "0.6rem", color: "#ff6b81" }}>
          Danger zone
        </h2>
        <button className="action-btn btn-block btn-danger" type="button" onClick={onArchive}>
          <Archive size={16} /> {entries.length > 0 ? "Archive" : "Remove"} this{" "}
          {isOwned ? "car" : "carpool"}
        </button>
      </section>

      {/* Pay-picker: which fill-up to apply the payment to */}
      {payPickerWho && (
        <PickTripSheet
          title={`Pay for ${whoName(payPickerWho, peopleMap)}`}
          subtitle={`Which ${isOwned ? "refuel" : "trip"} is this payment for?`}
          groupName={group.name}
          trips={payableEntriesFor(payPickerWho).map((e) => ({
            entry: e,
            amount: outstanding(e, payPickerWho, payments, applications),
          }))}
          onPick={(e) => {
            const who = payPickerWho;
            setPayPickerWho(null);
            openSheet({ type: "payment", entry: e, who, ownedByMe: isOwned });
          }}
          onClose={() => setPayPickerWho(null)}
        />
      )}
    </div>
  );
}

