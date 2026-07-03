import { db, newId, nowISO, getSettings, updateSettings } from "./db.js";
import { whoEquals, whoKey } from "../lib/identity.js";

/* Write operations + business rules (build spec §3, §3.1, §8).
   Everything that mutates the DB lives here so the rules (archiving instead of
   deleting when history exists, blocking passenger removal when payments exist,
   cascading entry->payment deletes) live in one place. */

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
  await db.people.update(id, { isArchived: false });
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
  if (clean.name != null) clean.name = String(clean.name).trim();
  await db.groups.update(id, clean);
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
  await db.groups.update(id, { isArchived: false });
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
    totalCost: Number(entry.totalCost) || 0,
    totalLiters: Number(entry.totalLiters) || 0,
    totalDistance: Number(entry.totalDistance) || 0,
    fuelPricePerLiter: Number(entry.fuelPricePerLiter) || 0,
    hasMeasuredEfficiency: Boolean(entry.hasMeasuredEfficiency),
    // Split method + driver-comp extras (snapshotted onto the entry).
    splitMethod: entry.splitMethod || "distance",
    tolls: Number(entry.tolls) || 0,
    parking: Number(entry.parking) || 0,
    maintenancePct: Number(entry.maintenancePct) || 0,
    passengers: (entry.passengers || []).map((p) => ({
      who: p.who,
      distanceAssigned: Number(p.distanceAssigned) || 0,
    })),
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  if (!row.date) throw new Error("Pick a date for this fill-up.");
  await db.entries.add(row);
  return row;
}

/**
 * Update an entry. Enforces §8: a passenger with payments recorded against them
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
      distanceAssigned: Number(p.distanceAssigned) || 0,
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
    if (clean[k] != null) clean[k] = Number(clean[k]) || 0;
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
  if (clean.amount != null) clean.amount = Number(clean.amount) || 0;
  if (clean.note != null) clean.note = String(clean.note).trim() || null;
  await db.payments.update(id, clean);
}

export async function removePayment(id) {
  await db.payments.delete(id);
}

/* ===================== Onboarding / bulk ===================== */

/** Mark the app as onboarded once the first (owned) car exists. */
export async function markOnboarded() {
  const s = await getSettings();
  if (!s.onboardedAt) await updateSettings({ onboardedAt: nowISO() });
}

/** First-run car creation: creates an owned group and flips the onboarded flag. */
export async function createFirstCar({ name, defaultKmPerLiter }) {
  const group = await createGroup({
    name,
    ownerType: "me",
    defaultKmPerLiter,
  });
  await markOnboarded();
  return group;
}
