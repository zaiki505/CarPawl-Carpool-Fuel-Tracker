/* CarPawl calculation engine
   Pure functions only: given plain entry/payment/group objects, return numbers.
   Fuel/efficiency math stays unrounded (round only at display). The one
   exception is passenger shares: money owed is rounded to whole cents so you
   can never be asked to collect a fraction of a cent, and so paying the amount
   shown always settles a passenger to exactly zero (see entryShares below).
   Getting these right is the whole point of the app, nyaw!

   distance is km; efficiency is km/L. */

import { whoEquals, whoKey, isMe, ME, person } from "./identity.js";
import { parseISODate, isFutureDate } from "./format.js";

/* ------------------------------------------------------------------ *
 * Covered payer
 *
 * The one who paid the pump and is never billed for the maintenance markup:
 * "me" on my own car, the owner on a carpool. It's derived from the GROUP, but
 * the split math only ever sees an ENTRY - so entries are stamped with
 * `coveredWho` before any calc runs.
 *
 * This lives here, in the pure lib, because BOTH sides must stamp identically:
 * the read side (db/hooks) and the write side (db/actions' credit validation +
 * reconcile). When only one side stamped, the UI and the ledger priced the same
 * driver-comp trip differently, which broke applying credit and silently
 * reversed valid applications.
 * ------------------------------------------------------------------ */

/** The who that a group's covered payer is, or null if it can't be determined. */
export function coveredWhoForGroup(group) {
  if (!group) return null;
  return group.ownerType === "me"
    ? ME
    : group.ownerPersonId
    ? person(group.ownerPersonId)
    : null;
}

/** Stamp an entry with its group's covered payer, ready for the split math. */
export function withCoveredWho(entry, group) {
  return entry ? { ...entry, coveredWho: coveredWhoForGroup(group) } : entry;
}

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
 *  entryShares). Subtractive: overrides shrink the pools the rest split.
 *
 *  Two pools (v0.2.9):
 *   - fuel + parking ("unmarked") and tolls are shared by EVERYONE on the trip,
 *     the covered payer (own car: you; carpool: the owner) included - they rode
 *     too, so they carry their own seat.
 *   - the maintenance markup is compensation FOR the covered payer, so it's
 *     borne entirely by the riders; the covered payer pays none of it.
 *  `coveredWho` is attached to the entry at read time (see db/hooks enrichment).
 *  Absent on raw/legacy objects, in which case nobody is treated as covered and
 *  this reduces to the old single-pool split. */
