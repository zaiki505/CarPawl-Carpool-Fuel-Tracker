import React, { useEffect, useRef, useState } from "react";
import { useSettings, usePeople, useGroups } from "../db/hooks.js";
import { useApp } from "../app/AppContext.jsx";
import { updateSettings } from "../db/db.js";
import {
  createPerson,
  renamePerson,
  removePerson,
  restorePerson,
  restoreGroup,
  clearPerson,
  clearGroup,
  clearAllData,
  permanentlyDeleteGroup,
  permanentlyDeletePerson,
} from "../db/actions.js";
import { exportToFile, readBackupFile, restoreFromBackup } from "../lib/backup.js";
import { getTheme, toggleTheme } from "../lib/theme.js";
import { Segment, Field } from "../components/ui/Primitives.jsx";
import { ScreenLoading } from "../components/ui/ScreenLoading.jsx";
import { Select } from "../components/ui/Select.jsx";
import { SPLIT_METHOD_OPTIONS, SPLIT_METHOD_HINTS } from "../lib/splitMethods.js";
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
} from "../components/ui/Icons.jsx";

/* Settings: appearance, fuel/format prefs, default fuel price, the global people list, archived items with
   restore, JSON backup/restore, and the CyberCat easter egg. */
export function Settings() {
  const settings = useSettings();
  const activePeople = usePeople() || [];
  const allPeople = usePeople({ includeArchived: true }) || [];
  const allGroups = useGroups({ includeArchived: true }) || [];
  const { toast, askConfirm } = useApp();

  const [theme, setTheme] = useState(getTheme());
  const [price, setPrice] = useState(null);
  const [maint, setMaint] = useState(null);
  const [newPerson, setNewPerson] = useState("");
  const [showCat, setShowCat] = useState(false);
  const fileRef = useRef(null);

  // Seed the editable fields once from settings. Using null (not "") as the
  // "not seeded yet" marker means clearing the field back to empty sticks -
  // an empty string won't get re-filled on the next render (#14).
  useEffect(() => {
    if (!settings) return;
    setPrice((p) => (p == null ? String(settings.defaultFuelPricePerLiter) : p));
    setMaint((m) => (m == null ? String(settings.defaultMaintenancePct ?? 10) : m));
  }, [settings]);

  if (!settings) return <ScreenLoading />;

  const archivedPeople = allPeople.filter((p) => p.isArchived && !p.cleared);
  const archivedGroups = allGroups.filter((g) => g.isArchived && !g.cleared);
  const clearedPeople = allPeople.filter((p) => p.cleared);
  const clearedGroups = allGroups.filter((g) => g.cleared);

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

  async function archivePerson(p) {
    const ok = await askConfirm({
      title: `Archive ${p.name}?`,
      body: "They'll disappear from pickers but stay on any past entries. You can restore them here anytime.",
      confirmLabel: "Archive",
      danger: true,
    });
    if (!ok) return;
    const res = await removePerson(p.id);
    toast(res === "archived" ? `${p.name} archived` : `${p.name} removed`);
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

  async function onClearArchivedGroup(g) {
    const ok = await askConfirm({
      title: `Clear ${g.name} from the list?`,
      body: "It'll disappear from Archived for good. Its past refuels and all your totals stay exactly as they are - only a tiny name record is kept so history still reads correctly.",
      confirmLabel: "Clear from list",
      danger: true,
    });
    if (!ok) return;
    try {
      await clearGroup(g.id);
      toast(`${g.name} cleared`);
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function onClearArchivedPerson(p) {
    const ok = await askConfirm({
      title: `Clear ${p.name} from the list?`,
      body: "They'll disappear from Archived for good. Their past refuels and all your totals stay exactly as they are - only a tiny name record is kept so history still reads correctly.",
      confirmLabel: "Clear from list",
      danger: true,
    });
    if (!ok) return;
    try {
      await clearPerson(p.id);
      toast(`${p.name} cleared`);
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function onPermaDeleteGroup(g) {
    const ok = await askConfirm({
      title: `Delete ${g.name} forever?`,
      body: "This removes it AND every refuel and payment under it, permanently. Historical totals will change. This cannot be undone.",
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
      body: "This removes them from every refuel, deletes their payments, and permanently deletes any carpool they own (with its refuels). Historical totals will change. This cannot be undone.",
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

  async function onExport() {
    try {
      await exportToFile();
      toast("Backup downloaded 💾");
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

  return (
    <div className="app-shell stagger">
      <header className="screen-head">
        <div>
          <p className="screen-head__kicker">Preferences & data</p>
          <h1 className="screen-head__title">Settings</h1>
        </div>
      </header>

      {/* Appearance */}
      <section className="section-block">
        <h2 className="section-block__title" style={{ marginBottom: "0.6rem" }}>
          Appearance
        </h2>
        <div className="detail-panel">
          <Field label="Theme">
            <Segment
              value={theme}
              onChange={onTheme}
              options={[
                { value: "dark", label: "🌙 Dark" },
                { value: "light", label: "☀️ Light" },
              ]}
            />
          </Field>
        </div>
      </section>

      {/* Fuel & formats */}
      <section className="section-block">
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
          <div className="field-inline">
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
      <section className="section-block">
        <h2 className="section-block__title" style={{ marginBottom: "0.6rem" }}>
          Carpool splitting
        </h2>
        <div className="detail-panel field-grid">
          <Field
            label="Default split method"
            hint={SPLIT_METHOD_HINTS[settings.defaultSplitMethod || "distance"]}
          >
            <Segment
              value={settings.defaultSplitMethod || "distance"}
              onChange={saveSplitMethod}
              options={SPLIT_METHOD_OPTIONS}
            />
          </Field>
          <Field
            label="Maintenance markup (%)"
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

      {/* People */}
      <section className="section-block">
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
              {activePeople.map((p) => (
                <PersonRow
                  key={p.id}
                  person={p}
                  onArchive={() => archivePerson(p)}
                  onToast={toast}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Archived */}
      <section className="section-block">
        <h2 className="section-block__title" style={{ marginBottom: "0.6rem" }}>
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
                  >
                    <ArchiveRestore size={13} /> Restore
                  </button>
                  <button
                    className="mini-btn mini-btn--danger"
                    type="button"
                    onClick={() => onClearArchivedGroup(g)}
                  >
                    <Trash2 size={13} /> Clear
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
                  >
                    <ArchiveRestore size={13} /> Restore
                  </button>
                  <button
                    className="mini-btn mini-btn--danger"
                    type="button"
                    onClick={() => onClearArchivedPerson(p)}
                  >
                    <Trash2 size={13} /> Clear
                  </button>
                </div>
              </div>
            ))}
            </div>
            <p className="field-hint" style={{ textAlign: "center", marginTop: "0.4rem" }}>
              “Clear” removes an item from this list for good but keeps history intact.
            </p>
          </>
        )}
      </section>

      {/* Backup & restore */}
      <section className="section-block">
        <h2 className="section-block__title" style={{ marginBottom: "0.6rem" }}>
          Backup & restore
        </h2>
        <div className="detail-panel field-grid">
          <p className="field-hint" style={{ marginTop: "0" }}>
              Everything lives on this device. Export a JSON backup regularly and
              keep it somewhere safe.
            </p>
          <div className="btn-row btn-row--center" style={{ gap: "0.6rem", flexDirection: "column", alignItems: "center" }}>
            <button className="cta-primary" type="button" onClick={onExport}>
              <Download size={16} /> Export JSON
            </button>
            
            <button
              className="cta-secondary"
              type="button"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={16} /> Restore JSON
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
            Google Drive backup is planned as a later add-on.
          </p>
        </div>
      </section>

      {/* Danger zone: permanent deletes + wipe everything */}
      <section className="section-block">
        <h2 className="section-block__title" style={{ marginBottom: "0.6rem", color: "#ff6b81" }}>
          Danger zone
        </h2>

        {(clearedGroups.length > 0 || clearedPeople.length > 0) && (
          <div className="detail-panel" style={{ marginBottom: "0.8rem" }}>
            <p className="field-hint" style={{ marginTop: 0 }}>
              Cleared items. Deleting permanently also removes their refuels /
              payments and changes historical totals.
            </p>
            <div className="people-list">
              {clearedGroups.map((g) => (
                <div className="people-row" key={g.id}>
                  <span className="people-row__name">
                    <Car size={15} /> {g.name}
                  </span>
                  <button
                    className="mini-btn mini-btn--danger"
                    type="button"
                    onClick={() => onPermaDeleteGroup(g)}
                  >
                    <Trash2 size={13} /> Delete forever
                  </button>
                </div>
              ))}
              {clearedPeople.map((p) => (
                <div className="people-row" key={p.id}>
                  <span className="people-row__name">
                    <User size={15} /> {p.name}
                  </span>
                  <button
                    className="mini-btn mini-btn--danger"
                    type="button"
                    onClick={() => onPermaDeletePerson(p)}
                  >
                    <Trash2 size={13} /> Delete forever
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

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

      {/* Easter egg: tap the wordmark to summon the Cyber Cat */}
      <div className="settings-footer">
        <button
          className="wordmark-btn"
          type="button"
          onClick={() => setShowCat((s) => !s)}
          aria-label="CarPawl"
        >
          CarPawl 🐾
        </button>
        {showCat && (
          <div className="cat-egg">
            <CyberCat size={110} hint="you found me!" />
          </div>
        )}
        <p className="faint" style={{ fontSize: "0.68rem" }}>
          v0.2.0 · Made by Zaiki
        </p>
      </div>
    </div>
  );
}

function PersonRow({ person, onArchive, onToast }) {
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
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <button className="mini-btn" type="button" onClick={save}>
            <Check size={13} /> Save
          </button>
          <button
            className="mini-btn"
            type="button"
            onClick={() => {
              setName(person.name);
              setEditing(false);
            }}
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
      <div style={{ display: "flex", gap: "0.4rem" }}>
        <button className="mini-btn" type="button" onClick={() => setEditing(true)}>
          <Pencil size={13} /> Rename
        </button>
        <button className="mini-btn mini-btn--danger" type="button" onClick={onArchive}>
          <Archive size={13} />
        </button>
      </div>
    </div>
  );
}
