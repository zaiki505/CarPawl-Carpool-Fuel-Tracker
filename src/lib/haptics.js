/* Haptics for CarPawl. Uses Capacitor's Haptics plugin, which drives real
   native taptic engines on Android/iOS and transparently falls back to the
   Vibration API on web (Chromium-on-Android honours it; iOS Safari and
   desktop silently no-op) - so calling this anywhere is always safe, on any
   platform, without any platform check at the call site.

   Named patterns map to the two real haptic "vocabularies" iOS/Android expose:
     - impact (light/medium/heavy): a physical bump - taps, saves, deletes,
       swipe-settle, the weight scaling with how significant the action is.
     - notification (success/warning/error): a distinct multi-pulse feel,
       reserved for outcomes the user should notice without looking - EVERY
       toast in the app routes through here (see AppContext.jsx's toast()).
     - selection: the tiny "tick" for scrubbing through a set of options -
       segmented controls, bottom-nav tab switches.
   `playful` keeps its own bespoke pattern for the CyberCat easter egg - it's
   decorative, not semantic, so it doesn't map to a real OS haptic type. */

import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

const PLAYFUL_PATTERN = [8, 30, 8, 30, 8]; // cat pokes - web-only decorative buzz

function canVibrate() {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

const ACTIONS = {
  light: () => Haptics.impact({ style: ImpactStyle.Light }),
  medium: () => Haptics.impact({ style: ImpactStyle.Medium }),
  heavy: () => Haptics.impact({ style: ImpactStyle.Heavy }),
  success: () => Haptics.notification({ type: NotificationType.Success }),
  warning: () => Haptics.notification({ type: NotificationType.Warning }),
  error: () => Haptics.notification({ type: NotificationType.Error }),
  selection: () => Haptics.selectionChanged(),
  playful: () => {
    if (canVibrate()) navigator.vibrate(PLAYFUL_PATTERN);
  },
};

/** Fire a named haptic. Unknown names fall back to a light tap. Always safe
 *  to call - swallows any failure (e.g. desktop browsers with no Vibration
 *  API) so haptics can never break the interaction they're attached to. */
export function haptic(kind = "light") {
  try {
    const action = ACTIONS[kind] || ACTIONS.light;
    const result = action();
    if (result?.catch) result.catch(() => {});
  } catch {
    // ignore - haptics are enhancement only, never load-bearing
  }
}
