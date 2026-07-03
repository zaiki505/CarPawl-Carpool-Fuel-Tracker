import React, { useMemo, useState } from "react";
import { Sheet } from "./ui/Sheet.jsx";
import { Field, MoneyInput, Segment } from "./ui/Primitives.jsx";
import {
  useGroups,
  usePeople,
  usePeopleMap,
  useEntries,
  useSettings,
  useEntry,
  usePaymentsForEntry,
} from "../db/hooks.js";
import { createEntry, updateEntry, createPerson } from "../db/actions.js";
import { deriveEntryTotals, shareOfRow, driverCompBase } from "../lib/calc.js";
import { SPLIT_METHOD_OPTIONS, SPLIT_METHOD_HINTS } from "../lib/splitMethods.js";
import {
  formatMoney,
  formatLiters,
  formatKm,
  formatKmpl,
  todayISODate,
  parseNum,
} from "../lib/format.js";
import { whoName } from "../lib/names.js";
import { ME, person as mkPerson, whoKey } from "../lib/identity.js";
import { useApp } from "../app/AppContext.jsx";
import { Check, Plus, Car, Fuel } from "./ui/Icons.jsx";

/* Add / edit a fill-up (§7.4, math per §4.1). One of {cost, liters, distance}
   is the primary input; the other two derive from the group's km/L and the
   entry's fuel price. An optional second real value makes efficiency measured.
   Passengers are picked individually (zero allowed for a personal log); each
   gets a distance defaulting to the full trip, shortenable for early drop-off.
   Edit mode warns before recalculating balances and blocks removing a
   passenger who already has payments (§8). */
