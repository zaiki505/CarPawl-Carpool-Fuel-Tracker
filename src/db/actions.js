import {
  db,
  newId,
  nowISO,
  getSettings,
  updateSettings,
  ensureSettings,
} from "./db.js";
import { whoEquals, whoKey } from "../lib/identity.js";

/* Write operations + business rules.
   Everything that mutates the DB lives here so the rules (archiving instead of
   deleting when history exists, blocking passenger removal when payments exist,
   cascading entry->payment deletes) live in one place. */

/** Coerce to a number, never negative. The UI already
 *  rejects negative money/measurement input before it gets here, but every
 *  write path clamps too so a negative value can never reach storage. */
const nonNeg = (n) => Math.max(0, Number(n) || 0);

/* ============================ People ============================ */

export async function createPerson(name) {
  const person = {
    id: newId(),
    name: (name || "").trim(),
    isArchived: false,
    createdAt: nowISO(),
  };
  if (!person.name) throw new Error("A name is required.");
  await db.people.add(person);
  return person;
}

export async function renamePerson(id, name) {
  const trimmed = (name || "").trim();
  if (!trimmed) throw new Error("A name is required.");
  await db.people.update(id, { name: trimmed });
}

/** Does this person appear anywhere in history (group owner, entry passenger,
 *  or payment payer)? Determines archive-vs-delete. */
export async function personHasHistory(id) {
  const ownsGroup = await db.groups.where("ownerPersonId").equals(id).count();
  if (ownsGroup > 0) return true;
  const entries = await db.entries.toArray();
  const inEntry = entries.some((e) =>
    (e.passengers || []).some((p) => p.who?.type === "person" && p.who.personId === id)
  );
  if (inEntry) return true;
  const payments = await db.payments.toArray();
  return payments.some(
    (pm) => pm.who?.type === "person" && pm.who.personId === id
  );
}

/** Delete a person, or archive if they have any history. Returns what happened. */
export async function removePerson(id) {
  if (await personHasHistory(id)) {
    await db.people.update(id, { isArchived: true });
    return "archived";
  }
  await db.people.delete(id);
  return "deleted";
}

export async function restorePerson(id) {
  await db.people.update(id, { isArchived: false, cleared: false });
}

/** "Clear" an archived person: collapse the row to a tiny name-only stub so it
 *  leaves the Archived list but past fill-ups still resolve their name and all
 *  historical totals stay correct. */
export async function clearPerson(id) {
  const p = await db.people.get(id);
  if (!p) return;
  // Keep createdAt - the read hooks sort by it; dropping it would make the
  // stub invisible to any orderBy("createdAt") query (IndexedDB indexes
  // exclude records missing the indexed field).
  await db.people.put({
    id: p.id,
    name: p.name,
    isArchived: true,
    cleared: true,
    createdAt: p.createdAt || nowISO(),
  });
}

/* ============================ Groups ============================ */

export async function createGroup({
  name,
  ownerType,
  ownerPersonId = null,
  defaultKmPerLiter,
}) {
  if (!name || !name.trim()) throw new Error("Give this car a name.");
  if (ownerType === "person" && !ownerPersonId) {
    throw new Error("Pick who owns this car.");
  }
  const group = {
    id: newId(),
    name: name.trim(),
    ownerType,
    ownerPersonId: ownerType === "me" ? null : ownerPersonId,
    defaultKmPerLiter: Number(defaultKmPerLiter) || 0,
    isArchived: false,
    createdAt: nowISO(),
  };
  await db.groups.add(group);
  return group;
}

export async function updateGroup(id, patch) {
  const clean = { ...patch };
  if (clean.defaultKmPerLiter != null) {
    clean.defaultKmPerLiter = Number(clean.defaultKmPerLiter) || 0;
  }
  if (clean.name != null) {
    clean.name = String(clean.name).trim();
    if (!clean.name) throw new Error("Give this car a name.");
  }
  await db.groups.update(id, clean);
}

/** Set (or clear, with amount=null) a person's default Compensate-override
 *  amount within this specific carpool. Scoped per-group, not globally - the
 *  same person can have a different arrangement in a different carpool.
 *  Stored as a plain whoKey -> amount map on the group itself. */
export async function setGroupOverrideDefault(groupId, who, amount) {
  const g = await db.groups.get(groupId);
  if (!g) return;
  const overrideDefaults = { ...(g.overrideDefaults || {}) };
  const key = whoKey(who);
  if (amount == null) delete overrideDefaults[key];
  else overrideDefaults[key] = Number(amount) || 0;
  await db.groups.update(groupId, { overrideDefaults });
}

