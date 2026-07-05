/* CarPawl calculation engine
   Pure functions only: given plain entry/payment/group objects, return numbers.
   Fuel/efficiency math stays unrounded (round only at display). The one
   exception is passenger shares: money owed is rounded to whole cents so you
   can never be asked to collect a fraction of a cent, and so paying the amount
   shown always settles a passenger to exactly zero (see entryShares below).
   Getting these right is the whole point of the app, nyaw!

   distance is km; efficiency is km/L. */

import { whoEquals, whoKey, isMe } from "./identity.js";

/* ------------------------------------------------------------------ *
 * Fuel math (per entry)
 *
 * The form supplies exactly one primary value of {cost, liters, distance}.
 * The other two are derived from the group's kmPerLiter and the entry's fuel
 * price. If the user ALSO gives the optional "second real value", both liters
 * and distance are measured independently and don't derive one from the
 * other (hasMeasuredEfficiency = true).
 * ------------------------------------------------------------------ */

/**
 * Derive the full {totalCost, totalLiters, totalDistance, hasMeasuredEfficiency}
 * from a primary input and an optional measured second value.
 *
 * @param {Object} opts
 * @param {'cost'|'liters'|'distance'} opts.primaryField
 * @param {number} opts.primaryValue
 * @param {number} opts.pricePerLiter  MYR/L in effect for this entry
 * @param {number} opts.kmPerLiter     group.defaultKmPerLiter
 * @param {number|null} [opts.measuredLiters]    optional real liters
 * @param {number|null} [opts.measuredDistance]  optional real distance (km)
 */
export function deriveEntryTotals({
  primaryField,
  primaryValue,
  pricePerLiter,
  kmPerLiter,
  measuredLiters = null,
  measuredDistance = null,
}) {
  const p = Number(primaryValue) || 0;
  const price = Number(pricePerLiter) || 0;
  const kmpl = Number(kmPerLiter) || 0;

  let cost = 0;
  let liters = 0;
  let distance = 0;

  if (primaryField === "cost") {
    cost = p;
    liters = price > 0 ? cost / price : 0;
    distance = liters * kmpl;
  } else if (primaryField === "liters") {
    liters = p;
    cost = liters * price;
    distance = liters * kmpl;
  } else if (primaryField === "distance") {
    distance = p;
    liters = kmpl > 0 ? distance / kmpl : 0;
    cost = liters * price;
  }

  // Optional second real value: if supplied, override the derived counterpart
  // with the measured one so efficiency = distance/liters is the real reading.
  let hasMeasuredEfficiency = false;
  const ml = measuredLiters == null ? null : Number(measuredLiters);
  const md = measuredDistance == null ? null : Number(measuredDistance);

  if (primaryField === "cost" || primaryField === "liters") {
    // primary gives liters; optional second value is real distance
    if (md != null && md > 0) {
      distance = md;
      hasMeasuredEfficiency = liters > 0;
    }
  }
  if (primaryField === "distance") {
    // primary gives distance; optional second value is real liters
    if (ml != null && ml > 0) {
      liters = ml;
      cost = liters * price; // cost follows the real liters
      hasMeasuredEfficiency = distance > 0;
    }
  }
  // If liters was the primary AND a real liters was also passed (shouldn't be),
  // ignore - liters is already real. Same guard for distance primary.

  return {
    totalCost: cost,
    totalLiters: liters,
    totalDistance: distance,
    fuelPricePerLiter: price,
    hasMeasuredEfficiency,
  };
}

/** Measured efficiency for an entry (km/L), or null when not measured. */
export function entryEfficiency(entry) {
  if (!entry.hasMeasuredEfficiency) return null;
  if (!entry.totalLiters) return null;
  return entry.totalDistance / entry.totalLiters;
}

/** Efficiency to DISPLAY: always show a km/L value. For unmeasured
 *  entries this is the setup estimate (distance/liters equals the default km/L was used to derive them).
 * `estimated` flags already measured entries. */
export function entryEfficiencyDisplay(entry) {
  if (!entry.totalLiters) return { value: null, estimated: true };
  return {
    value: entry.totalDistance / entry.totalLiters,
    estimated: !entry.hasMeasuredEfficiency,
  };
}

