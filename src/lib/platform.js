/* Small platform helpers. Capacitor reports 'android' | 'ios' | 'web' and
   whether we're running inside the installed native shell vs a browser. */

import { Capacitor } from "@capacitor/core";

/** True when running inside the installed native app (Android/iOS), not a browser. */
export function isNative() {
  return Capacitor.isNativePlatform();
}

/** 'android' | 'ios' | 'web'. */
export function platform() {
  return Capacitor.getPlatform();
}

/** True only in an Android WEB browser (not the installed app, not desktop/iOS).
 *  Used to show the "download the Android app" prompt where it's relevant. */
export function isAndroidWeb() {
  if (Capacitor.isNativePlatform()) return false;
  return typeof navigator !== "undefined" && /android/i.test(navigator.userAgent || "");
}
