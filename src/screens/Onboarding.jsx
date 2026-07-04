import React from "react";
import { GroupForm } from "../components/GroupForm.jsx";

/* First-run screen (5). Goes into "add your car" with ownerType fixed
   to 'me', the only group creation that skips the ownership question. */
export function Onboarding({ onDone }) {
  return (
    <div className="app-shell stagger" style={{ paddingBottom: "3rem" }}>
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
        <GroupForm mode="onboard" onDone={onDone} />
      </div>
    </div>
  );
}
