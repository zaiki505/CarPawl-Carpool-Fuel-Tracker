/* Rotating-driver carpool ledger (future direction, not yet wired into any
   screen). calc.js's splitting logic assumes a fixed group owner - passengers
   always owe *that one person*. A rotating carpool has no fixed owner: the
   driver changes trip to trip, so what everyone owes has to net out across
   the whole group via a proper multi-way ledger + settle-up optimizer.

   Trip shape this module expects:
     {
       id, date,
       driverWho,       // who fronted the cost this trip - changes trip to trip
       totalCost,
       totalDistance,   // required only for splitMethod 'distance'
       splitMethod,     // 'equal' | 'distance' | 'manual'
       passengers: [{ who, distanceAssigned, manualOverride }],
     }
   `passengers` never includes the driver - matches calc.js's existing
   convention where the payer's own leg is tracked for reference, never billed
   to themselves. */

import { whoKey } from "./identity.js";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Proportional distribution of `total` by `weights` (parallel arrays), each
 *  share rounded to 2dp with the LAST share absorbing whatever rounding
 *  remainder is left so the shares always sum back to `total` exactly. */
function distributeWithRounding(total, weights) {
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (!weights.length) return [];
  if (!totalWeight) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / totalWeight);
  const rounded = raw.map(round2);
  const diff = round2(total - rounded.reduce((s, v) => s + v, 0));
  rounded[rounded.length - 1] = round2(rounded[rounded.length - 1] + diff);
  return rounded;
}

/**
 * Equal split: fuelCost divided evenly across `passengers` only. The driver
 * is NOT counted as one of the divisors - they fronted the cost and are made
 * whole by however much passengers pay back, so if there are 3 passengers
 * each pays totalCost/3 and the driver's own leg costs them nothing extra.
 * (This mirrors calc.js's `shareOfRow` for the 'equal' method today.) If you
 * instead want the driver to also absorb a 1/(n+1) share, pass them as an
 * extra passenger row with no override - this function has no opinion on
 * membership, only on how to divide across whatever list it's given.
 */
export function equalSplit(entry) {
  const pax = entry.passengers || [];
  return distributeWithRounding(Number(entry.totalCost) || 0, pax.map(() => 1));
}

/**
 * Distance-weighted split: proportional to each passenger's distanceAssigned.
 * Falls back to an equal split (and logs a warning) if totalDistance is
 * missing/zero or any passenger lacks a distanceAssigned.
 */
export function distanceSplit(entry) {
  const pax = entry.passengers || [];
  const missing = !entry.totalDistance || pax.some((p) => p.distanceAssigned == null);
  if (missing) {
    console.warn(
      `carpoolLedger.distanceSplit: entry ${entry.id} is missing distance data - falling back to an equal split.`
    );
    return equalSplit(entry);
  }
  return distributeWithRounding(
    Number(entry.totalCost) || 0,
    pax.map((p) => Number(p.distanceAssigned) || 0)
  );
}

const AUTO_SPLIT = { equal: equalSplit, distance: distanceSplit };

/**
 * Per-passenger share for one trip, honoring manual overrides. Overridden
 * passengers pay exactly their override; whatever's left of totalCost is
 * split among the remaining passengers using the trip's splitMethod (an
 * entry-level splitMethod of 'manual' - meaning everyone is expected to be
 * overridden - falls back to equal for any stragglers left without one, so a
 * partially-specified manual trip still resolves to *something* sensible).
 *
 * @returns {Array<{who, amount:number}>} parallel to entry.passengers, in order.
 */
export function computeEntryShares(entry) {
  const pax = entry.passengers || [];
  const overridden = pax.filter((p) => p.manualOverride != null);
  const remaining = pax.filter((p) => p.manualOverride == null);

  const overrideTotal = round2(
    overridden.reduce((sum, p) => sum + (Number(p.manualOverride) || 0), 0)
  );
  const remainingCost = round2((Number(entry.totalCost) || 0) - overrideTotal);

  const splitFn = AUTO_SPLIT[entry.splitMethod] || equalSplit;
  const remainingShares = remaining.length
    ? splitFn({ ...entry, totalCost: remainingCost, passengers: remaining })
    : [];

  const shareByKey = new Map(remaining.map((p, i) => [whoKey(p.who), remainingShares[i]]));
  return pax.map((p) => ({
    who: p.who,
    amount:
      p.manualOverride != null ? round2(Number(p.manualOverride)) : shareByKey.get(whoKey(p.who)),
  }));
}

/**
 * Fold one trip into a running balances map (whoKey -> {who, amountOwed}),
 * returning a NEW map - positive amountOwed means that person owes the group,
 * negative means the group owes them. The driver fronted totalCost, so
 * they're credited by exactly what got collected from passengers this trip;
 * each passenger is debited their share. Keyed by whoKey but keeps the
 * original `who` object alongside the number, so the map round-trips cleanly
 * back to the array shape simplifyDebts expects (see balancesToArray).
 */
export function applyEntryToBalances(balances, entry) {
  const next = new Map(balances);
  const bump = (who, delta) => {
    const key = whoKey(who);
    const prev = next.get(key);
    next.set(key, { who, amountOwed: round2((prev?.amountOwed || 0) + delta) });
  };
  let collected = 0;
  for (const { who, amount } of computeEntryShares(entry)) {
    bump(who, amount);
    collected += amount;
  }
  bump(entry.driverWho, -round2(collected));
  return next;
}

/** Fold a whole trip history into a single balances map (whoKey -> {who, amountOwed}). */
export function computeBalances(entries) {
  return (entries || []).reduce((bal, e) => applyEntryToBalances(bal, e), new Map());
}

/**
 * Minimum-ish settle-up transactions for a group's balances (Splitwise-style
 * greedy optimizer): repeatedly match the largest debtor with the largest
 * creditor. Note this is the practical algorithm real apps use, not a
 * guaranteed global minimum - true minimum-transaction settle-up is NP-hard
 * in general (it's a set-partition-adjacent problem), but greedy matching
 * gets very close and runs in O(n log n).
 *
 * @param {Array<{who, amountOwed:number}>} balances positive = owes the group,
 *   negative = the group owes them.
 * @returns {Array<{from, to, amount:number}>}
 */
export function simplifyDebts(balances) {
  const debtors = [];
  const creditors = [];
  for (const b of balances || []) {
    const amt = round2(b.amountOwed);
    if (amt > 0.005) debtors.push({ who: b.who, amount: amt });
    else if (amt < -0.005) creditors.push({ who: b.who, amount: -amt });
  }
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transactions = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = round2(Math.min(debtors[i].amount, creditors[j].amount));
    if (pay > 0.005) {
      transactions.push({ from: debtors[i].who, to: creditors[j].who, amount: pay });
    }
    debtors[i].amount = round2(debtors[i].amount - pay);
    creditors[j].amount = round2(creditors[j].amount - pay);
    if (debtors[i].amount <= 0.005) i += 1;
    if (creditors[j].amount <= 0.005) j += 1;
  }
  return transactions;
}

/** Convenience: a balances Map -> the [{who, amountOwed}] array simplifyDebts wants. */
export function balancesToArray(balances) {
  return [...balances.values()];
}