export function AddEntrySheet({ entryId, onClose }) {
  const editing = Boolean(entryId);
  const groups = useGroups() || [];
  const people = usePeople() || [];
  const peopleMap = usePeopleMap();
  const entries = useEntries() || [];
  const settings = useSettings();
  const existing = useEntry(entryId);
  const entryPayments = usePaymentsForEntry(entryId) || [];
  const { toast, askConfirm } = useApp();

  // Order groups by most-recently-used (latest entry date), owned first as tiebreak.
  const orderedGroups = useMemo(() => {
    const lastUsed = {};
    for (const e of entries) {
      const d = new Date(e.date).getTime();
      if (!lastUsed[e.groupId] || d > lastUsed[e.groupId]) lastUsed[e.groupId] = d;
    }
    return [...groups].sort((a, b) => {
      const la = lastUsed[a.id] || 0;
      const lb = lastUsed[b.id] || 0;
      if (lb !== la) return lb - la;
      return (a.ownerType === "me" ? 0 : 1) - (b.ownerType === "me" ? 0 : 1);
    });
  }, [groups, entries]);

  const [ready, setReady] = useState(false);
  const [groupId, setGroupId] = useState(null);
  const [primaryField, setPrimaryField] = useState("cost");
  const [primaryValue, setPrimaryValue] = useState("");
  const [fuelPrice, setFuelPrice] = useState("");
  const [secondValue, setSecondValue] = useState("");
  // passengers: { who, distance, custom } — custom tracks manual distance edits
  const [passengers, setPassengers] = useState([]);
  const [date, setDate] = useState(todayISODate());
  const [title, setTitle] = useState("");
  const [showAllPeople, setShowAllPeople] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Split method + driver-comp extras
  const [splitMethod, setSplitMethod] = useState("distance");
  const [tolls, setTolls] = useState("");
  const [parking, setParking] = useState("");
  const [maintenancePct, setMaintenancePct] = useState("");

  // One-time initialisation once data is available.
  if (!ready && settings) {
    if (editing) {
      if (existing) {
        setGroupId(existing.groupId);
        // Reconstruct as "cost primary" using the stored real numbers; the
        // stored totals are authoritative so we prime the primary as cost and
        // keep liters/distance measured via the second value where applicable.
        setPrimaryField("cost");
        setPrimaryValue(String(round2(existing.totalCost)));
        setFuelPrice(String(existing.fuelPricePerLiter));
        setSecondValue(
          existing.hasMeasuredEfficiency ? String(round2(existing.totalDistance)) : ""
        );
        setPassengers(
          (existing.passengers || []).map((p) => ({
            who: p.who,
            distance: String(round2(p.distanceAssigned)),
            custom: true,
          }))
        );
        setSplitMethod(existing.splitMethod || "distance");
        setTolls(existing.tolls ? String(existing.tolls) : "");
        setParking(existing.parking ? String(existing.parking) : "");
        setMaintenancePct(
          existing.maintenancePct != null
            ? String(existing.maintenancePct)
            : String(settings.defaultMaintenancePct ?? 10)
        );
        setDate(existing.date);
        setTitle(existing.title || "");
        setReady(true);
      }
    } else {
      setGroupId(orderedGroups[0]?.id || null);
      setFuelPrice(String(settings.defaultFuelPricePerLiter));
      setSplitMethod(settings.defaultSplitMethod || "distance");
      setMaintenancePct(String(settings.defaultMaintenancePct ?? 10));
      setReady(true);
    }
  }

  const group = groups.find((g) => g.id === groupId) || null;
  const kmpl = group?.defaultKmPerLiter || 0;
  const isOwned = group?.ownerType === "me";

  // Derived totals (live preview + save payload).
  const totals = useMemo(() => {
    const pv = parseNum(primaryValue) || 0;
    const price = parseNum(fuelPrice) || 0;
    const sv = parseNum(secondValue);
    return deriveEntryTotals({
      primaryField,
      primaryValue: pv,
      pricePerLiter: price,
      kmPerLiter: kmpl,
      measuredDistance: primaryField === "distance" ? null : sv,
      measuredLiters: primaryField === "distance" ? sv : null,
    });
  }, [primaryField, primaryValue, fuelPrice, secondValue, kmpl]);

  const totalDistance = totals.totalDistance;

  // Keep non-custom passenger distances synced to the full trip distance.
  const syncedPassengers = passengers.map((p) =>
    p.custom ? p : { ...p, distance: totalDistance ? String(round2(totalDistance)) : "" }
  );

  const isDistance = splitMethod === "distance";
  const isDriverComp = splitMethod === "driver_comp";

  // A live entry-shaped object so we can preview each rider's share per method.
  const previewEntry = {
    totalCost: totals.totalCost,
    totalDistance: totals.totalDistance,
    splitMethod,
    tolls: parseNum(tolls) || 0,
    parking: parseNum(parking) || 0,
    maintenancePct: parseNum(maintenancePct) || 0,
    passengers: syncedPassengers.map((p) => ({
      who: p.who,
      distanceAssigned: parseNum(p.distance) || 0,
    })),
  };

  // --- passenger candidates ---
  const usualWhoKeys = useMemo(() => {
    const keys = new Set();
    for (const e of entries) {
      if (e.groupId !== groupId) continue;
      for (const p of e.passengers || []) keys.add(whoKey(p.who));
    }
    return keys;
  }, [entries, groupId]);

  const candidates = useMemo(() => {
    const list = [];
    if (group && !isOwned) list.push(ME); // "me" only in non-owned groups
    for (const p of people) list.push(mkPerson(p.id));
    return list;
  }, [group, isOwned, people]);

  const selectedKeys = new Set(syncedPassengers.map((p) => whoKey(p.who)));
  const suggested = candidates.filter((w) => usualWhoKeys.has(whoKey(w)));
  const others = candidates.filter((w) => !usualWhoKeys.has(whoKey(w)));

  function togglePassenger(who) {
    const key = whoKey(who);
    setPassengers((prev) => {
      if (prev.some((p) => whoKey(p.who) === key)) {
        return prev.filter((p) => whoKey(p.who) !== key);
      }
      return [
        ...prev,
        { who, distance: totalDistance ? String(round2(totalDistance)) : "", custom: false },
      ];
    });
  }

  function setPassengerDistance(key, value) {
    setPassengers((prev) =>
      prev.map((p) =>
        whoKey(p.who) === key ? { ...p, distance: value, custom: true } : p
      )
    );
  }

  async function addPerson() {
    const nm = newPersonName.trim();
    if (!nm) return;
    try {
      const p = await createPerson(nm);
      setNewPersonName("");
      togglePassenger(mkPerson(p.id));
    } catch (e) {
      setError(e.message);
    }
  }

  function changeGroup(id) {
    setGroupId(id);
    setPassengers([]); // roster differs per group
  }

  async function save() {
    setError("");
    if (!groupId) return setError("Pick a group first.");
    if (!(parseNum(primaryValue) > 0)) {
      return setError("Enter a cost, liters or distance for this fill-up.");
    }
    if (!date) return setError("Pick a date.");

    const payloadPassengers = syncedPassengers.map((p) => ({
      who: p.who,
      distanceAssigned: parseNum(p.distance) || 0,
    }));

    const payload = {
      groupId,
      date,
      title: title.trim() || null,
      totalCost: totals.totalCost,
      totalLiters: totals.totalLiters,
      totalDistance: totals.totalDistance,
      fuelPricePerLiter: totals.fuelPricePerLiter,
      hasMeasuredEfficiency: totals.hasMeasuredEfficiency,
      splitMethod,
      tolls: isDriverComp ? parseNum(tolls) || 0 : 0,
      parking: isDriverComp ? parseNum(parking) || 0 : 0,
      maintenancePct: isDriverComp ? parseNum(maintenancePct) || 0 : 0,
      passengers: payloadPassengers,
    };

    setBusy(true);
    try {
      if (editing) {
        if (entryPayments.length > 0) {
          const ok = await askConfirm({
            title: "Recalculate balances?",
            body: "Editing this fill-up changes each passenger's share, so what's still owed gets recalculated. Payments you've already recorded stay exactly as they are.",
            confirmLabel: "Save changes",
          });
          if (!ok) {
            setBusy(false);
            return;
          }
        }
        await updateEntry(entryId, payload);
        toast("Fill-up updated");
      } else {
        await createEntry(payload);
        toast("Fill-up saved ⛽");
      }
      onClose();
    } catch (e) {
      // §8: blocked passenger removal comes back with a clear message.
      setError(e.message);
      setBusy(false);
    }
  }

  // --- primary/second field labels ---
  const primaryUnit =
    primaryField === "cost" ? "RM" : primaryField === "liters" ? "L" : "km";
  const secondLabel =
    primaryField === "distance"
      ? "Actual liters filled (optional)"
      : "Actual trip distance (optional)";
  const secondHint =
    primaryField === "distance"
      ? "Know exactly how much fuel went in? Add it for a real km/L reading."
      : "Got your real trip distance? Add it for a real km/L reading.";

  return (
    <Sheet
      title={editing ? "Edit fill-up" : "Add a fill-up"}
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
            disabled={busy || !groupId}
          >
            {editing ? "Save changes" : "Save fill-up"}
          </button>
        </>
      }
    >
      {groups.length === 0 ? (
        <p className="muted">Add a car first, then log a fill-up.</p>
      ) : (
        <div className="field-grid">
          {/* Group picker */}
          <Field label="Which car / carpool?">
            <div className="chip-wrap">
              {orderedGroups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="pick-chip"
                  aria-pressed={groupId === g.id}
                  onClick={() => changeGroup(g.id)}
                >
                  <Car size={14} />
                  {g.name}
                </button>
              ))}
            </div>
          </Field>

          {/* Primary fuel input */}
          <Field label="What do you know?">
            <Segment
              value={primaryField}
              onChange={setPrimaryField}
              options={[
                { value: "cost", label: "Cost" },
                { value: "liters", label: "Liters" },
                { value: "distance", label: "Distance" },
              ]}
            />
          </Field>

          <div className="field-inline">
            <Field label={`Amount (${primaryUnit})`}>
              {primaryField === "cost" ? (
                <MoneyInput value={primaryValue} onChange={setPrimaryValue} />
              ) : (
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder={primaryField === "liters" ? "e.g. 30" : "e.g. 240"}
                  value={primaryValue}
                  onChange={(e) => setPrimaryValue(e.target.value)}
                />
              )}
            </Field>
            <Field label="Fuel price (RM/L)">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={fuelPrice}
                onChange={(e) => setFuelPrice(e.target.value)}
              />
            </Field>
          </div>

          {/* Optional second real value */}
          <Field label={secondLabel} hint={secondHint}>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder={primaryField === "distance" ? "e.g. 22" : "e.g. 540"}
              value={secondValue}
              onChange={(e) => setSecondValue(e.target.value)}
            />
          </Field>

          {/* Live derived preview */}
          <div className="derive-preview">
            <Derived label="Cost" value={formatMoney(totals.totalCost)} />
            <Derived label="Liters" value={formatLiters(totals.totalLiters)} />
            <Derived label="Distance" value={formatKm(totals.totalDistance)} />
            <Derived
              label="km/L"
              value={
                totals.hasMeasuredEfficiency && totals.totalLiters
                  ? formatKmpl(totals.totalDistance / totals.totalLiters)
                  : `~${formatKmpl(kmpl)}`
              }
              accent={totals.hasMeasuredEfficiency}
            />
          </div>

          {/* Split method */}
          {group && (
            <Field label="How to split" hint={SPLIT_METHOD_HINTS[splitMethod]}>
              <Segment
                value={splitMethod}
                onChange={setSplitMethod}
                options={SPLIT_METHOD_OPTIONS}
              />
            </Field>
          )}

          {/* Driver-compensation extras */}
          {group && isDriverComp && (
            <div className="field-inline" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              <Field label="Tolls (RM)">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={tolls}
                  onChange={(e) => setTolls(e.target.value)}
                />
              </Field>
              <Field label="Parking (RM)">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={parking}
                  onChange={(e) => setParking(e.target.value)}
                />
              </Field>
              <Field label="Maint. %">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="1"
                  placeholder="10"
                  value={maintenancePct}
                  onChange={(e) => setMaintenancePct(e.target.value)}
                />
              </Field>
            </div>
          )}

          {/* Passengers */}
          {group && (
            <Field
              label="Split with"
              hint={
                isOwned
                  ? "Leave empty for a personal fill-up. Your own driving is never billed."
                  : "Include yourself and everyone riding — just like the driver would."
              }
            >
              <div className="chip-wrap">
                {[...suggested, ...(showAllPeople ? others : [])].map((who) => (
                  <button
                    key={whoKey(who)}
                    type="button"
                    className="pick-chip"
                    aria-pressed={selectedKeys.has(whoKey(who))}
                    onClick={() => togglePassenger(who)}
                  >
                    {selectedKeys.has(whoKey(who)) && <Check size={13} />}
                    {whoName(who, peopleMap)}
                  </button>
                ))}
                {!showAllPeople && others.length > 0 && (
                  <button
                    type="button"
                    className="pick-chip"
                    onClick={() => setShowAllPeople(true)}
                  >
                    + more
                  </button>
                )}
              </div>

              <div
                className="field-inline"
                style={{ gridTemplateColumns: "1fr auto", marginTop: "0.6rem" }}
              >
                <input
                  type="text"
                  placeholder="Add a new person…"
                  value={newPersonName}
                  onChange={(e) => setNewPersonName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addPerson();
                    }
                  }}
                />
                <button className="action-btn" type="button" onClick={addPerson}>
                  <Plus size={15} /> Add
                </button>
              </div>
            </Field>
          )}

          {/* Per-passenger distance (distance method only) */}
          {isDistance && syncedPassengers.length > 0 && (
            <div className="pax-dist-list">
              {syncedPassengers.map((p) => {
                const key = whoKey(p.who);
                const full =
                  totalDistance &&
                  Math.abs((parseNum(p.distance) || 0) - totalDistance) < 0.01;
                return (
                  <div className="pax-dist-row" key={key}>
                    <span className="pax-dist-row__name">
                      {whoName(p.who, peopleMap)}
                      <span className="faint" style={{ fontWeight: "normal" }}>
                        {" "}
                        · {formatMoney(shareOfRow(previewEntry, {
                          who: p.who,
                          distanceAssigned: parseNum(p.distance) || 0,
                        }))}
                      </span>
                    </span>
                    <div className="pax-dist-row__input">
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="1"
                        value={p.distance}
                        onChange={(e) => setPassengerDistance(key, e.target.value)}
                      />
                      <span className="faint">km {full ? "· full trip" : ""}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Equal / driver-comp: show each rider's equal share */}
          {!isDistance && syncedPassengers.length > 0 && (
            <div className="pax-dist-list">
              {isDriverComp && (
                <div className="field-hint" style={{ marginTop: 0 }}>
                  Billable to riders: {formatMoney(driverCompBase(previewEntry))} (fuel
                  + tolls + parking + {parseNum(maintenancePct) || 0}% maintenance)
                </div>
              )}
              {syncedPassengers.map((p) => (
                <div className="pax-dist-row" key={whoKey(p.who)}>
                  <span className="pax-dist-row__name">{whoName(p.who, peopleMap)}</span>
                  <span className="accent-text" style={{ fontWeight: "bold", fontSize: "0.85rem" }}>
                    {formatMoney(
                      shareOfRow(previewEntry, {
                        who: p.who,
                        distanceAssigned: parseNum(p.distance) || 0,
                      })
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Date + title */}
          <div className="field-inline">
            <Field label="Date">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label="Title (optional)">
              <input
                type="text"
                placeholder="e.g. Petronas run"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
          </div>

          {error && (
            <div className="form-status is-visible" data-state="error">
              {error}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

function Derived({ label, value, accent }) {
  return (
    <div className="derive-item">
      <span className="derive-item__label">{label}</span>
      <span className={"derive-item__value" + (accent ? " accent-text" : "")}>
        {value}
      </span>
    </div>
  );
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
