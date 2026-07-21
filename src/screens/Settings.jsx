import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSettings, usePeople, useGroups, useEntries, usePayments } from "../db/hooks.js";
import { useApp } from "../app/AppContext.jsx";
import { updateSettings } from "../db/db.js";
import {
  createPerson,
  renamePerson,
  removePerson,
  restorePerson,
  restoreGroup,
  clearAllData,
  permanentlyDeleteGroup,
  permanentlyDeletePerson,
} from "../db/actions.js";
import { exportToFile, readBackupFile, restoreFromBackup } from "../lib/backup.js";
import { getTheme, toggleTheme } from "../lib/theme.js";
import { Segment, Field } from "../components/ui/Primitives.jsx";
import { InfoTip } from "../components/ui/InfoTip.jsx";
import { ScreenLoading } from "../components/ui/ScreenLoading.jsx";
import { Select } from "../components/ui/Select.jsx";
import { SPLIT_METHOD_OPTIONS, SPLIT_METHOD_HINTS } from "../lib/splitMethods.js";
import { UPCOMING_WINDOW_OPTIONS } from "../lib/upcoming.js";
import { CURRENCIES } from "../lib/currencies.js";
import { DATE_FORMATS, formatDate } from "../lib/format.js";
import { CyberCat } from "../components/brand/CyberCat.jsx";
import {
  Plus,
  Pencil,
  Archive,
  ArchiveRestore,
  Check,
  X,
  Download,
  Upload,
  Car,
  User,
  Trash2,
  RefreshCw,
  Cloud,
  CloudOff,
  Loader2,
  Bell,
  Smartphone,
  Fingerprint,
  Palette,
  SlidersHorizontal,
  Database,
  AlertTriangle,
  Users,
  Fuel,
  ArrowLeft,
  ChevronRight,
  Moon,
  Sun,
  PawPrint,
  Info,
  Share2,
} from "../components/ui/Icons.jsx";
import { CheckUpdateButton } from "../components/CheckUpdateButton.jsx";
import { WhatsNewButton } from "../components/WhatsNewButton.jsx";
import { HowItWorksButton } from "../components/HowItWorksButton.jsx";
import { GITHUB_URL } from "../lib/updateCheck.js";
import { DriveConflictSheet } from "../components/DriveConflictSheet.jsx";
import { syncNow, useSyncStatus, connectAndPrepare, resolveConflict } from "../lib/syncEngine.js";
import { disconnect, deleteRemoteFile } from "../lib/drive.js";
import { isNative, isAndroidWeb } from "../lib/platform.js";
import {
  ensureNotificationPermission,
  syncRefuelReminder,
  syncPaymentReminders,
} from "../lib/notifications.js";
import { biometricAvailable, verifyBiometric } from "../lib/biometric.js";
import { APP_VERSION, APP_NAME, IS_BETA } from "../lib/channel.js";

// The release PAGE (not the direct .apk asset): a WebView / in-app browser can't
// follow GitHub's redirecting binary download, so we send people to the release
// page and let them tap the APK there in the real browser (BATCH_1 #5, same fix
// as the in-app update button). This supersedes the old hardcoded v0.2.5 .apk
// link that the public repo still carried - it never needs bumping by hand.
const ANDROID_RELEASE_PAGE = `${GITHUB_URL}/releases/tag/v${APP_VERSION}`;

/* Settings: appearance, fuel/format prefs, default fuel price, the global people list, archived items with
   restore, JSON backup/restore, and the CyberCat easter egg. */