function customRawShare(entry, row) {
  const pax = entry.passengers || [];
  const coveredWho = entry.coveredWho || null;
  const isCovered = (p) => coveredWho != null && whoEquals(p.who, coveredWho);

  const unmarked = (Number(entry.totalCost) || 0) + (Number(entry.parking) || 0);
  const markup = unmarked * ((Number(entry.maintenancePct) || 0) / 100);
  const fullBase = unmarked + markup; // == driverCompBase(entry)

  // Fixed amounts are paid as-is and shrink what's left to split, taken
  // proportionally out of both pools so the entry still totals the same.
  const overrideSum = pax.reduce(
    (s, p) => (p.manualOverride != null ? s + (Number(p.manualOverride) || 0) : s),
    0
  );
  const scale = fullBase > 0 ? Math.max(0, fullBase - overrideSum) / fullBase : 0;
  const unmarkedPool = unmarked * scale;
  const markupPool = markup * scale;

  const remaining = pax.filter((p) => p.manualOverride == null);
  const riders = remaining.filter((p) => !isCovered(p));

  // Split the leftover 'equal' (default) or by distance. Distance mode with no
  // distances recorded falls back to equal, matching legacy entries.
  const distMode = (entry.customRemainderSplit || "equal") === "distance";
  const distTotal = remaining.reduce((s, p) => s + (Number(p.distanceAssigned) || 0), 0);
  const useEqual = !distMode || distTotal <= 0;
  const weight = (p) => (useEqual ? 1 : Number(p.distanceAssigned) || 0);

  const rowWeight = weight(row);
  const allWeight = remaining.reduce((s, p) => s + weight(p), 0);
  const riderWeight = riders.reduce((s, p) => s + weight(p), 0);

  const unmarkedShare = allWeight > 0 ? unmarkedPool * (rowWeight / allWeight) : 0;
  const markupShare =
    isCovered(row) || riderWeight <= 0 ? 0 : markupPool * (rowWeight / riderWeight);

  const presentRemaining = remaining.filter((p) => isPresentForTolls(entry, p.who));
  const tollShare =
    isPresentForTolls(entry, row.who) && presentRemaining.length
      ? tollsTotal(entry) / presentRemaining.length
      : 0;

  return unmarkedShare + markupShare + tollShare;
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

/** Sum of payments for a given who against a given entry.
 *  A payment's own `date` is never checked against isFutureDate - what gates
 *  whether it counts is the ENTRY's date. balanceForWho skips future entries
 *  wholesale, so a payment recorded IN ADVANCE against an upcoming refuel is
 *  held out of the live balances (along with that refuel's shares) until the
 *  refuel date arrives, then nets out. This is how "prepay an upcoming refuel"
 *  works (see EntryCard's Prepay button and GroupDetail's payableEntriesFor). */
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
export function outstanding(entry, who, payments, applications = []) {
  return (
    share(entry, who) -
    paymentsFor(entry, who, payments) -
    appliedCreditTo(entry.id, who, applications)
  );
}

/** Status label for a (entry, who) pair. */
export function statusOf(entry, who, payments, applications = []) {
  const s = share(entry, who);
  const out = outstanding(entry, who, payments, applications);
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
export function balanceForWho(groupEntries, who, payments, { ref = new Date(), applications = [] } = {}) {
  // Ignore sub-cent dust so a fully-paid entry never leaves a phantom balance.
  const EPS = 0.005;
  let owed = 0;
  let grossCredit = 0;
  for (const entry of groupEntries) {
    if (isFutureDate(entry.date, ref)) continue;
    // `owed` already reflects any credit applied against this entry (via
    // outstanding). `grossCredit` is the raw overpayment before offsetting.
    const out = outstanding(entry, who, payments, applications);
    if (out > EPS) owed += out;
    const over = paymentsFor(entry, who, payments) - share(entry, who);
    if (over > EPS) grossCredit += over;
  }
  // Credit already applied to debts in this set is "spent" - what's left is what
  // the person can still offset with (or hold). So credit shown = available.
  const entryIds = new Set(groupEntries.map((e) => e.id));
  const applied = activeApplications(applications)
    .filter((a) => entryIds.has(a.targetEntryId) && whoEquals(a.debtorWho, who))
    .reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const credit = Math.max(0, grossCredit - applied);
  return { owed, credit };
}

/**
 * Every distinct passenger appearing across a group's entries, each with their
 * cumulative {owed, credit} balance. Used by Group Detail.
 * @returns {Array<{ who, owed, credit }>}
 */
export function groupBalances(
  groupEntries,
  payments,
  { excludeMe = false, excludeWho = null, applications = [] } = {}
) {
  // The vehicle owner (driver who paid) is never owed to themselves - excluded
  // here whether that's "me" (own car) or the carpool's owner person.
  const excludeKey = excludeWho ? whoKey(excludeWho) : null;
  const map = new Map();
  for (const entry of groupEntries) {
    for (const p of entry.passengers || []) {
      if (excludeMe && isMe(p.who)) continue;
      if (excludeKey && whoKey(p.who) === excludeKey) continue;
      const key = whoKey(p.who);
      if (!map.has(key)) map.set(key, { who: p.who });
    }
  }
  const rows = [];
  for (const { who } of map.values()) {
    const { owed, credit } = balanceForWho(groupEntries, who, payments, { applications });
    rows.push({ who, owed, credit });
  }
  return rows;
}

/* ------------------------------------------------------------------ *
 * Credit offset (applying a debtor's overpayment against their debts)
 *
 * Credit is never a stored number - it's the debtor's gross overpayment across
 * the pair's entries, minus what a stored `creditApplications` ledger has
 * already offset. Applications target a specific debt entry; reversing one (soft
 * `reversedAt`) simply drops it from these sums, restoring both sides.
 * ------------------------------------------------------------------ */

/** Active (non-reversed) credit applications. */
export function activeApplications(applications) {
  return (applications || []).filter((a) => !a.reversedAt);
}

/** Credit currently applied against a specific (entry, who) debt. */
export function appliedCreditTo(entryId, who, applications) {
  return activeApplications(applications)
    .filter((a) => a.targetEntryId === entryId && whoEquals(a.debtorWho, who))
    .reduce((s, a) => s + (Number(a.amount) || 0), 0);
}

/**
 * How much of `who`'s credit applied to `entry` would be HANDED BACK if their
 * cash on it totalled `paymentsTotal`. Cash takes priority, so credit that no
 * longer fits the remaining debt is reversed and returned to their pool.
 *
 * Mirrors reconcileCreditForGroup's per-entry rule exactly (whole rows, oldest
 * kept first) so the UI can warn with the real figure BEFORE the write happens.
 * The pool rule isn't mirrored: adding cash can only grow a pool, never shrink
 * it, so it can't newly reverse anything here.
 */
export function creditRefundedByPayment(entry, who, applications, paymentsTotal) {
  const EPS = 0.005;
  const room = share(entry, who) - paymentsTotal;
  const apps = activeApplications(applications)
    .filter((a) => a.targetEntryId === entry.id && whoEquals(a.debtorWho, who))
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "")); // oldest first
  let kept = 0;
  let refunded = 0;
  for (const a of apps) {
    const amt = Number(a.amount) || 0;
    if (amt > room - kept + EPS) refunded += amt; // wouldn't fit -> reversed
    else kept += amt;
  }
  return refunded;
}

