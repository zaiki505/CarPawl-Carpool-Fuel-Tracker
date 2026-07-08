import { describe, it, expect } from "vitest";
import { validateBackup, BACKUP_VERSION } from "./backup.js";

const validBackup = () => ({
  app: "CarPawl",
  version: BACKUP_VERSION,
  exportedAt: "2026-01-01T00:00:00.000Z",
  data: {
    people: [{ id: "p1", name: "Alex" }],
    groups: [{ id: "g1", name: "My Myvi" }],
    entries: [{ id: "e1", totalCost: 10 }],
    payments: [{ id: "pay1", amount: 5 }],
  },
});

describe("validateBackup", () => {
  it("accepts a well-formed backup", () => {
    expect(validateBackup(validBackup())).toBeTruthy();
  });

  it("rejects a non-CarPawl object", () => {
    expect(() => validateBackup({ app: "SomethingElse" })).toThrow(
      /doesn't look like a CarPawl backup/
    );
  });

  it("rejects null/non-object input", () => {
    expect(() => validateBackup(null)).toThrow();
    expect(() => validateBackup("just a string")).toThrow();
  });

  it("rejects a backup from a newer app version", () => {
    const b = validBackup();
    b.version = BACKUP_VERSION + 1;
    expect(() => validateBackup(b)).toThrow(/newer version/);
  });

  it("accepts a backup with no version field (older exports)", () => {
    const b = validBackup();
    delete b.version;
    expect(validateBackup(b)).toBeTruthy();
  });

  it("rejects a backup missing one of the required lists", () => {
    const b = validBackup();
    delete b.data.payments;
    expect(() => validateBackup(b)).toThrow(/missing its "payments" list/);
  });

  it("rejects a backup whose list isn't an array", () => {
    const b = validBackup();
    b.data.entries = "not-an-array";
    expect(() => validateBackup(b)).toThrow(/missing its "entries" list/);
  });

  it("rejects a corrupted row missing an id", () => {
    const b = validBackup();
    b.data.entries = [{ totalCost: 10 }]; // no id
    expect(() => validateBackup(b)).toThrow(/"entries" list looks corrupted/);
  });

  it("rejects a corrupted row that isn't an object", () => {
    const b = validBackup();
    b.data.people = ["just a string", null];
    expect(() => validateBackup(b)).toThrow(/"people" list looks corrupted/);
  });
});
