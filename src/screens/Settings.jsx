import React, { useRef, useState } from "react";
import { useSettings, usePeople, useGroups } from "../db/hooks.js";
import { useApp } from "../app/AppContext.jsx";
import { updateSettings } from "../db/db.js";
import {
  createPerson,
  renamePerson,
  removePerson,
  restorePerson,
  restoreGroup,
} from "../db/actions.js";
import { exportToFile, readBackupFile, restoreFromBackup } from "../lib/backup.js";
import { getTheme, toggleTheme } from "../lib/theme.js";
import { Segment, Field } from "../components/ui/Primitives.jsx";
import { SPLIT_METHOD_OPTIONS, SPLIT_METHOD_HINTS } from "../lib/splitMethods.js";
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
} from "../components/ui/Icons.jsx";

/* Settings (§7.6): appearance, fuel/format prefs (MYR + DD-MM-YYYY fixed this
   build), default fuel price, the global people list, archived items with
   restore, JSON backup/restore, and the CyberCat easter egg. */
export function Settings() {
  const settings = useSettings();
  const activePeople = usePeople() || [];
  const allPeople = usePeople({ includeArchived: true }) || [];
  const allGroups = useGroups({ includeArchived: true }) || [];
  const { toast, askConfirm } = useApp();

  const [theme, setTheme] = useState(getTheme());
  const [price, setPrice] = useState("");
  const [maint, setMaint] = useState("");
  const [newPerson, setNewPerson] = useState("");
  const [showCat, setShowCat] = useState(false);
  const fileRef = useRef(null);

  if (!settings) return <div className="app-shell" />;
  if (price === "") setPrice(String(settings.defaultFuelPricePerLiter));
  if (maint === "") setMaint(String(settings.defaultMaintenancePct ?? 10));

  const archivedPeople = allPeople.filter((p) => p.isArchived);
  const archivedGroups = allGroups.filter((g) => g.isArchived);

  function onTheme(next) {
    setTheme(next);
    if (next !== getTheme()) toggleTheme();
  }

  async function savePrice() {
    const v = Number(price);
    if (!(v > 0)) return toast("Enter a valid fuel price", "error");
    await updateSettings({ defaultFuelPricePerLiter: v });
    toast("Default fuel price saved");
  }

  async function saveSplitMethod(m) {
    await updateSettings({ defaultSplitMethod: m });
    toast("Default split method saved");
  }

  async function saveMaint() {
    const v = Number(maint);
    if (!(v >= 0)) return toast("Enter a valid %", "error");
    await updateSettings({ defaultMaintenancePct: v });
    toast("Maintenance markup saved");
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
      body: `This wipes what's on this device and restores ${d.people.length} people, ${d.groups.length} groups, ${d.entries.length} fill-ups and ${d.payments.length} payments from the file. This can't be undone.`,
      confirmLabel: "Restore & replace",
      danger: true,
    });
    if (!ok) return;
    try {
      const summary = await restoreFromBackup(backup);
      toast(`Restored ${summary.entries} fill-ups from backup ✅`);
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
            hint="Used for new fill-ups. Each entry can still override its own price."
          >
            <div className="field-inline" style={{ gridTemplateColumns: "1fr auto" }}>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
              <button className="action-btn" type="button" onClick={savePrice}>
                <Check size={15} /> Save
              </button>
            </div>
          </Field>
          <div className="fixed-fmt">
            <span className="muted">Currency</span>
            <strong>MYR (RM)</strong>
            <span className="muted">Date format</span>
            <strong>DD-MM-YYYY</strong>
          </div>
          <p className="field-hint">
            Currency and date format are fixed in this build. Want them
            configurable? Let me know and I'll add it.
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
            hint="Added on top of fuel + tolls + parking for Driver Compensation splits. Each fill-up can override it."
          >
            <div className="field-inline" style={{ gridTemplateColumns: "1fr auto" }}>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="1"
                value={maint}
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
          <div className="field-inline" style={{ gridTemplateColumns: "1fr auto" }}>
            <input
              type="text"
              placeholder="Add someone…"
              value={newPerson}
              onChange={(e) => setNewPerson(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addNewPerson();
                }
              }}
            />
            <button className="action-btn" type="button" onClick={addNewPerson}>
              <Plus size={15} /> Add
            </button>
          </div>

          {activePeople.length === 0 ? (
            <p className="field-hint" style={{ marginTop: "0.8rem" }}>
              No people yet. Add carpool riders here, or on the fly when logging a
              fill-up.
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
      {(archivedGroups.length > 0 || archivedPeople.length > 0) && (
        <section className="section-block">
          <h2 className="section-block__title" style={{ marginBottom: "0.6rem" }}>
            Archived
          </h2>
          <div className="detail-panel people-list">
            {archivedGroups.map((g) => (
              <div className="people-row" key={g.id}>
                <span className="people-row__name">
                  <Car size={15} /> {g.name}
                </span>
                <button
                  className="mini-btn"
                  type="button"
                  onClick={async () => {
                    await restoreGroup(g.id);
                    toast(`${g.name} restored`);
                  }}
                >
                  <ArchiveRestore size={13} /> Restore
                </button>
              </div>
            ))}
            {archivedPeople.map((p) => (
              <div className="people-row" key={p.id}>
                <span className="people-row__name">
                  <User size={15} /> {p.name}
                </span>
                <button
                  className="mini-btn"
                  type="button"
                  onClick={async () => {
                    await restorePerson(p.id);
                    toast(`${p.name} restored`);
                  }}
                >
                  <ArchiveRestore size={13} /> Restore
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Backup & restore */}
      <section className="section-block">
        <h2 className="section-block__title" style={{ marginBottom: "0.6rem" }}>
          Backup & restore
        </h2>
        <div className="detail-panel field-grid">
          <p className="field-hint" style={{ marginTop: 0 }}>
            Everything lives on this device. Export a JSON backup regularly and
            keep it somewhere safe.
          </p>
          <div className="btn-row">
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
          <p className="field-hint">
            Restoring a backup replaces everything currently on this device.
            Google Drive backup is planned as a later add-on.
          </p>
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
          v0.1.0 · made with the Zaiki design system
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