/** Gross overpayment (credit) a debtor holds across a set of entries. Raw - it
 *  does NOT subtract applications (those reduce debts, not the source). */
export function creditPoolFor(groupEntries, who, payments, { ref = new Date() } = {}) {
  const EPS = 0.005;
  let pool = 0;
  for (const entry of groupEntries) {
    if (isFutureDate(entry.date, ref)) continue;
    const over = paymentsFor(entry, who, payments) - share(entry, who);
    if (over > EPS) pool += over;
  }
  return pool;
}

/** Sum of a debtor's active applications whose target is in this entry set. */
function appliedTotalFor(groupEntries, who, applications) {
  const ids = new Set(groupEntries.map((e) => e.id));
  return activeApplications(applications)
    .filter((a) => ids.has(a.targetEntryId) && whoEquals(a.debtorWho, who))
    .reduce((s, a) => s + (Number(a.amount) || 0), 0);
}

/** Credit still available to apply for a pair (pool - active applications). */
export function availableCredit(groupEntries, who, payments, applications, { ref = new Date() } = {}) {
  const pool = creditPoolFor(groupEntries, who, payments, { ref });
  return Math.max(0, pool - appliedTotalFor(groupEntries, who, applications));
}

/** A debtor's outstanding debts (post-credit) across a set of entries - the
 *  list the "apply credit" picker offers. Sorted newest-first for display. */
export function outstandingDebtsFor(groupEntries, who, payments, applications, { ref = new Date() } = {}) {
  const EPS = 0.005;
  const out = [];
  for (const entry of groupEntries) {
    if (isFutureDate(entry.date, ref)) continue;
    const amt = outstanding(entry, who, payments, applications);
    if (amt > EPS) out.push({ entry, amount: amt });
  }
  out.sort((a, b) => (parseISODate(b.entry.date) || 0) - (parseISODate(a.entry.date) || 0));
  return out;
}

/** The derived credit-record view (rule 7): who holds it, who it's from, the
 *  original overpayment, the unapplied remainder, and its applications. */
export function creditRecordFor(groupEntries, who, ownerWho, payments, applications, { ref = new Date() } = {}) {
  const original = creditPoolFor(groupEntries, who, payments, { ref });
  const ids = new Set(groupEntries.map((e) => e.id));
  const apps = activeApplications(applications).filter(
    (a) => ids.has(a.targetEntryId) && whoEquals(a.debtorWho, who)
  );
  const appliedTotal = apps.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  return {
    holder: who,
    from: ownerWho,
    original,
    remaining: Math.max(0, original - appliedTotal),
    applications: apps,
  };
}

/* ------------------------------------------------------------------ *
 * 4.5 Dashboard headline totals
 * ------------------------------------------------------------------ */

/** Total owed TO you: sum of owed() for every passenger across all owned groups.
 *  A debt settled by applied credit counts as paid, so `applications` must be
 *  passed or it lingers in this total (#16). Available credit never reduces it. */
export function totalOwedToYou(ownedGroups, entriesByGroup, payments, applications = []) {
  let total = 0;
  for (const g of ownedGroups) {
    const entries = entriesByGroup[g.id] || [];
    // "Me" is never owed to you in your own vehicle.
    for (const row of groupBalances(entries, payments, { excludeMe: true, applications })) {
      total += row.owed;
    }
  }
  return total;
}

/** Total YOU owe: your own outstanding share as a passenger across non-owned
 *  groups. A debt you've settled with credit is excluded (pass `applications`,
 *  #16). Your remaining available credit doesn't reduce it. */
export function totalYouOwe(nonOwnedGroups, entriesByGroup, payments, applications = []) {
  let total = 0;
  for (const g of nonOwnedGroups) {
    const entries = entriesByGroup[g.id] || [];
    const { owed } = balanceForWho(entries, { type: "me" }, payments, { applications });
    total += owed;
  }
  return total;
}

/* ------------------------------------------------------------------ *
 * Date helpers for month bucketing. All dates are ISO 'YYYY-MM-DD' (or full
 * ISO); compare by year+month in local time.
 * ------------------------------------------------------------------ */
export function ymOf(dateStr) {
  const d = parseISODate(dateStr) || new Date(dateStr);
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
      // Upcoming refuels don't count toward spend until their date arrives.
      if (isSameMonth(e.date, ref) && !isFutureDate(e.date, ref)) {
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
    .filter((e) => !isFutureDate(e.date, ref))
    .filter((e) => (parseISODate(e.date) || new Date(e.date)) >= cutoff)
    .map((e) => ({
      date: e.date,
      efficiency: e.totalDistance / e.totalLiters,
      title: e.title || null,
    }))
    .sort((a, b) => (parseISODate(a.date) || 0) - (parseISODate(b.date) || 0));
}
