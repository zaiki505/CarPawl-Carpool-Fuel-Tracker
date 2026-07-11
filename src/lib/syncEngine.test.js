import "fake-indexeddb/auto";
import { beforeEach, describe, it, expect, vi } from "vitest";

/* syncEngine ties buildSnapshot + Drive I/O + mergeSnapshots + applySnapshot
   together. Drive is the only part we can't run here, so we mock just drive.js
   and drive it with a controllable in-memory "remote". Everything else - the
   real Dexie DB (fake-indexeddb), the real merge, the real apply - runs for real. */

const driveState = vi.hoisted(() => ({
  remote: null, // snapshot object the mocked download() returns
  etag: "etag-0",
  notModified: false,
  uploaded: [], // snapshots passed to the mocked upload()
  connected: true,
  throwAuth: false, // when true, download() rejects with a DriveAuthError
}));
const AuthErr = vi.hoisted(() => class DriveAuthError extends Error {});

vi.mock("./drive.js", () => ({
  connect: async () => {
    driveState.connected = true;
  },
  isConnected: async () => driveState.connected,
  download: async () => {
    if (driveState.throwAuth) throw new AuthErr("Token expired");
    return {
      snapshot: driveState.remote,
      etag: driveState.etag,
      notModified: driveState.notModified,
    };
  },
  upload: async (snap) => {
    driveState.uploaded.push(snap);
    driveState.etag = "etag-" + driveState.uploaded.length;
    return driveState.etag;
  },
  DriveAuthError: AuthErr,
}));

import { db, SETTINGS_ID, updateSettings, ensureSettings } from "../db/db.js";
import * as actions from "../db/actions.js";
import { syncNow, connectAndPrepare, resolveConflict } from "./syncEngine.js";

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

beforeEach(async () => {
  await Promise.all([
    db.people.clear(),
    db.groups.clear(),
    db.entries.clear(),
    db.payments.clear(),
    db.deletions.clear(),
    db.settings.clear(),
  ]);
  await ensureSettings();
  await updateSettings({ gdriveConnected: true });
  driveState.remote = null;
  driveState.etag = "etag-0";
  driveState.notModified = false;
  driveState.uploaded = [];
  driveState.connected = true;
  driveState.throwAuth = false;
});

describe("syncNow", () => {
  it("does nothing when Drive is not connected", async () => {
    driveState.connected = false;
    await actions.createPerson("Local");
    await syncNow();
    expect(driveState.uploaded).toHaveLength(0);
  });

  it("pulls remote records into the local DB and uploads the merged result", async () => {
    await actions.createPerson("Local");
    driveState.remote = remoteSnap({
      people: [{ id: "r1", name: "Remote", updatedAt: "2026-06-01T00:00:00Z" }],
    });

    await syncNow();

    const names = (await db.people.toArray()).map((p) => p.name).sort();
    expect(names).toEqual(["Local", "Remote"]); // both survived the merge
    expect(driveState.uploaded).toHaveLength(1);
    const pushedNames = driveState.uploaded[0].people.map((p) => p.name).sort();
    expect(pushedNames).toEqual(["Local", "Remote"]);
  });

  it("applies a remote deletion (tombstone) to the local DB", async () => {
    const doomed = await actions.createPerson("DeleteMe");
    const editedAt = (await db.people.get(doomed.id)).updatedAt;
    const deletedAt = new Date(Date.parse(editedAt) + 1000).toISOString();
    driveState.remote = remoteSnap({
      deletions: [{ table: "people", id: doomed.id, deletedAt }],
    });

    await syncNow();

    expect(await db.people.get(doomed.id)).toBeUndefined();
  });

  it("records lastSyncedAt in settings after a successful sync", async () => {
    await actions.createPerson("Local");
    driveState.remote = remoteSnap();
    await syncNow();
    const s = await db.settings.get(SETTINGS_ID);
    expect(s.lastSyncedAt).toBeTruthy();
    expect(s.gdriveEtag).toBe("etag-1"); // etag advanced by the mocked upload
  });

  it("creates the first remote file when Drive is empty (no snapshot yet)", async () => {
    await actions.createPerson("Solo");
    driveState.remote = null; // first sync from this account
    await syncNow();
    expect(driveState.uploaded).toHaveLength(1);
    expect(driveState.uploaded[0].people.map((p) => p.name)).toEqual(["Solo"]);
  });

  it("serializes two overlapping syncNow() calls instead of racing (regression: the etag/upload guard used to be claimed AFTER an await, letting concurrent triggers - e.g. focus + online on app resume - both slip past it and race each other's uploads)", async () => {
    await actions.createPerson("Racer");
    await Promise.all([syncNow(), syncNow()]);
    expect(driveState.uploaded).toHaveLength(1);
  });

  it("handles a lapsed Drive sign-in gracefully - no throw, no upload (regression: a background token expiry used to surface as an uncaught-looking console.error and could re-fire on every trigger)", async () => {
    await actions.createPerson("X");
    driveState.throwAuth = true; // download() rejects with DriveAuthError
    await expect(syncNow()).resolves.toBeUndefined();
    expect(driveState.uploaded).toHaveLength(0);
  });
});

describe("connectAndPrepare + resolveConflict (#8)", () => {
  it("flags a conflict when this device AND Drive both have data", async () => {
    driveState.connected = false; // connect() will flip it
    await actions.createPerson("LocalOnly");
    driveState.remote = remoteSnap({
      people: [{ id: "r1", name: "RemoteOnly", updatedAt: "2026-06-01T00:00:00Z" }],
    });
    const res = await connectAndPrepare();
    expect(res.status).toBe("conflict");
    expect(res.local.people).toBe(1);
    expect(res.remoteCounts.people).toBe(1);
    // conflict must NOT auto-apply anything yet - local is untouched
    expect((await db.people.toArray()).map((p) => p.name)).toEqual(["LocalOnly"]);
  });

  it("just pulls when the device is empty and Drive has data (no conflict)", async () => {
    driveState.connected = false;
    driveState.remote = remoteSnap({
      people: [{ id: "r1", name: "RemoteOnly", updatedAt: "2026-06-01T00:00:00Z" }],
    });
    const res = await connectAndPrepare();
    expect(res.status).toBe("synced");
    expect((await db.people.toArray()).map((p) => p.name)).toEqual(["RemoteOnly"]);
  });

  it("resolveConflict('replace') discards local and adopts Drive's copy", async () => {
    await actions.createPerson("LocalGetsWiped");
    const remote = remoteSnap({
      people: [{ id: "r1", name: "DriveCopy", updatedAt: "2026-06-01T00:00:00Z" }],
    });
    await resolveConflict("replace", remote, "etag-x");
    expect((await db.people.toArray()).map((p) => p.name)).toEqual(["DriveCopy"]);
  });

  it("resolveConflict('merge') keeps records from both sides", async () => {
    await actions.createPerson("LocalKeep");
    driveState.remote = remoteSnap({
      people: [{ id: "r1", name: "RemoteKeep", updatedAt: "2026-06-01T00:00:00Z" }],
    });
    await resolveConflict("merge", driveState.remote, "etag-y");
    expect((await db.people.toArray()).map((p) => p.name).sort()).toEqual([
      "LocalKeep",
      "RemoteKeep",
    ]);
  });
});
