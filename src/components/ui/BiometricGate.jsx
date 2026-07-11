import React, { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { useSettings } from "../../db/hooks.js";
import { verifyBiometric } from "../../lib/biometric.js";
import { Fingerprint } from "./Icons.jsx";

/* Biometric app lock (native only), No-op on web. */
export function BiometricGate({ children }) {
  const settings = useSettings();
  const isNativeApp = Capacitor.isNativePlatform();
  const lockEnabled = isNativeApp && Boolean(settings?.appLock);
  const [unlocked, setUnlocked] = useState(false);
  const promptingRef = useRef(false);

  const attempt = useCallback(async () => {
    if (promptingRef.current) return;
    promptingRef.current = true;
    const ok = await verifyBiometric();
    promptingRef.current = false;
    if (ok) setUnlocked(true);
  }, []);

  // Prompt whenever the lock is engaged and we're not yet unlocked.
  useEffect(() => {
    if (lockEnabled && !unlocked) attempt();
  }, [lockEnabled, unlocked, attempt]);

  // Re-lock when the app is backgrounded
  useEffect(() => {
    if (!isNativeApp) return;
    const onVis = () => {
      if (document.hidden && !promptingRef.current) setUnlocked(false);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [isNativeApp]);

  // Web never locks - render immediately so AppFrame can show its own loading
  // background without waiting on this component.
  if (!isNativeApp) return children;
  // On native, hold rendering until known whether the lock is on, so locked
  // content can't flash before the prompt.
  if (settings === undefined) return null;

  if (lockEnabled && !unlocked) {
    return (
      <div className="lock-screen">
        <div className="lock-screen__card">
          <Fingerprint size={44} />
          <p className="lock-screen__title">CarPawl is locked</p>
          <p className="lock-screen__hint">Verify it's you to continue.</p>
          <button className="cta-primary" type="button" onClick={attempt}>
            Unlock
          </button>
        </div>
      </div>
    );
  }

  return children;
}
