/* Theme handling. Dark is the default; light is an opt-in override applied as
   `body.light`. The chosen theme is kept in localStorage, not so it can be applied synchronously at
   boot with NO FLASH of the wrong theme before React/Dexie 'hydrate'. */

const KEY = "carpawl.theme";

export function getTheme() {
  try {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyStoredTheme() {
  applyTheme(getTheme());
}

export function applyTheme(theme) {
  const light = theme === "light";
  document.body.classList.toggle("light", light);
  // brief cross-fade class
  document.body.classList.add("theme-transition");
  window.setTimeout(() => document.body.classList.remove("theme-transition"), 500);
  try {
    localStorage.setItem(KEY, light ? "light" : "dark");
  } catch {
    /* ignore quota/private-mode errors */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", light ? "#f6f6f8" : "#141418");
}

export function toggleTheme() {
  const next = getTheme() === "light" ? "dark" : "light";
  applyTheme(next);
  return next;
}
