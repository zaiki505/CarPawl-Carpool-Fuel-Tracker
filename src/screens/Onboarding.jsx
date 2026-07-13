import React, { useRef, useState } from "react";
import { GroupForm } from "../components/GroupForm.jsx";
import { Field, MoneyInput } from "../components/ui/Primitives.jsx";
import { Select } from "../components/ui/Select.jsx";
import { markOnboarded } from "../db/actions.js";
import { DEFAULTS, updateSettings, readSettings } from "../db/db.js";
import { CURRENCIES } from "../lib/currencies.js";
import { useApp } from "../app/AppContext.jsx";
import { connectAndPrepare, resolveConflict } from "../lib/syncEngine.js";
import { readBackupFile, restoreFromBackup } from "../lib/backup.js";
import { Cloud, Upload, Plus, Loader2 } from "../components/ui/Icons.jsx";
import { ConceptCards } from "../components/ConceptCards.jsx";

// The curated primer shown at the end of a fresh setup - the handful of ideas a
// newcomer needs, not the full glossary (that lives in Settings > How it works).
const ONBOARDING_CONCEPTS = [
  "ownVsCarpool",
  "distanceSplit",
  "credit",
  "upcoming",
  "recurring",
  "driveSync",
];

/* First run (5). Steps: choose how to start (fresh / from Google Drive / from a
   backup), then add your car, set currency + default fuel price, then a short
   concepts primer that leads into the interactive walkthrough. The onboarded
   flag is only flipped at the very end (or set for you when you pull an existing
   account from Drive/backup, which skips the teaching steps). */
export function Onboarding({ onDone }) {
  const [step, setStep] = useState("welcome");

  return (
    <div className="app-shell stagger" style={{ paddingBottom: "3rem" }}>
      {step === "welcome" && (
        <WelcomeStep onFresh={() => setStep("car")} onDone={onDone} />
      )}
      {step === "car" && <CarStep onNext={() => setStep("prefs")} />}
      {step === "prefs" && <PrefsStep onNext={() => setStep("learn")} />}
      {step === "learn" && <LearnStep onDone={onDone} />}
    </div>
  );
}

function WelcomeStep({ onFresh, onDone }) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  async function connectDrive() {
    setBusy(true);
    try {
      const res = await connectAndPrepare();
      // A brand-new device has no local data, so a conflict is unlikely here;
      // if one somehow occurs, merge so nothing just entered is lost.
      if (res.status === "conflict") {
        await resolveConflict("merge", res.remote, res.etag);
      }
      const s = await readSettings();
      if (s.onboardedAt) {
        onDone?.(); // pulled an existing CarPawl account from Drive
      } else {
        // Connected, but Drive had nothing set up yet - fall through to adding a car.
        toast("No CarPawl data in Google Drive yet - let's add your car.");
        onFresh?.();
      }
    } catch (e) {
      toast(e.message || "Could not connect to Google Drive", "error");
      setBusy(false);
    }
  }

  async function onRestoreFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setBusy(true);
    try {
      const backup = await readBackupFile(file);
      await restoreFromBackup(backup);
      await markOnboarded(); // a restored backup means the app is set up
      onDone?.();
    } catch (err) {
      toast(err.message || "Could not restore that file", "error");
      setBusy(false);
    }
  }

  return (
    <>
      <header className="screen-head" style={{ marginTop: "2rem" }}>
        <div>
          <p className="screen-head__kicker">Welcome to CarPawl</p>
          <h1 className="screen-head__title">Set up this device</h1>
          <p className="screen-head__sub">
            Starting fresh, or already using CarPawl somewhere else? Everything
            stays on your device unless you choose to sync.
          </p>
        </div>
      </header>

      <div className="detail-panel field-grid">
        <button
          className="cta-primary btn-block"
          type="button"
          onClick={onFresh}
          disabled={busy}
        >
          <Plus size={16} /> Start fresh
        </button>

        <button
          className="cta-secondary btn-block"
          type="button"
          onClick={connectDrive}
          disabled={busy}
        >
          {busy ? <Loader2 size={15} className="spin" /> : <Cloud size={15} />} Sync from
          Google Drive
        </button>

        <button
          className="cta-secondary btn-block"
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          <Upload size={15} /> Restore from a backup file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={onRestoreFile}
        />

        <p className="field-hint" style={{ marginTop: "0.2rem", textAlign: "center" }}>
          Sync uses your Google Drive's hidden app folder - it never touches your
          other Drive files.
        </p>
      </div>
    </>
  );
}

