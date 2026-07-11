/* Biometric app-lock helpers (native only) via @capgo/capacitor-native-biometric.
   Gates access to this financial data behind the device's fingerprint/face
   unlock. All functions are safe to call on web - they just report
   unavailable / no-op. */

import { Capacitor } from "@capacitor/core";
import { NativeBiometric } from "@capgo/capacitor-native-biometric";

/** True if the device can do biometric auth (has enrolled fingerprint/face). */
export async function biometricAvailable() {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const r = await NativeBiometric.isAvailable();
    return Boolean(r?.isAvailable);
  } catch {
    return false;
  }
}

/** Prompt the biometric dialog. Resolves true on success, false on
 *  cancel/failure. Never throws. */
export async function verifyBiometric() {
  if (!Capacitor.isNativePlatform()) return true; // nothing to verify on web
  try {
    await NativeBiometric.verifyIdentity({
      reason: "Unlock CarPawl",
      title: "CarPawl is locked",
      subtitle: "Verify it's you to continue",
    });
    return true;
  } catch {
    return false;
  }
}
