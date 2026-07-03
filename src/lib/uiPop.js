/* Global "uiPop" click squish - the Zaiki brand fingerprint. On pointerdown we
   add `.ui-clicked` to the nearest interactive element; on animationend we
   remove it. Verbatim behaviour from the source portfolio's script.js. */

const POP_SELECTOR =
  "button, a, .list-row, .stat-card, .pick-chip, [data-pop]";

export function installUiPop() {
  if (typeof window === "undefined") return;
  if (window.__carpawlUiPop) return;
  window.__carpawlUiPop = true;

  const reduce = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  if (reduce) return;

  document.addEventListener(
    "pointerdown",
    (e) => {
      const el = e.target.closest?.(POP_SELECTOR);
      if (!el || el.hasAttribute("data-no-pop")) return;
      el.classList.remove("ui-clicked");
      // force reflow so re-adding the class restarts the animation
      void el.offsetWidth;
      el.classList.add("ui-clicked");
    },
    { passive: true }
  );

  document.addEventListener("animationend", (e) => {
    if (e.animationName === "uiPop") {
      e.target.classList?.remove("ui-clicked");
    }
  });
}
