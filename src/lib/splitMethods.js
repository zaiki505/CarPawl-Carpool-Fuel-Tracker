/* Split-method metadata shared across the UI. The math lives in calc.js. */

export const SPLIT_METHOD_OPTIONS = [
  { value: "distance", label: "Distance" },
  { value: "equal", label: "Equal" },
  { value: "driver_comp", label: "Custom" },
];

export const SPLIT_METHOD_LABELS = {
  distance: "Distance-based",
  equal: "Equal split",
  driver_comp: "Custom Split",
};

export const SPLIT_METHOD_HINTS = {
  distance:
    "Each passenger pays for the distance they actually travelled. Your own untagged driving is never billed.",
  equal: 
    "Fuel cost split equally among each trip's passengers.",
  driver_comp:
    "Fully customizable split with tolls, parking, maintenance and a fixed amount options.",
};

export function splitMethodLabel(m) {
  return SPLIT_METHOD_LABELS[m] || SPLIT_METHOD_LABELS.distance;
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
