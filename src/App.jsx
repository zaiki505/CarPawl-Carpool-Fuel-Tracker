import React from "react";
import { AppProvider } from "./app/AppContext.jsx";
import { AppFrame } from "./components/AppFrame.jsx";
import { ErrorBoundary } from "./components/ui/ErrorBoundary.jsx";
import { BiometricGate } from "./components/ui/BiometricGate.jsx";

const CRASH_FALLBACK = (
  <div
    style={{
      minHeight: "100dvh",
      display: "grid",
      placeItems: "center",
      padding: "2rem",
      textAlign: "center",
      fontFamily: "var(--font-mono)",
    }}
  >
    <div>
      <p style={{ fontSize: "1.4rem", fontWeight: 800, marginBottom: "0.5rem" }}>
        Something went wrong
      </p>
      <p className="muted" style={{ marginBottom: "1.2rem" }}>
        Your data is safe on this device. Reloading usually fixes it.
      </p>
      <button
        className="cta-primary"
        type="button"
        onClick={() => window.location.reload()}
      >
        Reload
      </button>
    </div>
  </div>
);

export default function App() {
  return (
    <ErrorBoundary fallback={CRASH_FALLBACK}>
      <AppProvider>
        <BiometricGate>
          <AppFrame />
        </BiometricGate>
      </AppProvider>
    </ErrorBoundary>
  );
}
