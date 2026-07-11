import "fake-indexeddb/auto";
import { beforeEach, describe, it, expect } from "vitest";
import { db, SETTINGS_ID, DEVICE_LOCAL_SETTINGS } from "../db/db.js";
import { buildSnapshot, applySnapshot } from "./snapshot.js";
import { mergeSnapshots, SYNC_TABLES } from "./sync.js";
import * as actions from "../db/actions.js";

const wipe = async () => {
  await Promise.all([
    db.people.clear(),
    db.groups.clear(),
    db.entries.clear(),
    db.payments.clear(),
    db.deletions.clear(),
    db.settings.clear(),
  ]);
};

beforeEach(wipe);

/** A minimal "other device" snapshot - plain object, as if downloaded from Drive. */
const remoteSnap = (over = {}) => ({
  app: "CarPawl",
  syncVersion: 1,
  people: [],
  groups: [],
  entries: [],
  payments: [],
  settings: { id: SETTINGS_ID, onboardedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
  deletions: [],
  ...over,
});

describe("buildSnapshot", () => {
  it("captures every synced table plus settings and the tombstone log", async () => {
    const p = await actions.createPerson("Alex");
    const g = await actions.createGroup({ name: "My Car", ownerType: "me" });
    await actions.createEntry({ groupId: g.id, date: "2026-06-01", totalCost: 50, passengers: [] });
    // a hard delete leaves a tombstone behind
    const gone = await actions.createPerson("Temp");
    await actions.removePerson(gone.id);

    const snap = await buildSnapshot();
    expect(snap.app).toBe("CarPawl");
    expect(snap.syncVersion).toBe(1);
    for (const t of SYNC_TABLES) expect(Array.isArray(snap[t])).toBe(true);
    expect(snap.people.map((r) => r.name)).toContain("Alex");
    expect(snap.people.find((r) => r.id === p.id).updatedAt).toBeTruthy();
    expect(snap.groups).toHaveLength(1);
    expect(snap.entries).toHaveLength(1);
    expect(snap.deletions).toEqual([
      { table: "people", id: gone.id, deletedAt: expect.any(String) },
    ]);
  });
});

describe("applySnapshot", () => {
  it("writes a merged snapshot into an empty DB", async () => {
    const merged = remoteSnap({
      people: [{ id: "p1", name: "Sam", updatedAt: "2026-06-01T00:00:00Z" }],
      groups: [{ id: "g1", name: "Civic", ownerType: "me", updatedAt: "2026-06-01T00:00:00Z" }],
    });
    await applySnapshot(merged);
    expect((await db.people.toArray()).map((p) => p.name)).toEqual(["Sam"]);
    expect((await db.groups.get("g1")).name).toBe("Civic");
    expect((await db.settings.get(SETTINGS_ID)).id).toBe(SETTINGS_ID);
  });

  it("removes a local row that the merged snapshot no longer contains (remote delete lands)", async () => {
    const doomed = await actions.createPerson("DeleteMe");
    expect(await db.people.get(doomed.id)).toBeTruthy();
    // merged result simply doesn't include that person anymore
    await applySnapshot(remoteSnap({ people: [] }));
    expect(await db.people.get(doomed.id)).toBeUndefined();
  });

  it("does not write a settings row that lacks the fixed id", async () => {
    await applySnapshot(remoteSnap({ settings: { onboardedAt: null } }));
    expect(await db.settings.get(SETTINGS_ID)).toBeUndefined();
  });
});

describe("device-local settings never travel through sync", () => {
  it("buildSnapshot strips device-local keys but keeps user prefs", async () => {
    await db.settings.put({
      id: SETTINGS_ID,
      currency: "MYR",
      onboardedAt: "2026-05-01T00:00:00Z",
      updatedAt: "2026-05-01T00:00:00Z",
      gdriveConnected: true,
      gdriveEtag: "local-etag",
      lastSyncedAt: "2026-06-01T00:00:00Z",
      lastLocalHash: "abc",
    });
    const snap = await buildSnapshot();
    for (const k of DEVICE_LOCAL_SETTINGS) expect(snap.settings[k]).toBeUndefined();
    expect(snap.settings.currency).toBe("MYR"); // user prefs still sync
    expect(snap.settings.onboardedAt).toBe("2026-05-01T00:00:00Z");
  });

  it("applySnapshot preserves this device's connection state and ignores remote's", async () => {
    await db.settings.put({
      id: SETTINGS_ID,
      currency: "MYR",
      updatedAt: "2026-05-01T00:00:00Z",
      gdriveConnected: true,
      gdriveEtag: "local-etag",
    });
    // A remote snapshot that (wrongly) carries someone else's connection state.
    await applySnapshot(
      remoteSnap({
        settings: {
          id: SETTINGS_ID,
          currency: "USD",
          updatedAt: "2026-06-01T00:00:00Z",
          gdriveConnected: false,
          gdriveEtag: "remote-etag",
        },
      })
    );
    const s = await db.settings.get(SETTINGS_ID);
    expect(s.currency).toBe("USD"); // synced pref applied
    expect(s.gdriveConnected).toBe(true); // local connection state kept
    expect(s.gdriveEtag).toBe("local-etag"); // local etag kept, remote ignored
  });
});

describe("full round-trip: build -> merge -> apply", () => {
  it("keeps independent adds from both devices and applies a remote deletion", async () => {
    // local device: two people, one of which the REMOTE device will have deleted
    const keep = await actions.createPerson("LocalKeep");
    const remoteDeletes = await actions.createPerson("RemoteDeletes");
    const local = await buildSnapshot();

    // The remote delete must be NEWER than the record's last edit, otherwise the
    // merge (correctly) treats the record as resurrected. createPerson stamps
    // updatedAt at the real "now", so derive the tombstone time from it.
    const editedAt = local.people.find((p) => p.id === remoteDeletes.id).updatedAt;
    const deletedAt = new Date(Date.parse(editedAt) + 1000).toISOString();

    // remote device: added its own person, and tombstoned `remoteDeletes`
    const remote = remoteSnap({
      people: [{ id: "r1", name: "RemoteAdd", updatedAt: "2026-06-02T00:00:00Z" }],
      deletions: [{ table: "people", id: remoteDeletes.id, deletedAt }],
    });

    const merged = mergeSnapshots(local, remote, { now: Date.parse(deletedAt) + 1000 });
    await applySnapshot(merged);

    const names = (await db.people.toArray()).map((p) => p.name).sort();
    expect(names).toEqual(["LocalKeep", "RemoteAdd"]); // RemoteDeletes gone
    expect(await db.people.get(keep.id)).toBeTruthy();
    expect(await db.people.get(remoteDeletes.id)).toBeUndefined();
    // the tombstone is retained so OTHER devices delete it too
    expect(await db.deletions.get(["people", remoteDeletes.id])).toBeTruthy();
  });

  it("is convergent - applying the same merge twice yields the same DB", async () => {
    await actions.createPerson("A");
    await actions.createGroup({ name: "G", ownerType: "me" });
    const local = await buildSnapshot();
    const merged = mergeSnapshots(local, remoteSnap(), { now: Date.parse("2026-06-04T00:00:00Z") });

    await applySnapshot(merged);
    const first = await buildSnapshot();
    await applySnapshot(merged);
    const second = await buildSnapshot();

    for (const t of SYNC_TABLES) {
      expect(second[t].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
        first[t].sort((a, b) => a.id.localeCompare(b.id))
      );
    }
  });
});