export async function groupHasHistory(id) {
  const n = await db.entries.where("groupId").equals(id).count();
  return n > 0;
}

/** Delete a group, or archive if it has entries. */
export async function removeGroup(id) {
  if (await groupHasHistory(id)) {
    await db.groups.update(id, { isArchived: true });
    return "archived";
  }
  await db.groups.delete(id);
  return "deleted";
}

export async function restoreGroup(id) {
  await db.groups.update(id, { isArchived: false, cleared: false });
}

/** "Clear" an archived group: collapse to a minimal stub. Its fill-ups stay in
 *  History with the right name; it just leaves the Archived list. */
export async function clearGroup(id) {
  const g = await db.groups.get(id);
  if (!g) return;
  await db.groups.put({
    id: g.id,
    name: g.name,
    ownerType: g.ownerType,
    ownerPersonId: g.ownerPersonId ?? null,
    isArchived: true,
    cleared: true,
    createdAt: g.createdAt || nowISO(),
  });
}

/* ============================ Entries ============================ */

/**
 * @param {Object} entry  fully-formed entry (totals already derived via calc)
 */
export async function createEntry(entry) {
  const row = {
    id: newId(),
    groupId: entry.groupId,
    date: entry.date,
    title: entry.title?.trim() || null,
    totalCost: nonNeg(entry.totalCost),
    totalLiters: nonNeg(entry.totalLiters),
    totalDistance: nonNeg(entry.totalDistance),
    fuelPricePerLiter: nonNeg(entry.fuelPricePerLiter),
    hasMeasuredEfficiency: Boolean(entry.hasMeasuredEfficiency),
    // Split method + driver-comp extras (snapshotted onto the entry).
    splitMethod: entry.splitMethod || "distance",
    tolls: nonNeg(entry.tolls),
    parking: nonNeg(entry.parking),
    maintenancePct: nonNeg(entry.maintenancePct),
    // How the Custom method splits the leftover pool: 'equal' | 'distance'.
    customRemainderSplit: entry.customRemainderSplit || "equal",
    // Who was actually present for tolls (Compensate method) - null means
    // "everyone", so entries from other methods never need to set this.
    tollsPresentWho: entry.tollsPresentWho || null,
    passengers: (entry.passengers || []).map((p) => ({
      who: p.who,
      distanceAssigned: nonNeg(p.distanceAssigned),
      manualOverride: p.manualOverride != null ? nonNeg(p.manualOverride) : null,
    })),
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  if (!row.date) throw new Error("Pick a date for this refuel.");
  await db.entries.add(row);
  return row;
}

/**
 * Update an entry. Enforces a passenger with payments recorded against them
 * cannot be removed until those payments are dealt with. Existing payment rows
 * are never touched here - only the entry's own fields change; outstanding is
 * recalculated downstream from the new share().
 */
export async function updateEntry(id, patch) {
  const existing = await db.entries.get(id);
  if (!existing) throw new Error("Entry not found.");

  if (patch.passengers) {
    const nextWhoKeys = new Set(patch.passengers.map((p) => whoKey(p.who)));
    const removed = (existing.passengers || []).filter(
      (p) => !nextWhoKeys.has(whoKey(p.who))
    );
    if (removed.length) {
      const payments = await db.payments.where("entryId").equals(id).toArray();
      const blocked = removed.filter((p) =>
        payments.some((pm) => whoEquals(pm.who, p.who))
      );
      if (blocked.length) {
        const names = blocked
          .map((p) => (p.who.type === "me" ? "you" : "that passenger"))
          .join(", ");
        const err = new Error(
          `Can't remove ${names} - there are payments recorded against them on this entry. Remove those payments first, or leave them on the entry.`
        );
        err.code = "PASSENGER_HAS_PAYMENTS";
        throw err;
      }
    }
  }

  const clean = { ...patch, updatedAt: nowISO() };
  if (clean.title != null) clean.title = String(clean.title).trim() || null;
  if (clean.passengers) {
    clean.passengers = clean.passengers.map((p) => ({
      who: p.who,
      distanceAssigned: nonNeg(p.distanceAssigned),
      manualOverride: p.manualOverride != null ? nonNeg(p.manualOverride) : null,
    }));
  }
  for (const k of [
    "totalCost",
    "totalLiters",
    "totalDistance",
    "fuelPricePerLiter",
    "tolls",
    "parking",
    "maintenancePct",
  ]) {
    if (clean[k] != null) clean[k] = nonNeg(clean[k]);
  }
  await db.entries.update(id, clean);
}

/** Delete an entry and cascade-delete its payments (they belong to it). */
export async function removeEntry(id) {
  await db.transaction("rw", db.entries, db.payments, async () => {
    await db.payments.where("entryId").equals(id).delete();
    await db.entries.delete(id);
  });
}

/* ============================ Payments ============================ */

export async function createPayment({ entryId, who, amount, date, note }) {
  const row = {
    id: newId(),
    entryId,
    who,
    amount: Number(amount) || 0,
    date,
    note: note?.trim() || null,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  if (!row.entryId) throw new Error("Payment must be tied to an entry.");
  if (!row.date) throw new Error("Pick a payment date.");
  if (row.amount <= 0) throw new Error("Enter a payment amount.");
  await db.payments.add(row);
  return row;
}

export async function updatePayment(id, patch) {
  const clean = { ...patch, updatedAt: nowISO() };
  if (clean.amount != null) {
    clean.amount = Number(clean.amount) || 0;
    if (clean.amount <= 0) throw new Error("Enter a payment amount.");
  }
  if (clean.note != null) clean.note = String(clean.note).trim() || null;
  await db.payments.update(id, clean);
}

export async function removePayment(id) {
  await db.payments.delete(id);
}

/** Wipe a set of payments in one go (swipe-to-clear on a passenger row). */
export async function clearPayments(ids) {
  if (!ids?.length) return;
  await db.payments.bulkDelete(ids);
}

/* ===================== Onboarding / bulk ===================== */

/** Mark the app as onboarded once the first (owned) car exists. */
export async function markOnboarded() {
  const s = await getSettings();
  if (!s.onboardedAt) await updateSettings({ onboardedAt: nowISO() });
}

/** First-run car creation. Flips the onboarded flag unless the caller wants to
 *  defer it (e.g. a following prefs step still to come). */
export async function createFirstCar({ name, defaultKmPerLiter, finishOnboarding = true }) {
  const group = await createGroup({
    name,
    ownerType: "me",
    defaultKmPerLiter,
  });
  if (finishOnboarding) await markOnboarded();
  return group;
}

/** Permanently delete a group AND all its fill-ups + their payments (cascade).
 *  Destructive - confirm first. */
export async function permanentlyDeleteGroup(id) {
  await db.transaction("rw", db.groups, db.entries, db.payments, async () => {
    const entryIds = await db.entries.where("groupId").equals(id).primaryKeys();
    if (entryIds.length) await db.payments.where("entryId").anyOf(entryIds).delete();
    await db.entries.where("groupId").equals(id).delete();
    await db.groups.delete(id);
  });
}

/** Permanently delete a person: cascade-delete any carpools they OWN (and those
 *  carpools' fill-ups + payments), remove them from every remaining fill-up's
 *  passengers, delete their own payments, and remove the person record. */
export async function permanentlyDeletePerson(id) {
  await db.transaction("rw", db.people, db.groups, db.entries, db.payments, async () => {
    // 1. Carpools this person owns cascade away entirely (no dangling owner).
    const ownedGroupIds = await db.groups
      .where("ownerPersonId")
      .equals(id)
      .primaryKeys();
    for (const gid of ownedGroupIds) {
      const eIds = await db.entries.where("groupId").equals(gid).primaryKeys();
      if (eIds.length) await db.payments.where("entryId").anyOf(eIds).delete();
      await db.entries.where("groupId").equals(gid).delete();
    }
    if (ownedGroupIds.length) await db.groups.bulkDelete(ownedGroupIds);

    // 2. Their own payments (in carpools they ride in).
    const payments = await db.payments.toArray();
    const theirPayIds = payments
      .filter((pm) => pm.who?.type === "person" && pm.who.personId === id)
      .map((pm) => pm.id);
    if (theirPayIds.length) await db.payments.bulkDelete(theirPayIds);

    // 3. Strip them from every remaining fill-up's passengers.
    const entries = await db.entries.toArray();
    for (const e of entries) {
      const kept = (e.passengers || []).filter(
        (p) => !(p.who?.type === "person" && p.who.personId === id)
      );
      if (kept.length !== (e.passengers || []).length) {
        await db.entries.update(e.id, { passengers: kept, updatedAt: nowISO() });
      }
    }
    await db.people.delete(id);
  });
}

/** Wipe every table and reset to a fresh, un-onboarded state. Destructive -
 *  callers must double-confirm with the user first (8). */
export async function clearAllData() {
  await db.transaction(
    "rw",
    db.people,
    db.groups,
    db.entries,
    db.payments,
    db.settings,
    async () => {
      await Promise.all([
        db.people.clear(),
        db.groups.clear(),
        db.entries.clear(),
        db.payments.clear(),
        db.settings.clear(),
      ]);
    }
  );
  await ensureSettings(); // fresh settings row, onboardedAt = null
}
