import React from "react";
import { Sheet } from "./ui/Sheet.jsx";
import { Fuel, Users, Car } from "./ui/Icons.jsx";

/* Shown on connecting Drive when THIS device and Drive both already hold data
   (#5). Replaces the old two-step text confirm with a clear side-by-side
   comparison so the user can see exactly what each side has before choosing to
   merge (safe) or replace (destructive). Closing/back = merge, the safe default. */

const ROWS = [
  { key: "entries", label: "Refuels & trips", Icon: Fuel },
  { key: "people", label: "People", Icon: Users },
  { key: "groups", label: "Cars & carpools", Icon: Car },
];

export function DriveConflictSheet({ local, remote, busy, onMerge, onReplace, onClose }) {
  return (
    <Sheet
      title="Both places have data"
      onClose={onClose}
      manageBack
      footer={
        <div className="conflict-actions">
          <button className="cta-primary btn-block" type="button" onClick={onMerge} disabled={busy}>
            Merge both
          </button>
          <button className="cta-secondary btn-block" type="button" onClick={onReplace} disabled={busy}>
            Use Google Drive's only
          </button>
        </div>
      }
    >
      <p className="field-hint" style={{ marginTop: 0 }}>
        This device and your Google Drive each already have CarPawl data. Here's what's on
        each - pick how to combine them.
      </p>

      <div className="conflict-compare">
        <div className="conflict-compare__row conflict-compare__row--head">
          <span />
          <span className="conflict-compare__col">This device</span>
          <span className="conflict-compare__col">Google Drive</span>
        </div>
        {ROWS.map(({ key, label, Icon }) => {
          const l = local?.[key] || 0;
          const r = remote?.[key] || 0;
          const diff = l !== r;
          return (
            <div className="conflict-compare__row" key={key}>
              <span className="conflict-compare__label">
                <Icon size={14} /> {label}
              </span>
              <span className={"conflict-compare__num" + (diff ? " is-diff" : "")}>{l}</span>
              <span className={"conflict-compare__num" + (diff ? " is-diff" : "")}>{r}</span>
            </div>
          );
        })}
      </div>

      <div className="conflict-choice">
        <strong className="pos">Merge both</strong>
        <span>Keeps everything from this device and Drive. Nothing is lost - recommended.</span>
      </div>
      <div className="conflict-choice conflict-choice--danger">
        <strong className="neg">Use Google Drive's only</strong>
        <span>
          Replaces this device's data with Google Drive's. Anything saved locally on this device is deleted -
          this can't be undone.
        </span>
      </div>
    </Sheet>
  );
}
