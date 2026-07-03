/* CarPawl calculation engine - build spec §4.
   Pure functions only: given plain entry/payment/group objects, return numbers.
   No DB access, no rounding baked into the math (round only at display time via
   src/lib/format.js). Getting these right is the whole point of the app, so the
   formulas mirror the spec line-for-line.

   Money is MYR; distance is km; efficiency is km/L. */

import { whoEquals, whoKey, isMe } from "./identity.js";

/* ------------------------------------------------------------------ *
 * 4.1 Fuel math (per entry)
 *
 * The form supplies exactly one primary value of {cost, liters, distance}.
 * The other two are derived from the group's kmPerLiter and the entry's fuel
 * price. If the user ALSO gives the optional "second real value", both liters
 * and distance are measured independently and we don't derive one from the
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
  // with the measured one so efficiency = distance/liters is a real reading.
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

/* ------------------------------------------------------------------ *
 * Split methods (per-fill-up; default 'distance' for legacy entries):
 *   'distance'    share = (distanceAssigned / totalDistance) * totalCost.
 *                 Untagged distance is the owner's own driving, never billed.
 *   'equal'       fuel cost split equally among that trip's riders.
 *                 share = totalCost / numPassengers (owner not charged).
 *   'driver_comp' passengers fully compensate the driver: the base is
 *                 (fuel + tolls + parking) * (1 + maintenance%), split equally.
 *                 share = base / numPassengers (owner pays nothing).
 * ------------------------------------------------------------------ */
export const SPLIT_METHODS = ["distance", "equal", "driver_comp"];

export function splitMethodOf(entry) {
  return entry.splitMethod || "distance";
}

/** The total amount billed to passengers for driver-comp (fuel+tolls+parking+maint). */
export function driverCompBase(entry) {
  const fuel = Number(entry.totalCost) || 0;
  const tolls = Number(entry.tolls) || 0;
  const parking = Number(entry.parking) || 0;
  const maint = Number(entry.maintenancePct) || 0;
  return (fuel + tolls + parking) * (1 + maint / 100);
}

/* 4.2 Passenger share — method-aware. */
export function share(entry, who) {
  const pax = entry.passengers || [];
  const p = pax.find((x) => whoEquals(x.who, who));
  if (!p) return 0;
  return shareOfRow(entry, p);
}

/** Share for a passenger row directly (when you already have the row). */
export function shareOfRow(entry, passengerRow) {
  const pax = entry.passengers || [];
  const method = splitMethodOf(entry);
  if (method === "equal") {
    return pax.length ? (Number(entry.totalCost) || 0) / pax.length : 0;
  }
  if (method === "driver_comp") {
    return pax.length ? driverCompBase(entry) / pax.length : 0;
  }
  // distance
  if (!entry.totalDistance) return 0;
  return (passengerRow.distanceAssigned / entry.totalDistance) * entry.totalCost;
}

/** Total billed to all passengers for an entry (sum of shares). For distance
 *  this can be less than totalCost (owner's untagged driving is excluded). */
export function entryTotalBillable(entry) {
  return (entry.passengers || []).reduce((sum, p) => sum + shareOfRow(entry, p), 0);
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
 * 4.3 Per-entry-passenger outstanding
 *   outstanding = share - Σ payments(who, entry)
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
 * 4.4 Balance per passenger, per group
 *   owed   = Σ outstanding(entry, who) over entries where outstanding > 0
 *   credit = Σ |outstanding(entry, who)| over entries where outstanding < 0
 * Never netted together.
 * ------------------------------------------------------------------ */
export function balanceForWho(groupEntries, who, payments) {
  let owed = 0;
  let credit = 0;
  for (const entry of groupEntries) {
    const out = outstanding(entry, who, payments);
    if (out > 0) owed += out;
    else if (out < 0) credit += Math.abs(out);
  }
  return { owed, credit };
}

/**
 * Every distinct passenger appearing across a group's entries, each with their
 * cumulative {owed, credit} balance. Used by Group Detail.
 * @returns {Array<{ who, owed, credit }>}
 */
export function groupBalances(groupEntries, payments) {
  const map = new Map();
  for (const entry of groupEntries) {
    for (const p of entry.passengers || []) {
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
    for (const row of groupBalances(entries, payments)) {
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
 * ISO); we compare by year+month in local time.
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
 * 4.6 This month's spend (cash-flow, not a balance)
 *   Σ entry.totalCost   (owned groups, entry.date in month)
 * − Σ payment.amount     (received from others in owned groups, payment.date in month)
 * + Σ payment.amount     (paid by me toward my share in non-owned groups, payment.date in month)
 * Note the different date fields per term.
 * ------------------------------------------------------------------ */
export function thisMonthSpend({
  ownedGroups,
  nonOwnedGroups,
  entriesByGroup,
  payments,
  ref = new Date(),
}) {
  const ownedIds = new Set(ownedGroups.map((g) => g.id));
  const nonOwnedIds = new Set(nonOwnedGroups.map((g) => g.id));

  // entry.id -> groupId lookup for payments
  const entryGroup = new Map();
  for (const gid of Object.keys(entriesByGroup)) {
    for (const e of entriesByGroup[gid]) entryGroup.set(e.id, gid);
  }

  let spend = 0;

  // + fuel cost you paid the vendor (bucket by entry date)
  for (const g of ownedGroups) {
    for (const e of entriesByGroup[g.id] || []) {
      if (isSameMonth(e.date, ref)) spend += Number(e.totalCost) || 0;
    }
  }

  for (const pm of payments || []) {
    if (!isSameMonth(pm.date, ref)) continue;
    const gid = entryGroup.get(pm.entryId);
    if (gid == null) continue;
    const amt = Number(pm.amount) || 0;
    if (ownedIds.has(gid) && !isMe(pm.who)) {
      // − money received from other people in your owned groups
      spend -= amt;
    } else if (nonOwnedIds.has(gid) && isMe(pm.who)) {
      // + money you paid toward your own share in groups you don't own
      spend += amt;
    }
  }

  return spend;
}

/* ------------------------------------------------------------------ *
 * 4.7 Total fuel consumption this month (owned groups only, by entry date)
 *   Σ totalCost, Σ totalLiters
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
 * 4.8 Fuel efficiency trend (per group)
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
