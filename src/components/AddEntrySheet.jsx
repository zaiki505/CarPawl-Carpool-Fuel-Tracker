import React, { useMemo, useState } from "react";
import { Sheet } from "./ui/Sheet.jsx";
import { Field, Segment } from "./ui/Primitives.jsx";
import { DatePicker } from "./ui/DatePicker.jsx";
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
import {
  deriveEntryTotals,
  shareOfRow,
  entryTotalBillable,
  share,
} from "../lib/calc.js";
import { SPLIT_METHOD_OPTIONS, SPLIT_METHOD_HINTS } from "../lib/splitMethods.js";
import { formatMoney, todayISODate, parseNum } from "../lib/format.js";
import { whoName } from "../lib/names.js";
import { ME, person as mkPerson, whoKey } from "../lib/identity.js";
import { useApp } from "../app/AppContext.jsx";
import { haptic } from "../lib/haptics.js";
import { Check, Plus, Car, Fuel } from "./ui/Icons.jsx";

/* Add / edit a fill-up (7.4, math per 4.1). One of {cost, liters, distance}
   is the primary input; the other two derive from the group's km/L and the
   entry's fuel price. An optional second real value makes efficiency measured.
   Passengers are picked individually (zero allowed for a personal log); each
   gets a distance defaulting to the full trip, shortenable for early drop-off.
   Edit mode warns before recalculating balances and blocks removing a
   passenger who already has payments (8). */
