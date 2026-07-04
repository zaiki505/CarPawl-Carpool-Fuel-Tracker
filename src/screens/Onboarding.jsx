import React, { useState } from "react";
import { GroupForm } from "../components/GroupForm.jsx";
import { Field, MoneyInput } from "../components/ui/Primitives.jsx";
import { Select } from "../components/ui/Select.jsx";
import { markOnboarded } from "../db/actions.js";
import { DEFAULTS, updateSettings } from "../db/db.js";
import { CURRENCIES } from "../lib/currencies.js";

/* First run (§5). Two steps: add your car, then optionally set currency + default
   fuel price. The prefs step is skippable - skipping keeps the defaults. The
   onboarded flag is only flipped at the very end, so the car step defers it. */
export function Onboarding({ onDone }) {
  const [step, setStep] = useState("car");

  return (
    <div className="app-shell stagger" style={{ paddingBottom: "3rem" }}>
      {step === "car" ? (
        <CarStep onNext={() => setStep("prefs")} />
      ) : (
        <PrefsStep onFinish={onDone} />
      )}
    </div>
  );
}

function CarStep({ onNext }) {
  return (
    <>
      <header className="screen-head" style={{ marginTop: "2rem" }}>
        <div>
          <p className="screen-head__kicker">Welcome to CarPawl 🐾</p>
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

function PrefsStep({ onFinish }) {
  const [currency, setCurrency] = useState(DEFAULTS.currency);
  const [price, setPrice] = useState(String(DEFAULTS.defaultFuelPricePerLiter));
  const [busy, setBusy] = useState(false);

  async function finish(save) {
    setBusy(true);
    if (save) {
      const c = CURRENCIES.find((x) => x.code === currency) || CURRENCIES[0];
      const p = Number(price);
      await updateSettings({
        currency: c.code,
        currencySymbol: c.symbol,
        defaultFuelPricePerLiter: p > 0 ? p : DEFAULTS.defaultFuelPricePerLiter,
      });
    }
    await markOnboarded();
    onFinish?.();
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
          hint="Used to prefill new refuels. Each one can still override it."
        >
          <MoneyInput value={price} onChange={setPrice} placeholder="2.05" />
        </Field>

        <div className="btn-row btn-row--center" style={{ marginTop: "0.4rem" }}>
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
            Save & finish 🐾
          </button>
        </div>
      </div>
    </>
  );
}
