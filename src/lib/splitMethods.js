/* Split-method metadata shared across the UI. The math lives in calc.js. */

export const SPLIT_METHOD_OPTIONS = [
  { value: "distance", label: "Distance" },
  { value: "equal", label: "Equal" },
  { value: "driver_comp", label: "Custom" },
];

export const SPLIT_METHOD_HINTS = {
  distance:
    "Each passenger pays for the distance they actually travelled. Your own untagged driving is never billed.",
  equal:
    "Fuel cost split equally among each trip's passengers.",
  driver_comp:
    "Fully customizable split with tolls, parking, maintenance, and fixed per-person amounts.",
};

/** Ownership-aware hint for the 'distance' method.
 *  Falls back to the plain SPLIT_METHOD_HINTS when ownership context isn't
 *  known (Settings' global default). */
export function splitMethodHint(m, { isOwned } = {}) {
  if (m === "distance" && isOwned === false) {
    return "Each passenger pays for the distance they actually travelled. Untagged distance is the driver's own driving - never billed.";
  }
  return SPLIT_METHOD_HINTS[m] || SPLIT_METHOD_HINTS.distance;
}

// Compact labels for dense list rows.
export const SPLIT_METHOD_SHORT = {
  distance: "Distance split",
  equal: "Equal split",
  driver_comp: "Custom Split",
};

export function splitMethodShort(m) {
  return SPLIT_METHOD_SHORT[m] || SPLIT_METHOD_SHORT.distance;
}