export function AddEntrySheet({ entryId, preselectGroupId, duplicateOf, onClose }) {
  const editing = Boolean(entryId);
  const duplicating = Boolean(duplicateOf) && !editing;
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
  // primaryField = which of cost/liters/distance the user last edited (the
  // "source"); the other two derive from it via price + km/L. km/L is now a
  // per-entry editable value (defaults to the car's efficiency).
  const [primaryField, setPrimaryField] = useState("cost");
  const [primaryValue, setPrimaryValue] = useState("");
  const [fuelPrice, setFuelPrice] = useState("");
  const [kmplInput, setKmplInput] = useState("");
  // A hand-typed km/L counts as a real (measured) reading for the trend chart.
  const [kmplTouched, setKmplTouched] = useState(false);
  // passengers: { who, distance, custom, override } - custom tracks manual
  // distance edits, override is a string ("" = auto-split, Compensate only)
  const [passengers, setPassengers] = useState([]);
  // Who was present for tolls (Compensate). null = not customized yet, so
  // every currently-selected passenger counts as present (see
  // tollsPresentDisplaySet below) - same "materialize on first edit" idiom as
  // passenger.custom for distance.
  const [tollsPresentKeys, setTollsPresentKeys] = useState(null);
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
  // Custom method: how the leftover pool splits - 'equal' | 'distance'.
  const [customRemainderSplit, setCustomRemainderSplit] = useState("equal");

  // One-time initialisation once data is available. `src` seeds both edit mode
  // (from the loaded entry) and duplicate mode (from the passed-in entry). A
  // duplicate is a brand-new entry, so it keeps everything but the date (today)
  // and never copies payments.
  const src = editing ? existing : duplicating ? duplicateOf : null;
  if (!ready && settings) {
    if (src) {
      setGroupId(src.groupId);
      // Reconstruct as "cost primary" using the stored real numbers; the stored
      // totals are authoritative so we prime the primary as cost and keep
      // liters/distance measured via the second value where applicable.
      setPrimaryField("cost");
      setPrimaryValue(String(round2(src.totalCost)));
      setFuelPrice(String(src.fuelPricePerLiter));
      // Reconstruct km/L from the stored totals (distance/liters); reproduces
      // the exact same totals under the new "cost primary + km/L" derivation.
      const srcKmpl =
        src.totalLiters > 0 ? round2(src.totalDistance / src.totalLiters) : src.fuelPricePerLiter && 0;
      setKmplInput(
        srcKmpl ? String(srcKmpl) : String(groups.find((g) => g.id === src.groupId)?.defaultKmPerLiter || "")
      );
      setKmplTouched(Boolean(src.hasMeasuredEfficiency));
      setPassengers(
        (src.passengers || []).map((p) => ({
          who: p.who,
          distance: String(round2(p.distanceAssigned)),
          custom: true,
          override: p.manualOverride != null ? String(p.manualOverride) : "",
        }))
      );
      setTollsPresentKeys(
        src.tollsPresentWho ? new Set(src.tollsPresentWho.map(whoKey)) : null
      );
      setSplitMethod(src.splitMethod || "distance");
      setCustomRemainderSplit(src.customRemainderSplit || "equal");
      setTolls(src.tolls ? String(src.tolls) : "");
      setParking(src.parking ? String(src.parking) : "");
      setMaintenancePct(
        src.maintenancePct != null
          ? String(src.maintenancePct)
          : String(settings.defaultMaintenancePct ?? 10)
      );
      setDate(editing ? src.date : todayISODate());
      setTitle(src.title || "");
      setReady(true);
    } else if (editing) {
      // still waiting for the entry to load - leave ready=false
    } else {
      // Fresh entry. Pre-select the vehicle when opened from its page (16),
      // else most recent.
      const preselect =
        preselectGroupId && groups.some((g) => g.id === preselectGroupId)
          ? preselectGroupId
          : orderedGroups[0]?.id || null;
      setGroupId(preselect);
      setFuelPrice(String(settings.defaultFuelPricePerLiter));
      setKmplInput(String(groups.find((g) => g.id === preselect)?.defaultKmPerLiter || ""));
      setSplitMethod(settings.defaultSplitMethod || "distance");
      setMaintenancePct(String(settings.defaultMaintenancePct ?? 10));
      setReady(true);
    }
  }

  const group = groups.find((g) => g.id === groupId) || null;
  const isOwned = group?.ownerType === "me";
  // Effective km/L for derivation: the typed value, else the car's default.
  const kmplNum =
    parseNum(kmplInput) > 0 ? parseNum(kmplInput) : group?.defaultKmPerLiter || 0;

  // Derived totals (live preview + save payload). Same math as before - the
  // last-edited field is the primary; the other two derive via price + km/L.
  const totals = useMemo(() => {
    const pv = parseNum(primaryValue) || 0;
    const price = parseNum(fuelPrice) || 0;
    return deriveEntryTotals({
      primaryField,
      primaryValue: pv,
      pricePerLiter: price,
      kmPerLiter: kmplNum,
    });
  }, [primaryField, primaryValue, fuelPrice, kmplNum]);

  // Any hand-typed km/L makes this a measured reading (per the trend chart).
  const hasMeasured = kmplTouched;
  const totalDistance = totals.totalDistance;

  // Keep non-custom passenger distances synced to the full trip distance.
  const syncedPassengers = passengers.map((p) =>
    p.custom ? p : { ...p, distance: totalDistance ? String(round2(totalDistance)) : "" }
  );

  const isDistance = splitMethod === "distance";
  const isDriverComp = splitMethod === "driver_comp";

  // Effective "present for tolls" set for rendering - defaults to everyone
  // currently selected until the picker's been touched.
  const tollsPresentDisplaySet =
    tollsPresentKeys ?? new Set(syncedPassengers.map((p) => whoKey(p.who)));

  // A live entry-shaped object so we can preview each rider's share per method.
  const previewEntry = {
    totalCost: totals.totalCost,
    totalDistance: totals.totalDistance,
    splitMethod,
    customRemainderSplit,
    tolls: parseNum(tolls) || 0,
    parking: parseNum(parking) || 0,
    maintenancePct: parseNum(maintenancePct) || 0,
    tollsPresentWho: tollsPresentKeys
      ? syncedPassengers.filter((p) => tollsPresentKeys.has(whoKey(p.who))).map((p) => p.who)
      : null,
    passengers: syncedPassengers.map((p) => ({
      who: p.who,
      distanceAssigned: parseNum(p.distance) || 0,
      manualOverride: p.override !== "" && p.override != null ? parseNum(p.override) : null,
    })),
  };
  // Banner figure (10): in your own vehicle, what you'll collect from
  // passengers (incl tolls/parking/maintenance); in a carpool, your own share.
  const bannerAmount = isOwned
    ? entryTotalBillable(previewEntry, { excludeMe: true })
    : share(previewEntry, ME);
  const bannerLabel = isOwned ? "You'll collect" : "Your share to pay";

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
    // "Me" is selectable in any vehicle now. In your own vehicle your share is
    // tracked for reference but never owed to you (18 update).
    if (group) list.push(ME);
    for (const p of people) list.push(mkPerson(p.id));
    return list;
  }, [group, people]);

  const selectedKeys = new Set(syncedPassengers.map((p) => whoKey(p.who)));
  const suggested = candidates.filter((w) => usualWhoKeys.has(whoKey(w)));
  const others = candidates.filter((w) => !usualWhoKeys.has(whoKey(w)));

  function togglePassenger(who) {
    const key = whoKey(who);
    setPassengers((prev) => {
      if (prev.some((p) => whoKey(p.who) === key)) {
        return prev.filter((p) => whoKey(p.who) !== key);
      }
      // Brand-new entries pick up this carpool's saved default override for
      // this person, if one's been set; editing an existing entry never does
      // (its own stored value already won above, in the init block).
      const savedDefault = !editing && group?.overrideDefaults?.[key];
      return [
        ...prev,
        {
          who,
          distance: totalDistance ? String(round2(totalDistance)) : "",
          custom: false,
          override: savedDefault ? String(savedDefault) : "",
        },
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

  function setPassengerOverride(key, value) {
    setPassengers((prev) =>
      prev.map((p) => (whoKey(p.who) === key ? { ...p, override: value } : p))
    );
  }

  function toggleTollsPresent(who) {
    const key = whoKey(who);
    setTollsPresentKeys((prev) => {
      const base = prev ?? new Set(syncedPassengers.map((p) => whoKey(p.who)));
      const next = new Set(base);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
    // Reset km/L to the newly-selected car's default (unless the user had
    // typed a custom one, keep it - they clearly meant it).
    if (!kmplTouched) {
      setKmplInput(String(groups.find((g) => g.id === id)?.defaultKmPerLiter || ""));
    }
  }

  async function save() {
    setError("");
    if (!groupId) return setError("Pick a vehicle first.");
    if (!(parseNum(primaryValue) > 0)) {
      return setError(`Enter a cost, liters or distance for this ${isOwned ? "refuel" : "trip"}.`);
    }
    if (!date) return setError("Pick a date.");

    const payloadPassengers = syncedPassengers.map((p) => ({
      who: p.who,
      distanceAssigned: parseNum(p.distance) || 0,
      manualOverride:
        isDriverComp && p.override !== "" && p.override != null ? parseNum(p.override) : null,
    }));

    const payload = {
      groupId,
      date,
      title: title.trim() || null,
      totalCost: totals.totalCost,
      totalLiters: totals.totalLiters,
      totalDistance: totals.totalDistance,
      fuelPricePerLiter: totals.fuelPricePerLiter,
      hasMeasuredEfficiency: hasMeasured,
      splitMethod,
      customRemainderSplit: isDriverComp ? customRemainderSplit : "equal",
      tolls: isDriverComp ? parseNum(tolls) || 0 : 0,
      parking: isDriverComp ? parseNum(parking) || 0 : 0,
      maintenancePct: isDriverComp ? parseNum(maintenancePct) || 0 : 0,
      tollsPresentWho: isDriverComp ? previewEntry.tollsPresentWho : null,
      passengers: payloadPassengers,
    };

    setBusy(true);
    try {
      if (editing) {
        if (entryPayments.length > 0) {
          const ok = await askConfirm({
            title: "Recalculate balances?",
            body: `Editing this ${isOwned ? "refuel" : "trip"} changes each passenger's share, so what's still owed gets recalculated. Payments you've already recorded stay exactly as they are.`,
            confirmLabel: "Save changes",
          });
          if (!ok) {
            setBusy(false);
            return;
          }
        }
        await updateEntry(entryId, payload);
        toast(`${isOwned ? "Refuel" : "Trip"} updated`);
      } else {
        await createEntry(payload);
        haptic("light");
        toast(`${isOwned ? "Refuel" : "Trip"} saved ⛽`);
      }
      onClose();
    } catch (e) {
      // 8: blocked passenger removal comes back with a clear message.
      setError(e.message);
      setBusy(false);
    }
  }

  // Value shown in each editable card cell: the field you're currently editing
  // shows your raw input; the rest show their derived total.
  const pvNum = parseNum(primaryValue);
  const cellValue = (field) => {
    if (field === primaryField) return primaryValue;
    if (pvNum == null) return "";
    const n = { cost: totals.totalCost, liters: totals.totalLiters, distance: totals.totalDistance }[field];
    return n ? String(round2(n)) : "";
  };
  const editField = (field) => (v) => {
    setPrimaryField(field);
    setPrimaryValue(v);
  };

  return (
    <Sheet
      title={
        editing
          ? isOwned ? "Edit refuel" : "Edit trip"
          : duplicating
          ? isOwned ? "Duplicate refuel" : "Duplicate trip"
          : isOwned ? "Add a refuel" : "Add a trip"
      }
      onClose={onClose}
      banner={
        group ? (
          <div className="sheet-banner">
            <span className="sheet-banner__label">{bannerLabel}</span>
            <span
              className={
                "sheet-banner__amount " + (isOwned ? "pos" : "neg")
              }
            >
              {formatMoney(bannerAmount)}
            </span>
          </div>
        ) : null
      }
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
            {editing ? "Save changes" : isOwned ? "Save refuel" : "Save trip"}
          </button>
        </>
      }
    >
      {groups.length === 0 ? (
        <p className="muted">Add a car first, then log a refuel.</p>
      ) : (
        <div className="field-grid">
          <div className="form-section-head">Vehicle</div>
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

          <div className="form-section-head">Fuel</div>
          {/* Fuel price is a rate; the four figures below are all editable and
              recalculate each other. Whichever you type into becomes the source. */}
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
          
         
          <div className="derive-preview derive-preview--editable">
            <EditCell
              label="Cost"
              prefix="RM"
              value={cellValue("cost")}
              onChange={editField("cost")}
              active={primaryField === "cost"}
            />
            <EditCell
              label="Liters"
              suffix="L"
              value={cellValue("liters")}
              onChange={editField("liters")}
              active={primaryField === "liters"}
            />
            <EditCell
              label="Distance"
              suffix="km"
              value={cellValue("distance")}
              onChange={editField("distance")}
              active={primaryField === "distance"}
            />
            <EditCell
              label="km/L"
              value={kmplInput}
              onChange={(v) => {
                setKmplInput(v);
                setKmplTouched(true);
              }}
              accent={kmplTouched}
            />
          </div>
           <p className="field-hint" style={{ margin: "0 0 -0.2rem" }}>
            Tap any figure to edit it - the others update automatically.
          </p>

          <div className="form-section-head">Split</div>
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

          {group && isDriverComp && (
            <Field
              label="Split the rest by"
              hint={
                customRemainderSplit === "distance"
                  ? "Passengers who travelled further pay more of the leftover pool."
                  : "The leftover pool is split evenly among the passengers."
              }
            >
              <Segment
                value={customRemainderSplit}
                onChange={setCustomRemainderSplit}
                options={[
                  { value: "equal", label: "Equally" },
                  { value: "distance", label: "By distance" },
                ]}
              />
            </Field>
          )}

          <div className="form-section-head">Passengers</div>
          {/* Passengers */}
          {group && (
            <Field
              label="Split with"
              hint={
                isOwned
                  ? "Leave empty for a personal refuel. Your own driving is never billed."
                  : "Include yourself and everyone riding together in the trip."
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

          {/* Equal / Compensate: show each rider's share */}
          {!isDistance && syncedPassengers.length > 0 && (
            <div className="pax-dist-list">
              {isDriverComp && (
                <div className="field-hint" style={{ marginTop: 0 }}>
                  Billable to passengers: {formatMoney(entryTotalBillable(previewEntry))} (fuel +
                  parking + {parseNum(maintenancePct) || 0}% maintenance, plus tolls split among
                  who was present)
                </div>
              )}

              {isDriverComp && parseNum(tolls) > 0 && (
                <Field
                  label="Who was present for tolls?"
                  hint="Unchecked passengers owe nothing toward tolls."
                >
                  <div className="chip-wrap">
                    {syncedPassengers.map((p) => {
                      const key = whoKey(p.who);
                      const present = tollsPresentDisplaySet.has(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          className="pick-chip"
                          aria-pressed={present}
                          onClick={() => toggleTollsPresent(p.who)}
                        >
                          {present && <Check size={13} />}
                          {whoName(p.who, peopleMap)}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              )}

              {syncedPassengers.map((p) => {
                const key = whoKey(p.who);
                const overrideNum =
                  p.override !== "" && p.override != null ? parseNum(p.override) : null;
                const finalShare = shareOfRow(previewEntry, {
                  who: p.who,
                  distanceAssigned: parseNum(p.distance) || 0,
                  manualOverride: overrideNum,
                });
                return (
                  <div className="pax-dist-row" key={key}>
                    <span className="pax-dist-row__name">
                      {whoName(p.who, peopleMap)}
                      {isDriverComp && (
                        <span className="faint" style={{ fontWeight: "normal" }}>
                          {" "}
                          · {formatMoney(finalShare)}
                        </span>
                      )}
                    </span>
                    {isDriverComp ? (
                      <div className="pax-comp-inputs">
                        {customRemainderSplit === "distance" && overrideNum == null && (
                          <div className="pax-dist-row__input">
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="1"
                              placeholder="km"
                              value={p.distance}
                              onChange={(e) => setPassengerDistance(key, e.target.value)}
                              aria-label={`${whoName(p.who, peopleMap)} distance (km)`}
                            />
                            <span className="faint">km</span>
                          </div>
                        )}
                        <div className="pax-dist-row__input">
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            placeholder="Auto"
                            value={p.override}
                            onChange={(e) => setPassengerOverride(key, e.target.value)}
                            aria-label={`${whoName(p.who, peopleMap)} fixed amount (RM)`}
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="accent-text" style={{ fontWeight: "bold", fontSize: "0.85rem" }}>
                        {formatMoney(finalShare)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="form-section-head">Details</div>
          {/* Date + title */}
          <div className="field-inline">
            <Field label="Date">
              <DatePicker value={date} onChange={setDate} />
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

/* An editable cell in the fuel card. `active` = this is the field currently
   driving the derivation; `accent` = it's a manually-set (measured) value. */
function EditCell({ label, value, onChange, prefix, suffix, accent, active }) {
  return (
    <label
      className={
        "edit-cell" + (active ? " is-active" : "") + (accent ? " is-accent" : "")
      }
    >
      <span className="derive-item__label">{label}</span>
      <span className="edit-cell__box">
        {prefix && <span className="edit-cell__affix">{prefix}</span>}
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={value}
          placeholder="0"
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix && <span className="edit-cell__affix">{suffix}</span>}
      </span>
    </label>
  );
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
