import { describe, it, expect } from "vitest";
import { mergeSnapshots, mergeDeletions, SYNC_TABLES } from "./sync.js";

const snap = (over = {}) => ({
  app: "CarPawl",
  people: [],
  groups: [],
  entries: [],
  payments: [],
  settings: { id: "app", onboardedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
  deletions: [],
  ...over,
});
const NOW = Date.parse("2026-07-01T00:00:00.000Z");

describe("mergeSnapshots - last-write-wins per record", () => {
  it("keeps records added independently on different devices (the whole point)", () => {
    const a = snap({ people: [{ id: "p1", name: "Alex", updatedAt: "2026-06-01T00:00:00Z" }] });
    const b = snap({ people: [{ id: "p2", name: "Sam", updatedAt: "2026-06-02T00:00:00Z" }] });
    const m = mergeSnapshots(a, b, { now: NOW });
    expect(m.people.map((p) => p.id).sort()).toEqual(["p1", "p2"]);
  });

  it("newer edit to the same record wins", () => {
    const a = snap({ groups: [{ id: "g1", name: "Old name", updatedAt: "2026-06-01T00:00:00Z" }] });
    const b = snap({ groups: [{ id: "g1", name: "New name", updatedAt: "2026-06-05T00:00:00Z" }] });
    expect(mergeSnapshots(a, b, { now: NOW }).groups[0].name).toBe("New name");
    // order-independent
    expect(mergeSnapshots(b, a, { now: NOW }).groups[0].name).toBe("New name");
  });
});

describe("mergeSnapshots - deletions via tombstones", () => {
  it("a delete on one device removes the record from the merged result", () => {
    const withRec = snap({ entries: [{ id: "e1", totalCost: 10, updatedAt: "2026-06-01T00:00:00Z" }] });
    const deleted = snap({
      entries: [],
      deletions: [{ table: "entries", id: "e1", deletedAt: "2026-06-10T00:00:00Z" }],
    });
    const m = mergeSnapshots(withRec, deleted, { now: NOW });
    expect(m.entries).toHaveLength(0);
    expect(m.deletions).toHaveLength(1); // tombstone retained so other devices delete too
  });

  it("resurrects a record edited AFTER its delete (edit wins over older tombstone)", () => {
    const deleted = snap({
      entries: [],
      deletions: [{ table: "entries", id: "e1", deletedAt: "2026-06-01T00:00:00Z" }],
    });
    const reAdded = snap({ entries: [{ id: "e1", totalCost: 20, updatedAt: "2026-06-05T00:00:00Z" }] });
    const m = mergeSnapshots(deleted, reAdded, { now: NOW });
    expect(m.entries.map((e) => e.id)).toEqual(["e1"]);
    expect(m.deletions).toHaveLength(0); // obsolete tombstone pruned
  });

  it("mergeDeletions keeps the latest tombstone per (table,id)", () => {
    const merged = mergeDeletions(
      [{ table: "people", id: "p1", deletedAt: "2026-06-01T00:00:00Z" }],
      [{ table: "people", id: "p1", deletedAt: "2026-06-09T00:00:00Z" }]
    );
    expect(merged).toEqual([{ table: "people", id: "p1", deletedAt: "2026-06-09T00:00:00Z" }]);
  });

  it("prunes tombstones older than the TTL", () => {
    const old = snap({
      deletions: [{ table: "people", id: "gone", deletedAt: "2026-01-01T00:00:00Z" }],
    });
    const m = mergeSnapshots(old, snap(), { now: NOW, tombstoneTtlDays: 30 });
    expect(m.deletions).toHaveLength(0); // > 30 days old
  });
});

describe("mergeSnapshots - settings", () => {
  it("takes the newer settings row but keeps onboardedAt sticky", () => {
    const onboarded = snap({
      settings: { id: "app", onboardedAt: "2026-05-01T00:00:00Z", currency: "MYR", updatedAt: "2026-05-01T00:00:00Z" },
    });
    const fresherButUnonboarded = snap({
      settings: { id: "app", onboardedAt: null, currency: "USD", updatedAt: "2026-06-01T00:00:00Z" },
    });
    const m = mergeSnapshots(onboarded, fresherButUnonboarded, { now: NOW });
    expect(m.settings.currency).toBe("USD"); // newer row wins for normal fields
    expect(m.settings.onboardedAt).toBe("2026-05-01T00:00:00Z"); // but onboarding is never lost
  });
});

describe("mergeSnapshots - shape & robustness", () => {
  it("always returns all tables even from empty/partial snapshots", () => {
    const m = mergeSnapshots({}, {}, { now: NOW });
    for (const t of SYNC_TABLES) expect(Array.isArray(m[t])).toBe(true);
    expect(m.syncVersion).toBe(1);
  });

  it("is idempotent - merging a snapshot with itself changes nothing meaningful", () => {
    const a = snap({
      people: [{ id: "p1", name: "Alex", updatedAt: "2026-06-01T00:00:00Z" }],
      entries: [{ id: "e1", totalCost: 10, updatedAt: "2026-06-01T00:00:00Z" }],
    });
    const once = mergeSnapshots(a, a, { now: NOW });
    const twice = mergeSnapshots(once, once, { now: NOW });
    expect(twice.people).toEqual(once.people);
    expect(twice.entries).toEqual(once.entries);
  });
});