export function Settings() {
  const settings = useSettings();
  const activePeople = usePeople() || [];
  const allPeople = usePeople({ includeArchived: true }) || [];
  const allGroups = useGroups({ includeArchived: true }) || [];
  const allEntries = useEntries() || [];
  const allPayments = usePayments() || [];
  const { toast, askConfirm, setBackHandler } = useApp();

  // Person IDs that appear anywhere in history (own a carpool, on an entry, or
  // in a payment). Used to label their action button "Archive" (kept for
  // history) vs "Remove" (deleted) - mirrors actions.personHasHistory but from
  // the already-loaded reactive data, so no per-row async check is needed.
  const peopleWithHistory = useMemo(() => {
    const s = new Set();
    for (const g of allGroups) if (g.ownerPersonId) s.add(g.ownerPersonId);
    for (const e of allEntries)
      for (const p of e.passengers || [])
        if (p.who?.type === "person") s.add(p.who.personId);
    for (const pm of allPayments)
      if (pm.who?.type === "person") s.add(pm.who.personId);
    return s;
  }, [allGroups, allEntries, allPayments]);

  const [theme, setTheme] = useState(getTheme());
  const [price, setPrice] = useState(null);
  const [maint, setMaint] = useState(null);
  const [newPerson, setNewPerson] = useState("");
  const [showCat, setShowCat] = useState(false);
  // Android-style two-level settings: null = category list, else the open category.
  const [category, setCategory] = useState(null);
  const [driveConnecting, setDriveConnecting] = useState(false);
  // When connecting Drive finds data on both sides, hold the conflict here so the
  // comparison sheet can render (#5). { local, remoteCounts, remote, etag }.
  const [driveConflict, setDriveConflict] = useState(null);
  const [driveConflictBusy, setDriveConflictBusy] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const fileRef = useRef(null);
  const syncStatus = useSyncStatus();

  // Whether this device can do biometric auth (gates the App Lock toggle).
  useEffect(() => {
    let alive = true;
    biometricAvailable().then((ok) => alive && setBioAvailable(ok));
    return () => {
      alive = false;
    };
  }, []);

  // While a settings category is open, hardware-back returns to the list instead
  // of exiting the app (Android). Cleared when leaving Settings or the category.
  useEffect(() => {
    setBackHandler(
      category
        ? () => {
            setCategory(null);
            return true;
          }
        : null
    );
    return () => setBackHandler(null);
  }, [category, setBackHandler]);

  // Seed the editable fields once from settings. Using null (not "") as the
  // "not seeded yet" marker means clearing the field back to empty sticks -
  // an empty string won't get re-filled on the next render (#14).
  useEffect(() => {
    if (!settings) return;
    setPrice((p) => (p == null ? String(settings.defaultFuelPricePerLiter) : p));
    setMaint((m) => (m == null ? String(settings.defaultMaintenancePct ?? 10) : m));
  }, [settings]);

  if (!settings) return <ScreenLoading />;

  // No `cleared` filter any more - that middle state is gone, so anything an
  // older build collapsed into a stub shows up here again, ready to restore or
  // delete. Leaving it filtered out would strand those rows unreachable.
  const archivedPeople = allPeople.filter((p) => p.isArchived);
  const archivedGroups = allGroups.filter((g) => g.isArchived);

  function onTheme(next) {
    setTheme(next);
    if (next !== getTheme()) toggleTheme();
  }

  async function savePrice() {
    const v = Number(price);
    if (String(price).trim() === "" || !(v > 0)) {
      toast("Fuel price can't be empty - kept your previous value", "error");
      setPrice(String(settings.defaultFuelPricePerLiter));
      return;
    }
    await updateSettings({ defaultFuelPricePerLiter: v });
    toast("Default fuel price saved");
  }

  async function saveSplitMethod(m) {
    await updateSettings({ defaultSplitMethod: m });
    toast("Default split method saved");
  }

  async function saveMaint() {
    const v = Number(maint);
    if (String(maint).trim() === "" || !(v >= 0)) {
      toast("Markup can't be empty - kept your previous value", "error");
      setMaint(String(settings.defaultMaintenancePct ?? 10));
      return;
    }
    await updateSettings({ defaultMaintenancePct: v });
    toast("Maintenance markup saved");
  }

  async function saveCurrency(code) {
    const c = CURRENCIES.find((x) => x.code === code);
    if (!c) return;
    await updateSettings({ currency: c.code, currencySymbol: c.symbol });
    toast(`Currency set to ${c.code}`);
  }

  async function saveDateFormat(fmt) {
    await updateSettings({ dateFormat: fmt });
    toast("Date format updated");
  }

  async function saveUpcomingWindow(win) {
    await updateSettings({ upcomingWindow: win });
    toast("Upcoming trips view updated");
  }

  async function toggleSyncCard(on) {
    await updateSettings({ syncStatusCard: on });
  }

  // Any payment-reminder toggle: enabling one asks for permission up front,
  // then persist + reschedule from the fresh settings.
  async function savePaymentReminder(patch, enabling) {
    if (enabling) {
      const granted = await ensureNotificationPermission();
      if (!granted) {
        toast("Allow notifications in system settings to get reminders.", "error");
        return;
      }
    }
    const next = await updateSettings(patch);
    await syncPaymentReminders(next);
    toast("Payment reminders updated");
  }

  async function toggleRefuelReminder(on) {
    if (on) {
      const granted = await ensureNotificationPermission();
      if (!granted) {
        toast("Allow notifications in system settings to get reminders.", "error");
        return;
      }
    }
    await updateSettings({ refuelReminder: on });
    await syncRefuelReminder(on);
    toast(on ? "Refuel reminders on" : "Refuel reminders off");
  }

  async function toggleAppLock(on) {
    // Turning it ON requires one successful biometric check up front, so we
    // never lock the user out with a sensor that doesn't actually work for them.
    if (on) {
      const ok = await verifyBiometric();
      if (!ok) {
        toast("Couldn't verify - app lock not enabled.", "error");
        return;
      }
    }
    await updateSettings({ appLock: on });
    toast(on ? "App lock on" : "App lock off");
  }

  async function addNewPerson() {
    const nm = newPerson.trim();
    if (!nm) return;
    try {
      await createPerson(nm);
      setNewPerson("");
      toast(`Added ${nm}`);
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function archivePerson(p, hasHistory) {
    // Match the dialog/toast to the real outcome: someone on any past entry or
    // payment is archived (kept for history); one with no history is deleted.
    const ok = await askConfirm({
      title: hasHistory ? `Archive ${p.name}?` : `Remove ${p.name}?`,
      body: hasHistory
        ? "They'll be hidden from pickers but stay on every past entry they're on. You can restore them here anytime."
        : "They have no history yet, so they'll be deleted. You can always add them again later.",
      confirmLabel: hasHistory ? "Archive" : "Remove",
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await removePerson(p.id);
      toast(res === "archived" ? `${p.name} archived` : `${p.name} removed`);
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function onRestoreGroup(g) {
    try {
      await restoreGroup(g.id);
      toast(`${g.name} restored`);
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function onRestorePerson(p) {
    try {
      await restorePerson(p.id);
      toast(`${p.name} restored`);
    } catch (e) {
      toast(e.message, "error");
    }
  }


  async function onPermaDeleteGroup(g) {
    const ok = await askConfirm({
      title: `Delete ${g.name} forever?`,
      body: "This removes it AND every refuel, payment and credit under it, permanently. Your fuel spend and history totals will drop by whatever this car accounted for. This cannot be undone.",
      confirmLabel: "Delete forever",
      danger: true,
    });
    if (!ok) return;
    try {
      await permanentlyDeleteGroup(g.id);
      toast(`${g.name} deleted permanently`);
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function onPermaDeletePerson(p) {
    const ok = await askConfirm({
      title: `Delete ${p.name} forever?`,
      body: "This takes them off every refuel and deletes their payments and credit for good. Everyone else keeps owing exactly what they owe now, so those refuels will no longer add up to their full cost - you absorb this person's share. This cannot be undone.",
      confirmLabel: "Delete forever",
      danger: true,
    });
    if (!ok) return;
    try {
      await permanentlyDeletePerson(p.id);
      toast(`${p.name} deleted permanently`);
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function onClearAll() {
    const first = await askConfirm({
      title: "Erase everything on this device?",
      body: "This permanently deletes ALL your cars, carpools, people, refuels and payments. Export a JSON backup first if there's any chance you'll want it back.",
      confirmLabel: "Continue",
      cancelLabel: "Keep my data",
      danger: true,
    });
    if (!first) return;
    const second = await askConfirm({
      title: "Are you absolutely sure?",
      body: "There is no undo. The moment you confirm, every last refuel and payment is gone.",
      confirmLabel: "Yes, delete everything",
      cancelLabel: "No, stop",
      danger: true,
    });
    if (!second) return;
    try {
      await clearAllData();
      toast("All data cleared. Starting fresh.");
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function onConnectDrive() {
    setDriveConnecting(true);
    try {
      const res = await connectAndPrepare();
      if (res.status === "conflict") {
        await handleDriveConflict(res);
      } else {
        toast("Google Drive connected & synced");
      }
    } catch (e) {
      toast(e.message || "Could not connect to Google Drive", "error");
    } finally {
      setDriveConnecting(false);
    }
  }

  // When this device AND Drive both already hold data, show the comparison sheet
  // (#5) so the user can see each side and choose. Replace is destructive, so it
  // still needs a second explicit confirmation; closing the sheet falls back to
  // a safe merge, so an accidental dismiss can never wipe local data.
  function handleDriveConflict(res) {
    setDriveConflict(res);
  }
  async function conflictMerge() {
    const c = driveConflict;
    if (!c) return;
    setDriveConflictBusy(true);
    try {
      await resolveConflict("merge", c.remote, c.etag);
      toast("Merged and synced");
    } catch (e) {
      toast(e.message || "Sync failed", "error");
    } finally {
      setDriveConflict(null);
      setDriveConflictBusy(false);
    }
  }
  async function conflictReplace() {
    const c = driveConflict;
    if (!c) return;
    const ok = await askConfirm({
      title: "Replace this device's data?",
      body: "This deletes what's only on this device and uses Google Drive's copy instead. This can't be undone.",
      confirmLabel: "Replace with Drive's copy",
      cancelLabel: "Back",
      danger: true,
    });
    if (!ok) return; // stay on the comparison sheet
    setDriveConflictBusy(true);
    try {
      await resolveConflict("replace", c.remote, c.etag);
      toast("This device now matches Google Drive");
    } catch (e) {
      toast(e.message || "Sync failed", "error");
    } finally {
      setDriveConflict(null);
      setDriveConflictBusy(false);
    }
  }

  async function onDisconnectDrive() {
    const ok = await askConfirm({
      title: "Disconnect Google Drive?",
      body: "Your data stays on this device. The shared snapshot remains in Drive and other connected devices can still sync to it.",
      confirmLabel: "Disconnect",
      danger: false,
    });
    if (!ok) return;
    try {
      await disconnect();
      toast("Google Drive disconnected");
    } catch (e) {
      toast(e.message || "Could not disconnect", "error");
    }
  }

  async function onSyncNow() {
    try {
      await syncNow({ allowInteractive: true });
    } catch (e) {
      toast(e.message || "Sync failed", "error");
    }
  }

  async function onDeleteDriveBackup() {
    const ok = await askConfirm({
      title: "Delete backup from Google Drive?",
      body: "This permanently removes the CarPawl backup stored in your Google Drive, and disconnects this device so it won't just re-upload. Your data on THIS device is not touched.",
      confirmLabel: "Delete backup & disconnect",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteRemoteFile({ allowInteractive: true });
      await disconnect();
      toast("Drive backup deleted");
    } catch (e) {
      toast(e.message || "Could not delete the Drive backup", "error");
    }
  }

  async function onExport() {
    try {
      const { delivered } = await exportToFile();
      toast(delivered === "shared" ? "Backup ready to save/send 💾" : "Backup downloaded 💾");
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function onImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    let backup;
    try {
      backup = await readBackupFile(file);
    } catch (err) {
      toast(err.message, "error");
      return;
    }
    const d = backup.data;
    const ok = await askConfirm({
      title: "Replace everything with this backup?",
      body: `This wipes what's on this device and restores ${d.people.length} people, ${d.groups.length} groups, ${d.entries.length} refuels and ${d.payments.length} payments from the file. This can't be undone.`,
      confirmLabel: "Restore & replace",
      danger: true,
    });
    if (!ok) return;
    try {
      const summary = await restoreFromBackup(backup);
      toast(`Restored ${summary.entries} refuels from backup ✅`);
    } catch (err) {
      toast(err.message, "error");
    }
  }

  // Android-style settings: a list of categories, then a detail page per one.
  // Native-only categories are hidden off-device via `show`.
  const CATEGORIES = [
    { key: "appearance", label: "Appearance", hint: "Theme", icon: <Palette size={20} /> },
    { key: "fuel", label: "Fuel & format", hint: "Default fuel price, currency, date format", icon: <Fuel size={20} /> },
    { key: "splitting", label: "Carpool splitting", hint: "Default split method and markup", icon: <SlidersHorizontal size={20} /> },
    { key: "reminders", label: "Reminders", hint: "Refuel nudges", icon: <Bell size={20} />, show: isNative() },
    { key: "privacy", label: "Privacy", hint: "Biometric app lock", icon: <Fingerprint size={20} />, show: isNative() && bioAvailable },
    { key: "people", label: "People", hint: "Passengers and archived items", icon: <Users size={20} /> },
    { key: "sync", label: "Google Drive sync", hint: "Sync across your devices", icon: <Cloud size={20} /> },
    { key: "backup", label: "Backup & restore", hint: "Export or restore a JSON file", icon: <Database size={20} /> },
    { key: "about", label: "About CarPawl", hint: "Version, what's new & how it works", icon: <Info size={20} /> },
    { key: "danger", label: "Danger zone", hint: "Erase all data on this device", icon: <AlertTriangle size={20} />, danger: true },
  ];
  const activeCat = CATEGORIES.find((c) => c.key === category);

  // At-a-glance badge on the Drive sync row: flag it when disconnected or the
  // last sync errored, so the user notices without opening the category.
  const driveConnected = Boolean(settings?.gdriveConnected);
  const driveError = syncStatus?.state === "error";
  const driveNeedsAttention = !driveConnected || driveError;

  return (
    <div className="app-shell stagger">
      {/* Header: category list, or a detail page with a back button. */}
      {category === null ? (
        <header className="screen-head">
          <div className="head-morph" key="root">
            <p className="screen-head__kicker">Preferences & data</p>
            <h1 className="screen-head__title">Settings</h1>
          </div>
        </header>
      ) : (
        <header className="screen-head settings-detail-head">
          <button
            className="icon-btn settings-back"
            type="button"
            onClick={() => setCategory(null)}
            aria-label="Back to settings"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="head-morph" key={category}>
            <p className="screen-head__kicker">Settings</p>
            <h1 className="screen-head__title">{activeCat?.label}</h1>
          </div>
        </header>
      )}

      {/* ---------- Category list ---------- */}
      {category === null && (
        <>
          {/* Get the Android app - only in an Android web browser. */}
          {isAndroidWeb() && (
            <section className="section-block">
              <div className="detail-panel">
                <div className="get-app-row">
                  <Smartphone size={20} style={{ flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <p className="get-app-row__title">Get the CarPawl app</p>
                    <p className="field-hint" style={{ margin: 0 }}>
                      Install the Android app for durable storage and native features.
                    </p>
                  </div>
                </div>
                <a
                  className="cta-primary btn-block"
                  href={ANDROID_RELEASE_PAGE}
                  target="_blank"
                  rel="noreferrer"
                  style={{ marginTop: "0.7rem" }}
                >
                  <Download size={16} /> Get the Android app
                </a>
                <p className="field-hint" style={{ marginTop: "0.5rem", fontSize: "0.66rem" }}>
                  Opens the GitHub release page - tap the .apk there to download.
                  Android may warn about installing outside the Play Store; that's
                  expected for a direct download.
                </p>
              </div>
            </section>
          )}

          <nav className="settings-cats">
            {CATEGORIES.filter((c) => c.show !== false).map((c) => (
              <button
                key={c.key}
                className="settings-cat-row"
                type="button"
                onClick={() => setCategory(c.key)}
              >
                <span className={"settings-cat-row__icon" + (c.danger ? " is-danger" : "")}>
                  {c.icon}
                </span>
                <span className="settings-cat-row__text">
                  <span className="settings-cat-row__label">{c.label}</span>
                  <span className="settings-cat-row__hint">{c.hint}</span>
                </span>
                {c.key === "sync" && driveNeedsAttention && (
                  <span
                    className={"settings-cat-status" + (driveError ? " is-error" : "")}
                    title={driveError ? "Sync error - open to review" : "Not connected"}
                  >
                    <CloudOff size={15} />
                  </span>
                )}
                <ChevronRight size={18} className="settings-cat-row__chev" />
              </button>
            ))}
          </nav>
        </>
      )}

      {/* ---------- Category detail (CSS shows only the active category) ---------- */}
      {category !== null && (
      <div className="settings-detail" data-active={category}>
      {/* Appearance */}
      <section className="section-block" data-cat="appearance">
        <h2 className="section-block__title" style={{ marginBottom: "0.6rem" }}>
          Appearance
        </h2>
        <div className="detail-panel field-grid">
          <Field label="Theme">
            <Segment
              value={theme}
              onChange={onTheme}
              options={[
                { value: "dark", label: <span className="seg-ico"><Moon size={14} /> Dark</span> },
                { value: "light", label: <span className="seg-ico"><Sun size={14} /> Light</span> },
              ]}
            />
          </Field>
          <Field
            label="Show upcoming trips"
            hint="Trips scheduled further ahead than this are tucked behind a 'show more' in your lists. They still count once their date arrives."
          >
            <Select
              value={settings.upcomingWindow || "1mo"}
              onChange={saveUpcomingWindow}
              options={UPCOMING_WINDOW_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
          </Field>
        </div>
        {/* Fill the empty space with the mascot: its pupils dilate in the dark
            and constrict in the light, and it reacts to any button tap. */}
        <div className="appearance-cat">
          <CyberCat
            size={190}
            theme={theme}
            reactOnAnyClick
            hint={theme === "dark" ? "Eyes wide in the dark" : "Squinting in the light"}
          />
        </div>
      </section>

      {/* Fuel & formats */}
      <section className="section-block" data-cat="fuel">
        <h2 className="section-block__title" style={{ marginBottom: "0.6rem" }}>
          Fuel & formats
        </h2>
        <div className="detail-panel field-grid">
          <Field
            label="Default fuel price (RM/L)"
            hint="Used for new refuels. Each entry can still override its own price."
          >
            <div className="field-inline" style={{ gridTemplateColumns: "1fr auto" }}>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={price ?? ""}
                onChange={(e) => setPrice(e.target.value)}
              />
              <button className="action-btn" type="button" onClick={savePrice}>
                <Check size={15} /> Save
              </button>
            </div>
          </Field>
          <div className="field-inline field-pair-responsive">
            <Field label="Currency">
              <Select
                value={settings.currency || "MYR"}
                onChange={saveCurrency}
                options={CURRENCIES.map((c) => ({
                  value: c.code,
                  label: `${c.symbol} · ${c.code}`,
                }))}
              />
            </Field>
            <Field label="Date format">
              <Select
                value={settings.dateFormat || "DD-MM-YYYY"}
                onChange={saveDateFormat}
                options={DATE_FORMATS.map((f) => ({ value: f, label: f }))}
              />
            </Field>
          </div>
          <p className="field-hint">
            Amounts show as{" "}
            <strong>{settings.currencySymbol || "RM"}12.50</strong>, dates as{" "}
            <strong>{formatDate("2026-07-04")}</strong>.
          </p>
        </div>
      </section>

      {/* Splitting */}
      <section className="section-block" data-cat="splitting">
        <h2 className="section-block__title" style={{ marginBottom: "0.6rem" }}>
          Carpool splitting
        </h2>
        <div className="detail-panel field-grid">
          <Field
            label={
              <span>
                Default split method{" "}
                <InfoTip
                  term={
                    settings.defaultSplitMethod === "equal"
                      ? "equalSplit"
                      : settings.defaultSplitMethod === "driver_comp"
                      ? "customSplit"
                      : "distanceSplit"
                  }
                />
              </span>
            }
            hint={SPLIT_METHOD_HINTS[settings.defaultSplitMethod || "distance"]}
          >
            <Segment
              value={settings.defaultSplitMethod || "distance"}
              onChange={saveSplitMethod}
              options={SPLIT_METHOD_OPTIONS}
            />
          </Field>
          <Field
            label={
              <span>
                Maintenance markup (%) <InfoTip term="maintenanceMarkup" />
              </span>
            }
            hint="Add a default maintenance markup on top of fuel + parking for Custom Split method. Each refuel can override it."
          >
            <div className="field-inline" style={{ gridTemplateColumns: "1fr auto" }}>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="1"
                value={maint ?? ""}
                onChange={(e) => setMaint(e.target.value)}
              />
              <button className="action-btn" type="button" onClick={saveMaint}>
                <Check size={15} /> Save
              </button>
            </div>
          </Field>
        </div>
      </section>

      {/* Reminders (native only - local notifications aren't meaningful in a
          browser tab, so the section is hidden off-device). */}
      {isNative() && (
        <section className="section-block" data-cat="reminders">
          <h2 className="section-block__title" style={{ marginBottom: "0.6rem" }}>
            Reminders
          </h2>
          <div className="detail-panel">
            <Field
              label={
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                  <Bell size={14} /> Refuel reminder
                </span>
              }
              hint="A gentle nudge if you haven't logged a refuel in about 10 days. Only fires when you've gone quiet - staying active pushes it back automatically."
            >
              <Segment
                value={settings.refuelReminder ? "on" : "off"}
                onChange={(v) => toggleRefuelReminder(v === "on")}
                options={[
                  { value: "on", label: "On" },
                  { value: "off", label: "Off" },
                ]}
              />
            </Field>
          </div>

          <div className="detail-panel field-grid" style={{ marginTop: "0.8rem" }}>
            <Field
              label="Before a scheduled trip"
              hint="Get a heads-up this far ahead of an upcoming (future-dated) trip."
            >
              <Select
                value={settings.upcomingReminderLead || "off"}
                onChange={(v) => savePaymentReminder({ upcomingReminderLead: v }, v !== "off")}
                options={[
                  { value: "off", label: "Off" },
                  { value: "1d", label: "1 day before" },
                  { value: "3d", label: "3 days before" },
                  { value: "7d", label: "1 week before" },
                ]}
              />
            </Field>
            <Field
              label="On the trip's day"
              hint="A reminder on the day a scheduled trip becomes due, to settle it."
            >
              <Segment
                value={settings.upcomingArrivalReminder ? "on" : "off"}
                onChange={(v) =>
                  savePaymentReminder({ upcomingArrivalReminder: v === "on" }, v === "on")
                }
                options={[
                  { value: "on", label: "On" },
                  { value: "off", label: "Off" },
                ]}
              />
            </Field>
            <Field
              label="Unpaid-balance nudge"
              hint="While anyone still owes (or you owe), get a periodic reminder on this interval."
            >
              <Select
                value={settings.debtNudgeInterval || "off"}
                onChange={(v) => savePaymentReminder({ debtNudgeInterval: v }, v !== "off")}
                options={[
                  { value: "off", label: "Off" },
                  { value: "7d", label: "Every 7 days" },
                  { value: "14d", label: "Every 14 days" },
                  { value: "30d", label: "Every 30 days" },
                ]}
              />
            </Field>
          </div>
        </section>
      )}

      {/* Privacy - biometric app lock (native + a sensor is enrolled). */}
      {isNative() && bioAvailable && (
        <section className="section-block" data-cat="privacy">
          <h2 className="section-block__title" style={{ marginBottom: "0.6rem" }}>
            Privacy
          </h2>
          <div className="detail-panel">
            <Field
              label={
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                  <Fingerprint size={14} /> App lock
                </span>
              }
              hint="Require your fingerprint or face to open CarPawl - on launch and each time you return to it."
            >
              <Segment
                value={settings.appLock ? "on" : "off"}
                onChange={(v) => toggleAppLock(v === "on")}
                options={[
                  { value: "on", label: "On" },
                  { value: "off", label: "Off" },
                ]}
              />
            </Field>
          </div>
        </section>
      )}

      {/* People */}
      <section className="section-block" data-cat="people">
        <h2 className="section-block__title" style={{ marginBottom: "0.6rem" }}>
          People
        </h2>
        <div className="detail-panel">
          <Field label="Add a person">
            <div className="add-person-row">
              <input
                type="text"
                placeholder="Their name, e.g. Alex"
                value={newPerson}
                onChange={(e) => setNewPerson(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addNewPerson();
                  }
                }}
              />
              <button
                className="cta-primary"
                type="button"
                onClick={addNewPerson}
                disabled={!newPerson.trim()}
              >
                <Plus size={16} /> Add
              </button>
            </div>
          </Field>

          {activePeople.length === 0 ? (
            <p className="field-hint" style={{ marginTop: "0.8rem" }}>
              No people yet. Add carpool passengers here, or on the fly when logging a
              refuel.
            </p>
          ) : (
            <div className="people-list">
              {activePeople.map((p) => {
                const hasHistory = peopleWithHistory.has(p.id);
                return (
                  <PersonRow
                    key={p.id}
                    person={p}
                    hasHistory={hasHistory}
                    onArchive={() => archivePerson(p, hasHistory)}
                    onToast={toast}
                  />
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Archived (part of the People category) */}
      <section className="section-block" data-cat="people">
        <h2 className="section-block__title settings-keep-head" style={{ marginBottom: "0.6rem" }}>
          Archived
        </h2>
        {archivedGroups.length === 0 && archivedPeople.length === 0 ? (
          <div className="detail-panel">
            <p className="field-hint" style={{ margin: 0, textAlign: "center" }}>
              Nothing archived yet. Cars and people you archive land here, ready to
              restore.
            </p>
          </div>
        ) : (
          <>
            <div className="detail-panel people-list">
              {archivedGroups.map((g) => (
                <div className="people-row" key={g.id}>
                  <span className="people-row__name">
                    <Car size={15} /> {g.name}
                  </span>
                  <div className="people-row__actions">
                    <button
                      className="mini-btn"
                      type="button"
                      onClick={() => onRestoreGroup(g)}
                      aria-label={`Restore ${g.name}`}
                      title="Restore"
                    >
                      <ArchiveRestore size={13} /> <span className="mini-btn__label">Restore</span>
                    </button>
                    <button
                      className="mini-btn mini-btn--danger"
                      type="button"
                      onClick={() => onPermaDeleteGroup(g)}
                      aria-label={`Delete ${g.name} forever`}
                      title="Delete forever"
                    >
                      <Trash2 size={13} /> <span className="mini-btn__label">Delete</span>
                    </button>
                  </div>
                </div>
              ))}
              {archivedPeople.map((p) => (
                <div className="people-row" key={p.id}>
                  <span className="people-row__name">
                    <User size={15} /> {p.name}
                  </span>
                  <div className="people-row__actions">
                    <button
                      className="mini-btn"
                      type="button"
                      onClick={() => onRestorePerson(p)}
                      aria-label={`Restore ${p.name}`}
                      title="Restore"
                    >
                      <ArchiveRestore size={13} /> <span className="mini-btn__label">Restore</span>
                    </button>
                    <button
                      className="mini-btn mini-btn--danger"
                      type="button"
                      onClick={() => onPermaDeletePerson(p)}
                      aria-label={`Delete ${p.name} forever`}
                      title="Delete forever"
                    >
                      <Trash2 size={13} /> <span className="mini-btn__label">Delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="field-hint" style={{ textAlign: "center", marginTop: "0.4rem" }}>
              “Restore” puts it back in use. “Delete” erases it and its history
              for good.
            </p>
          </>
        )}
      </section>

      {/* Google Drive sync */}
      <section className="section-block" data-cat="sync">
        <h2 className="section-block__title" style={{ marginBottom: "0.6rem" }}>
          Google Drive sync
        </h2>
        <div className="detail-panel field-grid">
          <DriveStatus
            syncStatus={syncStatus}
            settings={settings}
            connecting={driveConnecting}
            onConnect={onConnectDrive}
            onDisconnect={onDisconnectDrive}
            onSyncNow={onSyncNow}
            onDeleteBackup={onDeleteDriveBackup}
          />
        </div>
        <div className="detail-panel field-grid" style={{ marginTop: "0.8rem" }}>
          <Field
            label="Sync status card"
            hint="Show a small floating card at the top of the app while a sync runs. Turn it off to sync quietly."
          >
            <Segment
              value={settings.syncStatusCard === false ? "off" : "on"}
              onChange={(v) => toggleSyncCard(v === "on")}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </Field>
        </div>
      </section>

      {/* Backup & restore */}
      <section className="section-block" data-cat="backup">
        <h2 className="section-block__title" style={{ marginBottom: "0.6rem" }}>
          Backup &amp; restore
        </h2>
        <div className="detail-panel field-grid">
          <p className="field-hint" style={{ marginTop: "0" }}>
            Export a JSON backup regularly and keep it somewhere safe.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <button className="cta-primary btn-block" type="button" onClick={onExport}>
              <Upload size={16} /> Export JSON
            </button>

            <button
              className="cta-secondary btn-block"
              type="button"
              onClick={() => fileRef.current?.click()}
            >
              <Download size={16} /> Restore JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={onImportFile}
            />
          </div>
          <p className="field-hint" style={{ marginTop: "0.6rem" }}>
            Restoring a backup replaces everything currently on this device.
          </p>
        </div>
      </section>

      {/* About CarPawl: name/version, update check, GitHub, what's new, how it
          works (each row opens its own sheet) (BATCH_3 #1). */}
      <section className="section-block" data-cat="about">
        <div className="about-head">
          <img
            src="/CarPawl-icon.png"
            alt="CarPawl"
            className="about-head__logo"
            width={44}
            height={44}
          />
          <div>
            <h2 className="about-head__name">{APP_NAME}</h2>
            {/* Say the channel out loud - a bug report is much easier to place
                when you know which build it came from. */}
            <p className="about-head__ver">
              Version {APP_VERSION}
              {IS_BETA ? " · beta channel" : ""}
            </p>
          </div>
        </div>

        <div className="about-links">
          {/* Native-only; renders nothing on web. */}
          <CheckUpdateButton />
          <a className="about-row" href={GITHUB_URL} target="_blank" rel="noreferrer">
            <span className="about-row__lead">
              <Share2 size={16} />
              GitHub page
            </span>
            <ChevronRight size={16} className="about-row__chev" />
          </a>
          <WhatsNewButton />
          <HowItWorksButton />
        </div>
      </section>

      {/* Danger zone: wipe everything. Per-item permanent deletes live on the
          Archived rows, next to Restore. */}
      <section className="section-block" data-cat="danger">
        <h2 className="section-block__title" style={{ marginBottom: "0.6rem", color: "#ff6b81" }}>
          Danger zone
        </h2>

        <div className="detail-panel">
          <p className="field-hint" style={{ marginTop: 0 }}>
            Permanently erase every car, carpool, person, refuel and payment on
            this device. Export a backup first - this cannot be undone.
          </p>
          <button
            className="action-btn btn-block btn-danger"
            type="button"
            onClick={onClearAll}
            style={{ marginTop: "0.8rem" }}
          >
            <Trash2 size={16} /> Clear all data
          </button>
        </div>
      </section>
      </div>
      )}

      {/* Easter egg + version - only on the category list. */}
      {category === null && (
        <div className="settings-footer">
          <button
            className="wordmark-btn"
            type="button"
            onClick={() => setShowCat((s) => !s)}
            aria-label="CarPawl"
          >
            CarPawl <PawPrint size={14} />
          </button>
          {showCat && (
            <div className="cat-egg">
              <CyberCat size={110} theme={theme} reactOnAnyClick hint="you found me!" />
            </div>
          )}
          <CheckUpdateButton />
          <p className="faint" style={{ fontSize: "0.68rem" }}>
            v{APP_VERSION} · Made by Zaiki
          </p>
        </div>
      )}

      {driveConflict && (
        <DriveConflictSheet
          local={driveConflict.local}
          remote={driveConflict.remoteCounts}
          busy={driveConflictBusy}
          onMerge={conflictMerge}
          onReplace={conflictReplace}
          onClose={conflictMerge}
        />
      )}
    </div>
  );
}

function PersonRow({ person, hasHistory, onArchive, onToast }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(person.name);

  async function save() {
    const nm = name.trim();
    if (!nm) return;
    try {
      await renamePerson(person.id, nm);
      setEditing(false);
      onToast("Name updated");
    } catch (e) {
      onToast(e.message, "error");
    }
  }

  if (editing) {
    return (
      <div className="people-row">
        <input
          className="people-row__edit"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <div className="people-row__actions">
          <button className="mini-btn" type="button" onClick={save} aria-label="Save name" title="Save">
            <Check size={13} /> <span className="mini-btn__label">Save</span>
          </button>
          <button
            className="mini-btn"
            type="button"
            onClick={() => {
              setName(person.name);
              setEditing(false);
            }}
            aria-label="Cancel"
            title="Cancel"
          >
            <X size={13} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="people-row">
      <span className="people-row__name">
        <User size={15} /> {person.name}
      </span>
      <div className="people-row__actions">
        <button
          className="mini-btn"
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Rename ${person.name}`}
          title="Rename"
        >
          <Pencil size={13} /> <span className="mini-btn__label">Rename</span>
        </button>
        <button
          className="mini-btn mini-btn--danger"
          type="button"
          onClick={onArchive}
          aria-label={`${hasHistory ? "Archive" : "Remove"} ${person.name}`}
          title={hasHistory ? "Archive" : "Remove"}
        >
          {hasHistory ? <Archive size={13} /> : <Trash2 size={13} />}{" "}
          <span className="mini-btn__label">{hasHistory ? "Archive" : "Remove"}</span>
        </button>
      </div>
    </div>
  );
}

/** Format a last-synced ISO timestamp as a human-readable relative string. */
function relativeTime(isoStr) {
  if (!isoStr) return null;
  const diffMs = Date.now() - Date.parse(isoStr);
  if (diffMs < 0) return "just now";
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 10) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

/**
 * Google Drive sync status panel
 * Shows: connection status, connect/disconnect/sync-now buttons, last-synced time, errors.
 */
function DriveStatus({ syncStatus, settings, connecting, onConnect, onDisconnect, onSyncNow, onDeleteBackup }) {
  const connected = Boolean(settings?.gdriveConnected);
  const email = settings?.gdriveUserEmail || null;
  const isSyncing = syncStatus?.state === "syncing" || connecting;
  const lastSynced = relativeTime(syncStatus?.lastSyncedAt || settings?.lastSyncedAt);
  const hasError = syncStatus?.state === "error" && syncStatus?.error;
  // A cached file id means a backup exists in Drive (set after the first sync).
  const hasDriveBackup = Boolean(settings?.gdriveFileId);

  if (!connected) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }} className="field-hint">
          <CloudOff size={15} style={{ flexShrink: 0 }} />
          <span>Not connected. Your data is only on this device.</span>
        </div>
        <p className="field-hint" style={{ marginTop: 0 }}>
          Connect to keep your refuels and payments in sync across devices.
          Uses your Google Drive's hidden AppData folder, never touches your regular Drive files.
        </p>
        <div className="btn-row btn-row--center" style={{ gap: "0.6rem", flexDirection: "column", alignItems: "center" }}>
          <button
            className="cta-primary btn-block"
            type="button"
            onClick={onConnect}
            disabled={connecting}
          >
            {connecting ? (
              <><Loader2 size={15} className="spin" /> Connecting...</>
            ) : (
              <><Cloud size={15} /> Connect Google Drive</>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="drive-panel" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {/* Status row */}
      <div className="drive-status-row field-hint">
        <span className="drive-status-row__info">
          <Cloud size={15} style={{ flexShrink: 0, color: hasError ? "var(--color-error, #ff6b81)" : "var(--color-success, #4caf50)" }} />
          <span className="drive-status-text" title={email ? `Connected as ${email}` : "Connected"}>
            Connected{email ? ` as ${email}` : ""}
          </span>
        </span>
        <button
          className="mini-btn drive-mini-btn mini-btn--danger"
          type="button"
          onClick={onDisconnect}
          disabled={isSyncing}
          title="Disconnect Drive"
        >
          <CloudOff size={13} /> <span className="mini-btn__label">Disconnect</span>
        </button>
      </div>

      {/* Last synced */}
      {lastSynced && !hasError && (
        <p className="field-hint" style={{ marginTop: 0 }}>
          Last synced: {lastSynced}
        </p>
      )}

      {/* Error message */}
      {hasError && (
        <p className="field-hint" style={{ marginTop: 0, color: "var(--color-error, #ff6b81)" }}>
          {syncStatus.error}
        </p>
      )}

      {/* Action buttons */}
      <div className="btn-row btn-row--center" style={{ gap: "0.6rem", flexDirection: "column", alignItems: "center" }}>
        <button
          className="cta-secondary btn-block"
          type="button"
          onClick={onSyncNow}
          disabled={isSyncing}
          title="Sync now"
        >
          {isSyncing ? (
            <><Loader2 size={14} className="spin" /> Loading...</>
          ) : (
            <><RefreshCw size={14} /> Sync now</>
          )}
        </button>

        <button
          className="cta-secondary btn-danger btn-block"
          type="button"
          onClick={onDeleteBackup}
          disabled={isSyncing || !hasDriveBackup}
          title={hasDriveBackup ? "Delete the backup stored in Google Drive" : "No backup in Google Drive yet"}
        >
          <Trash2 size={14} /> Delete Drive backup
        </button>
      </div>
    </div>
  );
}