/* ------------------------------------------------------------------ *
 * Split methods (per-entry; default 'distance' for legacy entries).
 *
 * Shares are rounded to whole cents - you can't collect a fraction of a cent.
 * Rounding is largest-remainder across the whole entry (entryShares), so the
 * per-passenger shares always sum back to the exact billable total AND paying
 * the amount shown always settles a passenger to zero.
 *
 *   'distance'    share = (distanceAssigned / totalDistance) * totalCost.
 *                 Untagged distance is the owner's own driving, never billed.
 *
 *   'equal'       totalCost split equally among that entry's passengers.
 *
 *   'driver_comp' ("Custom"): passengers cover the driver's costs.
 *      - base = (fuel + parking) * (1 + maintenance%). Tolls are NOT marked
 *        up - they pass through at face value.
 *      - a passenger with manualOverride pays exactly that fixed amount, and
 *        the override REDUCES the pool the others split (subtractive):
 *        base pool = max(0, base - sum(overrides)).
 *      - that base pool splits BY DISTANCE among the non-overridden passengers.
 *      - tolls split EQUALLY among the non-overridden passengers who were
 *        present for them (entry.tollsPresentWho; null = everyone).
 * ------------------------------------------------------------------ */
export const SPLIT_METHODS = ["distance", "equal", "driver_comp"];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function splitMethodOf(entry) {
  return entry.splitMethod || "distance";
}

/** Marked-up base (fuel+parking only - tolls pass through separately). */
export function driverCompBase(entry) {
  const fuel = Number(entry.totalCost) || 0;
  const parking = Number(entry.parking) || 0;
  const maint = Number(entry.maintenancePct) || 0;
  return (fuel + parking) * (1 + maint / 100);
}

/** Tolls pass through at face value - no maintenance markup. */
export function tollsTotal(entry) {
  return Number(entry.tolls) || 0;
}

/** Was this passenger present for the trip's tolls? Missing tollsPresentWho
 *  means "everyone was" (keeps old entries and other methods unchanged). */
export function isPresentForTolls(entry, who) {
  if (!entry.tollsPresentWho) return true;
  return entry.tollsPresentWho.some((w) => whoEquals(w, who));
}

/** Round raw shares to whole cents so they sum EXACTLY to the rounded total.
 *  Largest-remainder: any leftover cents go to the biggest fractional parts. */
function roundSharesToCents(raw) {
  if (!raw.length) return [];
  const cents = raw.map((r) => (Number(r) || 0) * 100);
  const floored = cents.map((c) => Math.floor(c));
  const target = Math.round(cents.reduce((a, b) => a + b, 0));
  let leftover = target - floored.reduce((a, b) => a + b, 0);
  const byFrac = cents
    .map((c, i) => ({ i, frac: c - Math.floor(c) }))
    .sort((a, b) => b.frac - a.frac);
  const out = floored.slice();
  for (let k = 0; leftover > 0; k++, leftover--) {
    out[byFrac[k % byFrac.length].i] += 1;
  }
  return out.map((c) => c / 100);
}

/** Raw (pre-rounding) share for one passenger row. */
function rawShareOfRow(entry, row) {
  const pax = entry.passengers || [];
  const method = splitMethodOf(entry);
  if (method === "equal") {
    return pax.length ? (Number(entry.totalCost) || 0) / pax.length : 0;
  }
  if (method === "driver_comp") {
    return customRawShare(entry, row);
  }
  // distance
  if (!entry.totalDistance) return 0;
  return ((Number(row.distanceAssigned) || 0) / entry.totalDistance) * (Number(entry.totalCost) || 0);
}

/** 'driver_comp' raw math for a NON-overridden row (overrides are handled in
 *  entryShares). Subtractive: overrides shrink the base pool the rest split. */
function customRawShare(entry, row) {
  const pax = entry.passengers || [];
  const overrideSum = pax.reduce(
    (s, p) => (p.manualOverride != null ? s + (Number(p.manualOverride) || 0) : s),
    0
  );
  const basePool = Math.max(0, driverCompBase(entry) - overrideSum);

  const remaining = pax.filter((p) => p.manualOverride == null);
  const remainingDist = remaining.reduce((s, p) => s + (Number(p.distanceAssigned) || 0), 0);
  const baseShare =
    remainingDist > 0
      ? ((Number(row.distanceAssigned) || 0) / remainingDist) * basePool
      : remaining.length
      ? basePool / remaining.length // no distance data - fall back to equal
      : 0;

  const presentRemaining = remaining.filter((p) => isPresentForTolls(entry, p.who));
  const tollShare =
    isPresentForTolls(entry, row.who) && presentRemaining.length
      ? tollsTotal(entry) / presentRemaining.length
      : 0;

  return baseShare + tollShare;
}

