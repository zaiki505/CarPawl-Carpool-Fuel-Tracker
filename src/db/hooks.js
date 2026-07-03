import { useLiveQuery } from "dexie-react-hooks";
import { db, readSettings } from "./db.js";

/* Reactive read hooks (Dexie live queries). Every write via actions.js causes
   these to re-run automatically, so screens stay in sync with no manual
   refresh. Components do the calc; these just fetch. */

export function useGroups({ includeArchived = false } = {}) {
  return useLiveQuery(async () => {
    const all = await db.groups.orderBy("createdAt").toArray();
    return includeArchived ? all : all.filter((g) => !g.isArchived);
  }, [includeArchived]);
}

export function usePeople({ includeArchived = false } = {}) {
  return useLiveQuery(async () => {
    const all = await db.people.orderBy("createdAt").toArray();
    return includeArchived ? all : all.filter((p) => !p.isArchived);
  }, [includeArchived]);
}

/** Map of personId -> person, including archived (so historical names resolve). */
export function usePeopleMap() {
  return useLiveQuery(async () => {
    const all = await db.people.toArray();
    const map = new Map();
    for (const p of all) map.set(p.id, p);
    return map;
  }, []);
}

export function useEntries() {
  return useLiveQuery(
    () => db.entries.orderBy("date").reverse().toArray(),
    []
  );
}

export function useEntriesForGroup(groupId) {
  return useLiveQuery(
    async () => {
      if (!groupId) return [];
      const rows = await db.entries.where("groupId").equals(groupId).toArray();
      return rows.sort((a, b) => new Date(b.date) - new Date(a.date));
    },
    [groupId]
  );
}

export function usePayments() {
  return useLiveQuery(() => db.payments.toArray(), []);
}

export function usePaymentsForEntry(entryId) {
  return useLiveQuery(
    () => (entryId ? db.payments.where("entryId").equals(entryId).toArray() : []),
    [entryId]
  );
}

export function useSettings() {
  return useLiveQuery(() => readSettings(), []);
}

export function useGroup(groupId) {
  return useLiveQuery(() => (groupId ? db.groups.get(groupId) : null), [groupId]);
}

export function useEntry(entryId) {
  return useLiveQuery(
    () => (entryId ? db.entries.get(entryId) : null),
    [entryId]
  );
}

/** Everything the Dashboard needs, assembled once. Returns null while loading. */
export function useAllData() {
  return useLiveQuery(async () => {
    const [groups, entries, payments, people, settings] = await Promise.all([
      db.groups.toArray(),
      db.entries.toArray(),
      db.payments.toArray(),
      db.people.toArray(),
      readSettings(),
    ]);
    // Newest first, so Dashboard "recent" and History read chronologically.
    entries.sort((a, b) => {
      const d = new Date(b.date) - new Date(a.date);
      return d !== 0 ? d : new Date(b.createdAt) - new Date(a.createdAt);
    });
    const activeGroups = groups.filter((g) => !g.isArchived);
    const ownedGroups = activeGroups.filter((g) => g.ownerType === "me");
    const nonOwnedGroups = activeGroups.filter((g) => g.ownerType === "person");
    const entriesByGroup = {};
    for (const g of groups) entriesByGroup[g.id] = [];
    for (const e of entries) {
      (entriesByGroup[e.groupId] ||= []).push(e);
    }
    for (const gid of Object.keys(entriesByGroup)) {
      entriesByGroup[gid].sort((a, b) => new Date(b.date) - new Date(a.date));
    }
    const peopleMap = new Map(people.map((p) => [p.id, p]));
    return {
      groups,
      activeGroups,
      ownedGroups,
      nonOwnedGroups,
      entries,
      entriesByGroup,
      payments,
      people,
      peopleMap,
      settings,
    };
  }, []);
}
