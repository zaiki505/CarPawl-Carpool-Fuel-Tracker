import React, { useState } from "react";
import { usePeople } from "../db/hooks.js";
import { createGroup, createFirstCar, createPerson } from "../db/actions.js";
import { DEFAULTS, updateSettings } from "../db/db.js";
import { useApp } from "../app/AppContext.jsx";
import { Field, Segment, NumberInput } from "./ui/Primitives.jsx";
import { SPLIT_METHOD_OPTIONS, SPLIT_METHOD_HINTS } from "../lib/splitMethods.js";
import { haptic } from "../lib/haptics.js";
import { Plus, Check, Car, User } from "./ui/Icons.jsx";

/* Group creation form. Two modes:
   - 'onboard'  first-run: ownerType is 'me', the ownership question is skipped
                entirely (spec 5), and it flips the onboarded flag.
   - 'create'   asks "Is this your vehicle, or someone else's?" first (5);
                "someone else's" requires picking or adding a Person.
   Reused inside a Sheet (create) and on the Onboarding screen. */
export function GroupForm({ mode = "create", onDone, deferOnboardFinish = false }) {
  const people = usePeople() || [];
  const { toast } = useApp();

  const [name, setName] = useState("");
  const [kmpl, setKmpl] = useState(String(DEFAULTS.defaultKmPerLiter));
  const [ownerType, setOwnerType] = useState(mode === "onboard" ? "me" : "me");
  const [ownerPersonId, setOwnerPersonId] = useState(null);
  const [newPersonName, setNewPersonName] = useState("");
  const [splitMethod, setSplitMethod] = useState(DEFAULTS.defaultSplitMethod);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const askOwnership = mode !== "onboard";

  async function addPerson() {
    const nm = newPersonName.trim();
    if (!nm) return;
    try {
      const p = await createPerson(nm);
      setOwnerPersonId(p.id);
      setNewPersonName("");
    } catch (e) {
      setError(e.message);
    }
  }

  async function save() {
    setError("");
    if (!name.trim()) {
      setError("Give this car a name.");
      return;
    }
    if (askOwnership && ownerType === "person" && !ownerPersonId) {
      setError("Pick who owns this car (or add them).");
      return;
    }
    setBusy(true);
    try {
      let group;
      if (mode === "onboard") {
        await updateSettings({ defaultSplitMethod: splitMethod });
        group = await createFirstCar({
          name,
          defaultKmPerLiter: Number(kmpl),
          finishOnboarding: !deferOnboardFinish,
        });
      } else {
        group = await createGroup({
          name,
          ownerType,
          ownerPersonId: ownerType === "person" ? ownerPersonId : null,
          defaultKmPerLiter: Number(kmpl),
        });
      }
      haptic("light");
      toast(
        mode === "onboard"
          ? `${group.name} is on the road 🚗`
          : `Added ${group.name}`
      );
      onDone?.(group);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  const isPersonOwned = askOwnership && ownerType === "person";
  const carNameLabel =
    mode === "onboard"
      ? "What's your car called?"
      : isPersonOwned
      ? "Their car's name"
      : "Your car's name";
  const carNamePlaceholder = isPersonOwned ? "e.g. Dad's Civic" : "e.g. My Myvi";

  return (
    <div className="field-grid">
      {askOwnership && (
        <Field
          label="Whose vehicle is this?"
          hint={
            ownerType === "me"
              ? "A car you own - you'll track its fuel and collect from riders."
              : "Someone else's car you ride in - you'll only track your own share."
          }
        >
          <Segment
            value={ownerType}
            onChange={setOwnerType}
            options={[
              {
                value: "me",
                label: (
                  <span className="seg-label">
                    <Car size={14} /> Mine
                  </span>
                ),
              },
              {
                value: "person",
                label: (
                  <span className="seg-label">
                    <User size={14} /> Someone else's
                  </span>
                ),
              },
            ]}
          />
        </Field>
      )}

      {isPersonOwned && (
        <div className="owner-callout">
          <Field
            label="Owner / driver"
            hint="The person whose car this is - you'll track what you owe them."
          >
            {people.length > 0 && (
              <div className="chip-wrap" style={{ marginBottom: "0.6rem" }}>
                {people.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="pick-chip"
                    aria-pressed={ownerPersonId === p.id}
                    onClick={() => setOwnerPersonId(p.id)}
                  >
                    {ownerPersonId === p.id && <Check size={13} />}
                    {p.name}
                  </button>
                ))}
              </div>
            )}
            <div className="field-inline" style={{ gridTemplateColumns: "1fr auto" }}>
              <input
                type="text"
                placeholder="Or type their name…"
                value={newPersonName}
                onChange={(e) => setNewPersonName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPerson();
                  }
                }}
              />
              <button className="action-btn" type="button" onClick={addPerson}>
                <Plus size={15} /> Add
              </button>
            </div>
          </Field>
        </div>
      )}

      <Field label={carNameLabel}>
        <input
          type="text"
          placeholder={carNamePlaceholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </Field>

      <Field
        label="Fuel efficiency (km/L)"
        hint="Used to estimate distance/liters/cost from whichever value you enter. You can fine-tune it any time."
      >
        <NumberInput value={kmpl} onChange={setKmpl} placeholder="12" step="0.1" min="0" />
      </Field>

      {mode === "onboard" && (
        <Field
          label="Default way to split carpools"
          hint={SPLIT_METHOD_HINTS[splitMethod] + " You can change this any time, and override it per refuel."}
        >
          <Segment
            value={splitMethod}
            onChange={setSplitMethod}
            options={SPLIT_METHOD_OPTIONS}
          />
        </Field>
      )}

      {error && (
        <div className="form-status is-visible" data-state="error">
          {error}
        </div>
      )}

      <button className="cta-primary btn-block" type="button" onClick={save} disabled={busy}>
        {mode === "onboard" ? "Start tracking 🐾" : "Add car"}
      </button>
    </div>
  );
}
