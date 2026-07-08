import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, readSettings } from "./db.js";
import { todayISODate } from "../lib/format.js";

/* Reactive read hooks (Dexie live queries). Every write via actions.js causes
   these to re-run automatically, so screens stay in sync with no manual
   refresh. Components do the calc; these just fetch. */

/* Local calendar day ('YYYY-MM-DD'), updating at midnight and when the app
   regains focus. Help makes date-relative views (upcoming refuels, "this month" totals) 
   refresh when the day over, instead of staying stale until the next DB write. */
export function useDayKey() {
  const [day, setDay] = useState(() => todayISODate());
  useEffect(() => {
    let timer;
    const tick = () => setDay((prev) => (prev === todayISODate() ? prev : todayISODate()));
    const schedule = () => {
      const now = new Date();
      const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0,
        0,
        1
      );
      timer = window.setTimeout(() => {
        tick();
        schedule();
      }, nextMidnight.getTime() - now.getTime());
    };
    schedule();
    const onFocus = () => tick();
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  return day;
}

const byCreatedAt = (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0);

export function useGroups({ includeArchived = false } = {}) {
  return useLiveQuery(async () => {
    const all = (await db.groups.toArray()).sort(byCreatedAt);
    return includeArchived ? all : all.filter((g) => !g.isArchived);
  }, [includeArchived]);
}

export function usePeople({ includeArchived = false } = {}) {
  return useLiveQuery(async () => {
    const all = (await db.people.toArray()).sort(byCreatedAt);
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
  const dayKey = useDayKey();
  return useLiveQuery(
    async () => {
      if (!groupId) return [];
      const rows = await db.entries.where("groupId").equals(groupId).toArray();
      return rows.sort((a, b) => new Date(b.date) - new Date(a.date));
    },
    [groupId, dayKey]
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

/** Everything the Dashboard needs all assembled once. Returns null while loading. */
export function useAllData() {
  const dayKey = useDayKey();
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
    const groupOwnedMap = new Map(groups.map((g) => [g.id, g.ownerType === "me"]));
    const groupMap = new Map(groups.map((g) => [g.id, g]));
    return {
      groups,
      groupMap,
      groupOwnedMap,
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
  }, [dayKey]);
}