function CarStep({ onNext }) {
  return (
    <>
      <header className="screen-head" style={{ marginTop: "2rem" }}>
        <div>
          <p className="screen-head__kicker">Welcome to CarPawl</p>
          <h1 className="screen-head__title">Let's add your car</h1>
          <p className="screen-head__sub">
            Track your own fuel spending first - you can add carpools you ride in
            later. Everything stays on your device.
          </p>
        </div>
      </header>

      <div className="detail-panel">
        <GroupForm mode="onboard" deferOnboardFinish onDone={onNext} />
      </div>
    </>
  );
}

function PrefsStep({ onNext }) {
  const [currency, setCurrency] = useState(DEFAULTS.currency);
  const [price, setPrice] = useState(String(DEFAULTS.defaultFuelPricePerLiter));
  const [busy, setBusy] = useState(false);

  async function finish(save) {
    setBusy(true);
    try {
      if (save) {
        const c = CURRENCIES.find((x) => x.code === currency) || CURRENCIES[0];
        const p = Number(price);
        await updateSettings({
          currency: c.code,
          currencySymbol: c.symbol,
          defaultFuelPricePerLiter: p > 0 ? p : DEFAULTS.defaultFuelPricePerLiter,
        });
      }
      // Not onboarded yet - the concepts primer + tour come next.
      onNext?.();
    } catch {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="screen-head" style={{ marginTop: "2rem" }}>
        <div>
          <p className="screen-head__kicker">One quick thing</p>
          <h1 className="screen-head__title">Money & fuel</h1>
          <p className="screen-head__sub">
            Set your currency and usual pump price so new refuels prefill nicely.
            You can skip this and change it later in Settings.
          </p>
        </div>
      </header>

      <div className="detail-panel field-grid">
        <Field label="Currency">
          <Select
            value={currency}
            onChange={setCurrency}
            options={CURRENCIES.map((c) => ({
              value: c.code,
              label: `${c.symbol} · ${c.code}`,
            }))}
          />
        </Field>
        <Field
          label="Default fuel price (per liter)"
          hint="Used to prefill new refuels. Each refuel entry can still override the default."
        >
          <MoneyInput value={price} onChange={setPrice} placeholder="2.05" />
        </Field>

        <div className="btn-row btn-row--nowrap" style={{ marginTop: "0.4rem" }}>
          <button
            className="cta-secondary"
            type="button"
            onClick={() => finish(false)}
            disabled={busy}
          >
            Skip
          </button>
          <button
            className="cta-primary btn-block"
            type="button"
            onClick={() => finish(true)}
            disabled={busy}
          >
            Save & continue
          </button>
        </div>
      </div>
    </>
  );
}

/* Concepts primer (slides) that closes out a fresh setup, then hands off to the
   interactive walkthrough. "Continue" finalises onboarding and launches the
   spotlight tour over the dashboard; "Skip the tour" finalises without it.
   Either way the user has swiped the primer at their own pace. */
function LearnStep({ onDone }) {
  const { startTour } = useApp();
  const [busy, setBusy] = useState(false);

  async function finish(withTour) {
    setBusy(true);
    try {
      await markOnboarded();
      if (withTour) startTour();
      onDone?.();
    } catch {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="screen-head" style={{ marginTop: "2rem" }}>
        <div>
          <p className="screen-head__kicker">Before you dive in</p>
          <h1 className="screen-head__title">A few quick concepts</h1>
          <p className="screen-head__sub">
            Swipe through the basics - it takes about a minute. You can revisit
            these anytime in Settings.
          </p>
        </div>
      </header>

      <div className="detail-panel">
        <ConceptCards keys={ONBOARDING_CONCEPTS} />
      </div>

      <div className="onboard-learn__actions">
        <button
          className="cta-primary btn-block"
          type="button"
          onClick={() => finish(true)}
          disabled={busy}
        >
          Continue
        </button>
        <button
          className="onboard-skip-link"
          type="button"
          onClick={() => finish(false)}
          disabled={busy}
        >
          Skip the tour
        </button>
      </div>
    </>
  );
}
