import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, readSettings } from "./db.js";
import { todayISODate } from "../lib/format.js";
import { withCoveredWho } from "../lib/calc.js";

/* Every entry is stamped with its group's covered payer at read time, so the
   driver-comp split prices it correctly (see calc.customRawShare). Deriving it
   here means it applies to EVERY entry, existing ones included, with no data
   migration. The write side (db/actions) stamps with the SAME helper - if these
   two ever diverge, the UI and the ledger disagree about what a trip costs. */
const withCovered = withCoveredWho;

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
  return useLiveQuery(async () => {
    const [rows, groups] = await Promise.all([
      db.entries.orderBy("date").reverse().toArray(),
      db.groups.toArray(),
    ]);
    const groupById = new Map(groups.map((g) => [g.id, g]));
    return rows.map((e) => withCovered(e, groupById.get(e.groupId)));
  }, []);
}

export function useEntriesForGroup(groupId) {
  const dayKey = useDayKey();
  return useLiveQuery(
    async () => {
      if (!groupId) return [];
      const [rows, group] = await Promise.all([
        db.entries.where("groupId").equals(groupId).toArray(),
        db.groups.get(groupId),
      ]);
      return rows
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .map((e) => withCovered(e, group));
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

/** All credit-application ledger rows (active + reversed, for history/audit). */
export function useCreditApplications() {
  return useLiveQuery(() => db.creditApplications.toArray(), []);
}

export function useCreditApplicationsForGroup(groupId) {
  return useLiveQuery(
    () => (groupId ? db.creditApplications.where("groupId").equals(groupId).toArray() : []),
    [groupId]
  );
}

export function useSettings() {
  return useLiveQuery(() => readSettings(), []);
}

export function useGroup(groupId) {
  return useLiveQuery(() => (groupId ? db.groups.get(groupId) : null), [groupId]);
}

export function useEntry(entryId) {
  return useLiveQuery(async () => {
    if (!entryId) return null;
    const entry = await db.entries.get(entryId);
    if (!entry) return null;
    return withCovered(entry, await db.groups.get(entry.groupId));
  }, [entryId]);
}

/** Everything the Dashboard needs all assembled once. Returns null while loading. */
export function useAllData() {
  const dayKey = useDayKey();
  return useLiveQuery(async () => {
    const [groups, rawEntries, payments, people, creditApplications, settings] = await Promise.all([
      db.groups.toArray(),
      db.entries.toArray(),
      db.payments.toArray(),
      db.people.toArray(),
      db.creditApplications.toArray(),
      readSettings(),
    ]);
    // Attach each entry's covered payer up front so all downstream calc (shares,
    // balances, spend) is consistent (v0.2.9 - driver-comp owner exclusion).
    const groupById = new Map(groups.map((g) => [g.id, g]));
    const entries = rawEntries.map((e) => withCovered(e, groupById.get(e.groupId)));
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
      creditApplications,
      people,
      peopleMap,
      settings,
    };
  }, [dayKey]);
}