/** Every passenger's cent-rounded share, parallel to entry.passengers.
 *  Overridden rows (custom method) pay their exact fixed amount; the rest are
 *  largest-remainder rounded so the whole entry sums to the exact total. */
export function entryShares(entry) {
  const pax = entry.passengers || [];
  const method = splitMethodOf(entry);
  const values = new Array(pax.length).fill(0);
  const autoIdx = [];
  const autoRaw = [];
  pax.forEach((p, i) => {
    if (method === "driver_comp" && p.manualOverride != null) {
      values[i] = round2(Number(p.manualOverride) || 0);
    } else {
      autoIdx.push(i);
      autoRaw.push(rawShareOfRow(entry, p));
    }
  });
  const rounded = roundSharesToCents(autoRaw);
  autoIdx.forEach((idx, k) => {
    values[idx] = rounded[k];
  });
  return values;
}

/* Passenger share, method-aware and cent-rounded. */
export function share(entry, who) {
  const pax = entry.passengers || [];
  const idx = pax.findIndex((p) => whoEquals(p.who, who));
  if (idx < 0) return 0;
  return entryShares(entry)[idx];
}

/** Share for a passenger row directly (matched by `who`). */
export function shareOfRow(entry, passengerRow) {
  return share(entry, passengerRow.who);
}

/** Total billed to all passengers for an entry (sum of shares). For distance
 *  this can be less than totalCost (owner's untagged driving is excluded).
 *  With { excludeMe }, drops your own share (what's actually collectible in
 *  your own vehicle). */
export function entryTotalBillable(entry, { excludeMe = false } = {}) {
  const pax = entry.passengers || [];
  const shares = entryShares(entry);
  return pax.reduce(
    (sum, p, i) => (excludeMe && isMe(p.who) ? sum : sum + shares[i]),
    0
  );
}

/** What you'll collect from an entry given whether it's your own vehicle. In
 *  your own vehicle, your own share isn't collectible; in a carpool you're a
 *  passenger, it's your own share you owe the driver. */
export function entryCollectible(entry, { ownedByMe = false } = {}) {
  return entryTotalBillable(entry, { excludeMe: ownedByMe });
}

/** Total collected from all passengers on an entry (all payments on it). */
export function entryTotalPaid(entry, payments) {
  return (payments || [])
    .filter((pm) => pm.entryId === entry.id)
    .reduce((sum, pm) => sum + (Number(pm.amount) || 0), 0);
}

/** Sum of payments for a given who against a given entry. */
export function paymentsFor(entry, who, payments) {
  return (payments || [])
    .filter((pm) => pm.entryId === entry.id && whoEquals(pm.who, who))
    .reduce((sum, pm) => sum + (Number(pm.amount) || 0), 0);
}

/* ------------------------------------------------------------------ *
 * Per-entry-passenger outstanding
 *   outstanding = share - sum payments(who, entry)
 * Can go negative (overpayment / credit).
 * ------------------------------------------------------------------ */
export function outstanding(entry, who, payments) {
  return share(entry, who) - paymentsFor(entry, who, payments);
}

/** Status label for a (entry, who) pair. */
export function statusOf(entry, who, payments) {
  const s = share(entry, who);
  const out = outstanding(entry, who, payments);
  // tolerate floating point dust
  const EPS = 0.005;
  if (out < -EPS) return "credit";
  if (Math.abs(out) <= EPS) return "paid";
  if (out >= s - EPS) return "unpaid";
  return "partial";
}

/* ------------------------------------------------------------------ *
 * Balance per passenger, per group
 *   owed   = sum outstanding(entry, who) over entries where outstanding > 0
 *   credit = sum |outstanding(entry, who)| over entries where outstanding < 0
 * Never netted together.
 * ------------------------------------------------------------------ */
export function balanceForWho(groupEntries, who, payments) {
  // Ignore sub-cent dust so a fully-paid entry never leaves a phantom balance.
  const EPS = 0.005;
  let owed = 0;
  let credit = 0;
  for (const entry of groupEntries) {
    const out = outstanding(entry, who, payments);
    if (out > EPS) owed += out;
    else if (out < -EPS) credit += Math.abs(out);
  }
  return { owed, credit };
}

