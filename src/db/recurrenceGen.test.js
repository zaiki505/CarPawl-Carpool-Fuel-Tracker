import "fake-indexeddb/auto";
import { beforeEach, describe, it, expect } from "vitest";
import { db } from "./db.js";
import { createEntry, updateEntry, generateDueRecurrences } from "./actions.js";
import { isFutureDate } from "../lib/format.js";

const wipe = () =>
  Promise.all([
    db.people.clear(),
    db.groups.clear(),
    db.entries.clear(),
    db.payments.clear(),
    db.deletions.clear(),
  ]);

beforeEach(wipe);

const recurringEntry = (over = {}) => ({
  groupId: "g1",
  date: "2020-01-01", // long past, so an occurrence is due
  totalCost: 20,
  splitMethod: "equal",
  passengers: [],
  recurrence: "daily",
  ...over,
});

describe("generateDueRecurrences", () => {
  it("schedules exactly one FUTURE occurrence for a due series", async () => {
    // createEntry auto-runs generation once for a recurring trip.
    await createEntry(recurringEntry());
    const entries = await db.entries.toArray();
    expect(entries).toHaveLength(2); // the original + one generated
    const future = entries.filter((e) => isFutureDate(e.date));
    expect(future).toHaveLength(1);
    // same series, deterministic generated id
    expect(new Set(entries.map((e) => e.recurrenceId)).size).toBe(1);
    expect(future[0].id.startsWith("recur-")).toBe(true);
  });

  it("is idempotent - a second run adds nothing while a future one is pending", async () => {
    await createEntry(recurringEntry());
    const before = await db.entries.count();
    await generateDueRecurrences();
    await generateDueRecurrences();
    expect(await db.entries.count()).toBe(before);
  });

  it("does not generate when the latest occurrence is still in the future", async () => {
    await createEntry(recurringEntry({ date: "2999-01-01" }));
    // Only the one future entry exists; nothing due yet.
    expect(await db.entries.count()).toBe(1);
  });

  it("stops the series when the latest occurrence's cadence is turned off", async () => {
    const first = await createEntry(recurringEntry());
    // The generated future occurrence is now the latest; turn its recurrence off.
    const future = (await db.entries.toArray()).find((e) => isFutureDate(e.date));
    await updateEntry(future.id, { recurrence: "none" });
    const before = await db.entries.count();
    await generateDueRecurrences();
    expect(await db.entries.count()).toBe(before); // no new occurrence
  });

  it("leaves non-recurring entries alone", async () => {
    await createEntry({ groupId: "g1", date: "2020-01-01", totalCost: 5, splitMethod: "equal", passengers: [] });
    expect(await db.entries.count()).toBe(1);
    await generateDueRecurrences();
    expect(await db.entries.count()).toBe(1);
  });
});
