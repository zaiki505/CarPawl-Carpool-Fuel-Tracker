/* Tiny haptics helper for major interactions only (add/delete, celebrate, cat).
   Uses the Vibration API, which only Android Chrome honours - it's a silent
   no-op on iOS Safari and desktop, so calling it anywhere is always safe.
   Respects prefers-reduced-motion. */

function canVibrate() {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function")
    return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  return true;
}

const PATTERNS = {
  light: 10, // small confirm - add/save
  medium: 20, // delete / settle
  success: [12, 40, 24], // celebratory double buzz - confetti
  playful: [8, 30, 8], // cat pokes
};

/** Fire a named haptic pattern. Unknown names fall back to a light tap. */
export function haptic(kind = "light") {
  if (!canVibrate()) return;
  navigator.vibrate(PATTERNS[kind] ?? PATTERNS.light);
}