/**
 * Every distinct passenger appearing across a group's entries, each with their
 * cumulative {owed, credit} balance. Used by Group Detail.
 * @returns {Array<{ who, owed, credit }>}
 */
export function groupBalances(groupEntries, payments, { excludeMe = false } = {}) {
  const map = new Map();
  for (const entry of groupEntries) {
    for (const p of entry.passengers || []) {
      // In your own vehicle, "Me" is tracked for reference but never owed to
      // you, so it's excluded from the owed/credit balances.
      if (excludeMe && isMe(p.who)) continue;
      const key = whoKey(p.who);
      if (!map.has(key)) map.set(key, { who: p.who });
    }
  }
  const rows = [];
  for (const { who } of map.values()) {
    const { owed, credit } = balanceForWho(groupEntries, who, payments);
    rows.push({ who, owed, credit });
  }
  return rows;
}

/* ------------------------------------------------------------------ *
 * 4.5 Dashboard headline totals
 * ------------------------------------------------------------------ */

/** Total owed TO you: sum of owed() for every passenger across all owned groups.
 *  Credits are ignored (they never reduce this number). */
export function totalOwedToYou(ownedGroups, entriesByGroup, payments) {
  let total = 0;
  for (const g of ownedGroups) {
    const entries = entriesByGroup[g.id] || [];
    // "Me" is never owed to you in your own vehicle.
    for (const row of groupBalances(entries, payments, { excludeMe: true })) {
      total += row.owed;
    }
  }
  return total;
}

/** Total YOU owe: your own outstanding share as a passenger across non-owned
 *  groups. Your personal credits don't reduce it. */
export function totalYouOwe(nonOwnedGroups, entriesByGroup, payments) {
  let total = 0;
  for (const g of nonOwnedGroups) {
    const entries = entriesByGroup[g.id] || [];
    const { owed } = balanceForWho(entries, { type: "me" }, payments);
    total += owed;
  }
  return total;
}

/* ------------------------------------------------------------------ *
 * Date helpers for month bucketing. All dates are ISO 'YYYY-MM-DD' (or full
 * ISO); compare by year+month in local time.
 * ------------------------------------------------------------------ */
export function ymOf(dateStr) {
  const d = new Date(dateStr);
  return { y: d.getFullYear(), m: d.getMonth() };
}
export function isSameMonth(dateStr, ref = new Date()) {
  const a = ymOf(dateStr);
  return a.y === ref.getFullYear() && a.m === ref.getMonth();
}

/* ------------------------------------------------------------------ *
 * Total fuel consumption this month (owned groups only, by entry date)
 *   sum totalCost, sum totalLiters
 * ------------------------------------------------------------------ */
export function thisMonthConsumption({ ownedGroups, entriesByGroup, ref = new Date() }) {
  let cost = 0;
  let liters = 0;
  for (const g of ownedGroups) {
    for (const e of entriesByGroup[g.id] || []) {
      if (isSameMonth(e.date, ref)) {
        cost += Number(e.totalCost) || 0;
        liters += Number(e.totalLiters) || 0;
      }
    }
  }
  return { cost, liters };
}

/* ------------------------------------------------------------------ *
 * Fuel efficiency trend (per group)
 *   Last 30 days, only entries with hasMeasuredEfficiency = true.
 *   Point = { date, efficiency }. Skip unmeasured entries entirely.
 * ------------------------------------------------------------------ */
export function efficiencyTrend(groupEntries, { days = 30, ref = new Date() } = {}) {
  const cutoff = new Date(ref);
  cutoff.setDate(cutoff.getDate() - days);
  return (groupEntries || [])
    .filter((e) => e.hasMeasuredEfficiency && e.totalLiters > 0)
    .filter((e) => new Date(e.date) >= cutoff)
    .map((e) => ({
      date: e.date,
      efficiency: e.totalDistance / e.totalLiters,
      title: e.title || null,
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

/* ------------------------------------------------------------------ *
 * Distance-tagging helper: distance driven that is NOT billed to anyone
 * (the owner's own driving).
 * ------------------------------------------------------------------ */
export function unbilledDistance(entry) {
  const tagged = (entry.passengers || []).reduce(
    (s, p) => s + (Number(p.distanceAssigned) || 0),
    0
  );
  // Note: passengers can overlap the same distance (each rides some of it), so
  // this is a rough "max passenger reach vs total" indicator, not a strict
  // subtraction. Billing itself is per-passenger via share().
  return Math.max(0, entry.totalDistance - tagged);
}
