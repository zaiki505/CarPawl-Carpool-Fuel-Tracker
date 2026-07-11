import React, { useEffect, useMemo, useState } from "react";
import { Sheet } from "./ui/Sheet.jsx";
import { Field, Segment } from "./ui/Primitives.jsx";
import { DatePicker } from "./ui/DatePicker.jsx";
import { Select } from "./ui/Select.jsx";
import { RECURRENCE_OPTIONS, recurrenceLabel } from "../lib/recurrence.js";
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
  driverCompBase,
} from "../lib/calc.js";
import { SPLIT_METHOD_OPTIONS, splitMethodHint } from "../lib/splitMethods.js";
import {
  formatMoney,
  todayISODate,
  parseNum,
  isFutureDate,
  formatKm,
  formatLiters,
  formatDate,
} from "../lib/format.js";
import { InfoTip } from "./ui/InfoTip.jsx";
import { RouteDistanceField } from "./RouteDistanceField.jsx";
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
export function AddEntrySheet({ entryId, preselectGroupId, duplicateOf, focusField, multiEntries, onClose }) {
  const editing = Boolean(entryId);
  const duplicating = Boolean(duplicateOf) && !editing;
  // Multi-edit: several entries selected. Seed from the first; on save, only the
  // fields you actually changed get written onto every selected entry (#5).
  const multiEdit = Array.isArray(multiEntries) && multiEntries.length > 1;
  const groups = useGroups() || [];
  const people = usePeople() || [];
  const peopleMap = usePeopleMap();
  const entries = useEntries() || [];
  const settings = useSettings();
  const existing = useEntry(entryId);
  const entryPayments = usePaymentsForEntry(entryId) || [];
  const { toast, askConfirm, clearSelection, openGroup } = useApp();
  // Whether the passenger set/values were touched this session - gates whether
  // passengers are included in a multi-edit patch.
  const [paxEdited, setPaxEdited] = useState(false);

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
  // Whether any fuel figure (cost/liters/distance/price/km-L) was edited this
  // session. When editing/duplicating and nothing was touched, we save the
  // entry's stored totals verbatim rather than re-deriving them cause re-deriving
  // from rounded display values would drift totalDistance a little each save.
  const [fuelEdited, setFuelEdited] = useState(false);
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
  const [busy, setBusy] = useState(false);
  // Split method + driver-comp extras
  const [splitMethod, setSplitMethod] = useState("distance");
  const [tolls, setTolls] = useState("");
  const [parking, setParking] = useState("");
  const [maintenancePct, setMaintenancePct] = useState("");
  // Custom method: how the leftover pool splits - 'equal' | 'distance'.
  const [customRemainderSplit, setCustomRemainderSplit] = useState("equal");
  const [recurrence, setRecurrence] = useState("none");

  // Wizard: which step is showing (1 Details, 2 Fuel, 3 Split, 4 Review). When
  // opened focused on a specific field, jump straight to the step holding it.
  const [step, setStep] = useState(() => stepForFocus(focusField));
  // After a fresh add/duplicate we show a short success screen instead of just
  // closing; `savedInfo` carries the little summary it renders.
  const [done, setDone] = useState(false);
  const [savedInfo, setSavedInfo] = useState(null);

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
        src.totalLiters > 0 ? round2(src.totalDistance / src.totalLiters) : 0;
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
      // Keep the cadence when editing; a duplicate starts as a fresh one-off so
      // it doesn't silently join the original's recurring series.
      setRecurrence(editing ? src.recurrence || "none" : "none");
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

  // Custom split can over-collect: fixed (pinned) amounts are never reduced
  // even when their sum exceeds this trip's actual cost (see calc.js customRawShare, the pool floors at 0). 
  const overrideSum = previewEntry.passengers.reduce(
    (s, p) =>
      isOwned && p.who?.type === "me"
        ? s
        : s + (p.manualOverride != null ? p.manualOverride : 0),
    0
  );
  const overCollectAmount = isDriverComp
    ? round2(overrideSum - driverCompBase(previewEntry))
    : 0;

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
    // In a carpool the owner IS the driver who paid the pump - they can't be a
    // passenger who owes themselves, so they're not pickable here.
    const ownerPersonId = group?.ownerType === "person" ? group.ownerPersonId : null;
    for (const p of people) {
      if (p.id === ownerPersonId) continue;
      list.push(mkPerson(p.id));
    }
    return list;
  }, [group, people]);

  const selectedKeys = new Set(syncedPassengers.map((p) => whoKey(p.who)));
  const suggested = candidates.filter((w) => usualWhoKeys.has(whoKey(w)));
  const others = candidates.filter((w) => !usualWhoKeys.has(whoKey(w)));

  function togglePassenger(who) {
    setPaxEdited(true);
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
    setPaxEdited(true);
    setPassengers((prev) =>
      prev.map((p) =>
        whoKey(p.who) === key ? { ...p, distance: value, custom: true } : p
      )
    );
  }

  function setPassengerOverride(key, value) {
    setPaxEdited(true);
    setPassengers((prev) =>
      prev.map((p) => (whoKey(p.who) === key ? { ...p, override: value } : p))
    );
  }

  function toggleTollsPresent(who) {
    setPaxEdited(true);
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
      toast(e.message, "error");
    }
  }

  function changeGroup(id) {
    setGroupId(id);
    setPassengers([]); // roster differs per group
    // Reset km/L to the newly-selected car's default (unless the user had
    // typed a custom one, keep it - they clearly meant it).
    if (!kmplTouched) {
      setKmplInput(String(groups.find((g) => g.id === id)?.defaultKmPerLiter || ""));
      // Silently changes the effective km/L the preview derives from
      // (via kmplNum's fallback), same as if the user had typed into that cell. 
      // Otherwise editing/duplicating an entry, then switching vehicles, would save() via the
      // keepStored path using the OLD car's totals while the sheet is
      // visibly previewing the NEW car's derived numbers.
      setFuelEdited(true);
    }
  }

  async function save() {
    if (!groupId) {
      toast("Pick a vehicle first.", "error");
      return;
    }
    if (!(parseNum(primaryValue) > 0)) {
      toast(`Enter a cost, liters or distance for this ${isOwned ? "refuel" : "trip"}.`, "error");
      return;
    }
    if (!date) {
      toast("Pick a date.", "error");
      return;
    }
    // A carpool is a shared ride in someone else's car - it must have at least
    // one passenger to split with (usually you). A zero-passenger "carpool"
    // tracks nobody owing anybody, which is meaningless. Your OWN vehicle can
    // still be a solo refuel with no passengers.
    if (!isOwned && syncedPassengers.length === 0) {
      toast("Add at least one passenger - a carpool trip can't be solo (usually that's you).", "error");
      return;
    }
    // When editing/duplicating without touching any fuel figure, keep the
    // entry's stored totals exactly to prevent nudge of totalDistance a fraction each time. 
    // Computed early so the fuel-price check below can skip entries whose fuel data isn't even
    // being recomputed.
    const keepStored = src && !fuelEdited;
    // A real fuel price is required whenever the fuel figures ARE being (re)derived
    if (!keepStored && !(parseNum(fuelPrice) > 0)) {
      toast("Enter a fuel price first.", "error");
      return;
    }
    if (isDriverComp) {
      const tollsNum = parseNum(tolls);
      const parkingNum = parseNum(parking);
      const maintNum = parseNum(maintenancePct);
      if (tollsNum < 0 || parkingNum < 0 || maintNum < 0) {
        toast("Tolls, parking and maintenance markup can't be negative.", "error");
        return;
      }
    }
    if (syncedPassengers.some((p) => parseNum(p.distance) < 0)) {
      toast("A passenger's distance can't be negative.", "error");
      return;
    }
    if (
      isDriverComp &&
      syncedPassengers.some(
        (p) => p.override !== "" && p.override != null && parseNum(p.override) < 0
      )
    ) {
      toast("A fixed amount can't be negative.", "error");
      return;
    }

    const payloadPassengers = syncedPassengers.map((p) => ({
      who: p.who,
      distanceAssigned: parseNum(p.distance) || 0,
      manualOverride:
        isDriverComp && p.override !== "" && p.override != null ? parseNum(p.override) : null,
    }));

    const finalTotals = keepStored
      ? {
          totalCost: Number(src.totalCost) || 0,
          totalLiters: Number(src.totalLiters) || 0,
          totalDistance: Number(src.totalDistance) || 0,
          fuelPricePerLiter: Number(src.fuelPricePerLiter) || 0,
        }
      : {
          totalCost: totals.totalCost,
          totalLiters: totals.totalLiters,
          totalDistance: totals.totalDistance,
          fuelPricePerLiter: totals.fuelPricePerLiter,
        };
    const finalMeasured = keepStored ? Boolean(src.hasMeasuredEfficiency) : hasMeasured;

    const payload = {
      groupId,
      date,
      title: title.trim() || null,
      totalCost: finalTotals.totalCost,
      totalLiters: finalTotals.totalLiters,
      totalDistance: finalTotals.totalDistance,
      fuelPricePerLiter: finalTotals.fuelPricePerLiter,
      hasMeasuredEfficiency: finalMeasured,
      splitMethod,
      customRemainderSplit: isDriverComp ? customRemainderSplit : "equal",
      tolls: isDriverComp ? parseNum(tolls) || 0 : 0,
      parking: isDriverComp ? parseNum(parking) || 0 : 0,
      maintenancePct: isDriverComp ? parseNum(maintenancePct) || 0 : 0,
      tollsPresentWho: isDriverComp ? previewEntry.tollsPresentWho : null,
      passengers: payloadPassengers,
      recurrence,
    };

    // Multi-edit: write only the fields that differ from the seed entry onto
    // every selected entry, after a confirm. Untouched fields are left alone so
    // each entry keeps its own values.
    if (multiEdit) {
      const rep = src || {};
      const patch = {};
      if (payload.date !== rep.date) patch.date = payload.date;
      if ((payload.title || null) !== (rep.title || null)) patch.title = payload.title;
      if (payload.splitMethod !== rep.splitMethod) patch.splitMethod = payload.splitMethod;
      if ((payload.customRemainderSplit || "equal") !== (rep.customRemainderSplit || "equal"))
        patch.customRemainderSplit = payload.customRemainderSplit;
      if ((payload.recurrence || null) !== (rep.recurrence || null))
        patch.recurrence = payload.recurrence;
      if ((payload.tolls || 0) !== (rep.tolls || 0)) patch.tolls = payload.tolls;
      if ((payload.parking || 0) !== (rep.parking || 0)) patch.parking = payload.parking;
      if ((payload.maintenancePct || 0) !== (rep.maintenancePct || 0))
        patch.maintenancePct = payload.maintenancePct;
      if (fuelEdited) {
        patch.totalCost = payload.totalCost;
        patch.totalLiters = payload.totalLiters;
        patch.totalDistance = payload.totalDistance;
        patch.fuelPricePerLiter = payload.fuelPricePerLiter;
        patch.hasMeasuredEfficiency = payload.hasMeasuredEfficiency;
      }
      if (paxEdited) {
        patch.passengers = payload.passengers;
        patch.tollsPresentWho = payload.tollsPresentWho;
      }
      const keys = Object.keys(patch);
      if (keys.length === 0) {
        toast("Change a field to apply it to all selected entries.", "error");
        return;
      }
      const fuelKeys = new Set([
        "totalCost",
        "totalLiters",
        "totalDistance",
        "fuelPricePerLiter",
        "hasMeasuredEfficiency",
      ]);
      const labelFor = {
        date: "date",
        title: "title",
        splitMethod: "split method",
        customRemainderSplit: "leftover split",
        recurrence: "repeat schedule",
        tolls: "tolls",
        parking: "parking",
        maintenancePct: "maintenance %",
        passengers: "passengers",
        tollsPresentWho: "passengers",
      };
      const labels = [];
      let fuelAdded = false;
      for (const k of keys) {
        if (fuelKeys.has(k)) {
          if (!fuelAdded) {
            labels.push("fuel figures");
            fuelAdded = true;
          }
          continue;
        }
        const l = labelFor[k] || k;
        if (!labels.includes(l)) labels.push(l);
      }
      const ok = await askConfirm({
        title: `Apply to ${multiEntries.length} entries?`,
        body: `This overwrites ${labels.join(", ")} on all ${multiEntries.length} selected entries with the values set here. Their other details stay as they are. This can't be undone.`,
        confirmLabel: "Apply to all",
        danger: true,
      });
      if (!ok) return;
      setBusy(true);
      try {
        for (const e of multiEntries) {
          await updateEntry(e.id, patch);
        }
        clearSelection?.();
        toast(`Updated ${multiEntries.length} entries`);
        onClose();
      } catch (err) {
        toast(err.message, "error");
        setBusy(false);
      }
      return;
    }

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
        onClose();
      } else {
        await createEntry(payload);
        haptic("light");
        // Show the little success screen instead of closing outright. It carries
        // a snapshot of what was saved so the numbers can't shift under it.
        setSavedInfo({
          groupId,
          isOwned,
          amount: bannerAmount,
          label: bannerLabel,
          passengers: syncedPassengers.length,
          date,
        });
        setDone(true);
        setBusy(false);
      }
    } catch (e) {
      // 8: blocked passenger removal comes back with a clear message.
      toast(e.message, "error");
      setBusy(false);
    }
  }

  // Whether a given step's own must-have is satisfied. Used both to gate Next
  // and to decide if you can jump forward to a later step.
  function stepValid(k) {
    if (k === 1) return Boolean(groupId);
    if (k === 2) return parseNum(primaryValue) > 0;
    if (k === 3) return isOwned || syncedPassengers.length > 0;
    return true; // step 4 (Review) has nothing of its own to fill in
  }
  // Can we jump straight to step n? Only if every step before it is filled in.
  function canReach(n) {
    for (let k = 1; k < n; k++) if (!stepValid(k)) return false;
    return true;
  }
  // The nudge shown when a step still needs something before you can pass it.
  function stepMissingMsg(k) {
    if (k === 1) return "Pick a vehicle first.";
    if (k === 2)
      return `Enter a cost, liters or distance for this ${isOwned ? "refuel" : "trip"} first.`;
    if (k === 3) return "Add at least one passenger - a carpool trip can't be solo.";
    return "Fill in the earlier steps first.";
  }
  // Tap a step in the progress bar: go back freely, jump forward only when the
  // earlier steps are filled in - otherwise toast what's still missing.
  function jumpToStep(n) {
    if (n === step) return;
    if (n < step) {
      haptic("selection");
      setStep(n);
      return;
    }
    for (let k = 1; k < n; k++) {
      if (!stepValid(k)) {
        // Point them at the first step that still needs something, and land
        // them on it so they can fix it right away.
        toast(stepMissingMsg(k), "error");
        if (k !== step) setStep(k);
        return;
      }
    }
    haptic("selection");
    setStep(n);
  }

  // Move to the next wizard step, blocking on that step's must-haves so you
  // can't skip past missing data (full validation still runs in save()).
  function goNext() {
    if (step === 1 && !groupId) {
      toast("Pick a vehicle first.", "error");
      return;
    }
    if (step === 2 && !(parseNum(primaryValue) > 0)) {
      toast(`Enter a cost, liters or distance for this ${isOwned ? "refuel" : "trip"}.`, "error");
      return;
    }
    if (step === 3 && !isOwned && syncedPassengers.length === 0) {
      toast("Add at least one passenger - a carpool trip can't be solo.", "error");
      return;
    }
    haptic("light");
    setStep((s) => Math.min(4, s + 1));
  }
  function goBack() {
    setStep((s) => Math.max(1, s - 1));
  }
  // "View trip" on the success screen: close, then open the group it landed in.
  function viewTrip() {
    const gid = savedInfo?.groupId;
    onClose();
    if (gid) openGroup(gid);
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
    setFuelEdited(true);
  };

  // Opened via a tap on a specific card detail/chip: once the form has seeded,
  // scroll that field into view and focus it (see EntryCard tap targets / #6).
  useEffect(() => {
    if (!ready || !focusField) return;
    const idFor = {
      vehicle: "ae-vehicle",
      cost: "ae-cost",
      liters: "ae-liters",
      distance: "ae-distance",
      fuelPrice: "ae-fuelprice",
      efficiency: "ae-efficiency",
      tolls: "ae-tolls",
      date: "ae-date",
      recurrence: "ae-recurrence",
    };
    const id = idFor[focusField];
    if (!id) return;
    const t = setTimeout(() => {
      const anchor = document.getElementById(id);
      if (!anchor) return;
      anchor.scrollIntoView({ behavior: "smooth", block: "center" });
      const control = anchor.matches("input, select, textarea, button")
        ? anchor
        : anchor.querySelector("input, select, textarea, button");
      if (control) {
        control.focus({ preventScroll: true });
        if (typeof control.select === "function") {
          try {
            control.select();
          } catch {
            /* not a text input */
          }
        }
      }
    }, 160);
    return () => clearTimeout(t);
  }, [ready, focusField]);

  return (
    <Sheet
      title={
        multiEdit
          ? `Edit ${multiEntries.length} entries`
          : editing
          ? isOwned ? "Edit refuel" : "Edit trip"
          : duplicating
          ? isOwned ? "Duplicate refuel" : "Duplicate trip"
          : isOwned ? "Add a refuel" : "Add a trip"
      }
      onClose={onClose}
      banner={
        done ? null : multiEdit ? (
          <div className="sheet-banner">
            <span className="sheet-banner__label">
              Editing {multiEntries.length} entries - only the fields you change get applied to all of them.
            </span>
          </div>
        ) : group ? (
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
        done ? (
          <>
            <button className="cta-secondary" type="button" onClick={onClose}>
              Done
            </button>
            {savedInfo?.groupId && (
              <button className="cta-primary btn-block" type="button" onClick={viewTrip}>
                View {savedInfo?.isOwned ? "refuel" : "trip"}
              </button>
            )}
          </>
        ) : (
          <>
            <button
              className="cta-secondary"
              type="button"
              onClick={step > 1 ? goBack : onClose}
            >
              {step > 1 ? "Back" : "Cancel"}
            </button>
            {step < 4 ? (
              <button
                className="cta-primary btn-block"
                type="button"
                onClick={goNext}
                disabled={!groupId}
              >
                Next
              </button>
            ) : (
              <button
                className="cta-primary btn-block"
                type="button"
                onClick={save}
                disabled={busy || !groupId}
              >
                {multiEdit ? "Apply to all" : editing ? "Save changes" : isOwned ? "Save refuel" : "Save trip"}
              </button>
            )}
          </>
        )
      }
    >
      {groups.length === 0 ? (
        <p className="muted">Add a car first, then log a refuel.</p>
      ) : done ? (
        <div className="wizard-done">
          <div className="wizard-done__icon">
            <Check size={34} />
          </div>
          <h3 className="wizard-done__title">
            {savedInfo?.isOwned ? "Refuel added!" : "Trip added!"}
          </h3>
          <p className="wizard-done__sub">It's saved and your balances are up to date.</p>
          <div className="wizard-done__summary">
            <div className="review-row">
              <span>{savedInfo?.label}</span>
              <strong className={savedInfo?.isOwned ? "pos" : "neg"}>
                {formatMoney(savedInfo?.amount || 0)}
              </strong>
            </div>
            <div className="review-row">
              <span>Passengers</span>
              <strong>{savedInfo?.passengers || 0}</strong>
            </div>
            <div className="review-row">
              <span>Date</span>
              <strong>{formatDate(savedInfo?.date)}</strong>
            </div>
          </div>
        </div>
      ) : (
        <div className="field-grid">
          {/* Step progress - tap a finished step to go back, or jump forward to
              any step whose earlier steps are already filled in. */}
          <div className="wizard-steps">
            {STEP_TITLES.map((label, i) => {
              const n = i + 1;
              const state = n === step ? "is-active" : n < step ? "is-done" : "is-todo";
              const reachable = n < step || (n > step && canReach(n));
              return (
                <button
                  key={label}
                  type="button"
                  className={"wizard-step " + state + (reachable ? " is-reachable" : "")}
                  onClick={() => jumpToStep(n)}
                >
                  <span className="wizard-step__dot">{n < step ? <Check size={12} /> : n}</span>
                  <span className="wizard-step__label">{label}</span>
                </button>
              );
            })}
          </div>

          {/* Step 1 - Details: when, what, and which vehicle */}
          {step === 1 && (
            <>
              <div className="field-inline">
                <Field
                  label={<>Date{isFutureDate(date) && <InfoTip term="upcoming" />}</>}
                  hint={
                    isFutureDate(date)
                      ? `Scheduled ${isOwned ? "refuel" : "trip"} - it won't count toward balances or spend until this date.`
                      : undefined
                  }
                >
                  <span id="ae-date" style={{ display: "block" }}>
                    <DatePicker value={date} onChange={setDate} />
                  </span>
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

              <Field
                label={<>Repeats <InfoTip term="recurring" /></>}
                hint={
                  recurrence !== "none"
                    ? `Auto-schedules the next ${isOwned ? "refuel" : "trip"} as upcoming; when it passes, the next one is scheduled.`
                    : `A one-off ${isOwned ? "refuel" : "trip"}. Pick a schedule to repeat it automatically.`
                }
              >
                <span id="ae-recurrence" style={{ display: "block" }}>
                  <Select value={recurrence} onChange={setRecurrence} options={RECURRENCE_OPTIONS} />
                </span>
              </Field>

              <Field
                label={
                  <span id="ae-vehicle">
                    Which car / carpool? <InfoTip term="ownVsCarpool" />
                  </span>
                }
              >
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
            </>
          )}

          {/* Step 2 - Fuel: price + the four figures that derive each other */}
          {step === 2 && (
            <>
          <Field label="Fuel price (RM/L)">
            <input
              id="ae-fuelprice"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={fuelPrice}
              onChange={(e) => {
                setFuelPrice(e.target.value);
                setFuelEdited(true);
              }}
            />
          </Field>
          
         
          <div className="derive-preview derive-preview--editable">
            <EditCell
              inputId="ae-cost"
              label="Cost"
              prefix="RM"
              value={cellValue("cost")}
              onChange={editField("cost")}
              active={primaryField === "cost"}
            />
            <EditCell
              inputId="ae-liters"
              label="Liters"
              suffix="L"
              value={cellValue("liters")}
              onChange={editField("liters")}
              active={primaryField === "liters"}
            />
            <EditCell
              inputId="ae-distance"
              label="Distance"
              suffix="km"
              value={cellValue("distance")}
              onChange={editField("distance")}
              active={primaryField === "distance"}
            />
            <EditCell
              inputId="ae-efficiency"
              label="Fuel Efficiency"
              suffix="km/L"
              value={kmplInput}
              onChange={(v) => {
                setKmplInput(v);
                // Only a positive value counts as a measured reading; clearing
                // the field falls back to the car's estimate, prevent from plotting a fake trend point.
                setKmplTouched(parseNum(v) > 0);
                setFuelEdited(true);
              }}
              accent={kmplTouched}
            />
          </div>
           <p className="field-hint" style={{ margin: "0 0 -0.2rem" }}>
            Tap any figure to edit it - the others update automatically.
          </p>
          {/* #6: optionally fill Distance from a start -> end route lookup. */}
          <RouteDistanceField onDistance={(km) => editField("distance")(String(km))} />
            </>
          )}

          {/* Step 3 - Split: method, driver-comp extras, and who's riding */}
          {step === 3 && (
            <>
          {group && (
            <Field
              label={
                <>
                  How to split{" "}
                  <InfoTip
                    term={isDistance ? "distanceSplit" : isDriverComp ? "customSplit" : "equalSplit"}
                  />
                </>
              }
              hint={splitMethodHint(splitMethod, { isOwned })}
            >
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
                  id="ae-tolls"
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
              <Field label={<>Maint. % <InfoTip term="maintenanceMarkup" /></>}>
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

              {isDriverComp && overCollectAmount > 0.005 && (
                <div className="field-hint" style={{ color: "var(--tier-intermediate)" }}>
                  {isOwned
                    ? `Fixed amounts exceed this refuel's cost by ${formatMoney(overCollectAmount)} - you'll collect more than you spent.`
                    : `Fixed amounts exceed this trip's fuel cost by ${formatMoney(overCollectAmount)} - the passengers would pay more than it actually cost.`}
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

            </>
          )}

          {/* Step 4 - Review before saving */}
          {step === 4 && (
            <div className="wizard-review">
              <div className="wizard-review__card">
                <div className="review-row">
                  <span>{isOwned ? "Vehicle" : "Carpool"}</span>
                  <strong>{group?.name || "-"}</strong>
                </div>
                <div className="review-row">
                  <span>Date</span>
                  <strong>
                    {formatDate(date)}
                    {isFutureDate(date) ? " · upcoming" : ""}
                  </strong>
                </div>
                {title.trim() && (
                  <div className="review-row">
                    <span>Title</span>
                    <strong>{title.trim()}</strong>
                  </div>
                )}
                <div className="review-row">
                  <span>Repeats</span>
                  <strong>{recurrence !== "none" ? recurrenceLabel(recurrence) : "One-off"}</strong>
                </div>
                <div className="wizard-review__facts">
                  <div className="review-fact">
                    <span className="review-fact__label">Cost</span>
                    <span className="review-fact__value">{formatMoney(totals.totalCost)}</span>
                  </div>
                  <div className="review-fact">
                    <span className="review-fact__label">Distance</span>
                    <span className="review-fact__value">{formatKm(totals.totalDistance)}</span>
                  </div>
                  <div className="review-fact">
                    <span className="review-fact__label">Fuel</span>
                    <span className="review-fact__value">{formatLiters(totals.totalLiters)}</span>
                  </div>
                  <div className="review-fact">
                    <span className="review-fact__label">Price</span>
                    <span className="review-fact__value">{formatMoney(totals.fuelPricePerLiter)}/L</span>
                  </div>
                </div>
                <div className="review-row">
                  <span>Split</span>
                  <strong>
                    {SPLIT_METHOD_OPTIONS.find((o) => o.value === splitMethod)?.label || splitMethod}
                  </strong>
                </div>
                {syncedPassengers.length > 0 && (
                  <div className="review-row review-row--wrap">
                    <span>Passengers</span>
                    <strong>{syncedPassengers.map((p) => whoName(p.who, peopleMap)).join(", ")}</strong>
                  </div>
                )}
              </div>
              <div className="wizard-review__total">
                <span>{bannerLabel}</span>
                <strong className={isOwned ? "pos" : "neg"}>{formatMoney(bannerAmount)}</strong>
              </div>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

/* An editable cell in the fuel card. `active` = this is the field currently
   driving the derivation; `accent` = it's a manually-set (measured) value. */
function EditCell({ label, value, onChange, prefix, suffix, accent, active, inputId }) {
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
          id={inputId}
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

// Wizard step labels, in order. Index 0 = step 1.
const STEP_TITLES = ["Details", "Fuel", "Split", "Review"];

// Which wizard step holds a given focus target, so opening the sheet focused on
// (say) the distance figure lands straight on the Fuel step.
function stepForFocus(focusField) {
  if (["cost", "liters", "distance", "fuelPrice", "efficiency"].includes(focusField)) return 2;
  if (focusField === "tolls") return 3;
  return 1; // vehicle, date, recurrence, or nothing in particular
}
