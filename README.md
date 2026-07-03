# CarPawl 🐾

A personal, **offline-first, installable PWA** for tracking your car's fuel
spending and splitting carpool fuel bills. Single-user, no login, no backend —
everything lives on your device in IndexedDB, with manual JSON backup.

Built with the **Zaiki design system** (dark-first, purple accent, all
JetBrains Mono, glassmorphism, bouncy motion).

---

## What it does

- **Track your own car's fuel** — log fill-ups by cost, liters, or distance;
  the rest is derived from your car's km/L and the fuel price.
- **Split carpool bills** — for any carpool you ride in (whether you own the car
  or not), track each passenger's share by the distance they rode, record
  payments, and see who owes what.
- **Dashboard** — total owed to you, total you owe, this month's spend and fuel
  consumption, and a per-car fuel-efficiency trend.
- **Works fully offline** once installed. No network is ever required (Google
  Drive backup is an optional, not-yet-built add-on — see below).

## Tech stack

| Concern      | Choice                                   |
| ------------ | ---------------------------------------- |
| UI           | React 18 + Vite                          |
| PWA / offline| `vite-plugin-pwa` (Workbox)              |
| Storage      | IndexedDB via **Dexie.js**               |
| Charts       | Recharts (lazy-loaded)                   |
| Icons        | `lucide-react`                           |
| Font         | Self-hosted JetBrains Mono (`@fontsource`) |
| Deploy       | Netlify                                  |

There is **no backend and no authentication of any kind.**

---

## Getting started

```bash
npm install      # install dependencies
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # production build to dist/
npm run preview  # preview the production build
npm test         # run the calculation-engine unit tests
```

First launch drops you straight into **"add your car"** — no ownership question,
just name it and set its km/L. From there, use the **+** button to log fill-ups.

## Deployment (Netlify)

The repo includes a `netlify.toml` with the correct build command
(`npm run build`) and publish directory (`dist`), plus SPA + service-worker
cache headers. Point Netlify at the repo and it builds as-is. When you deploy,
add your production URL to the OAuth origins if/when you enable Google Drive
(below).

---

## Your data

- Everything is stored **on-device** in IndexedDB (database name `carpawl`).
- Clearing your browser's site data **erases everything** — so export backups.
- **Currency is MYR (RM)** and **dates are DD-MM-YYYY**. These are fixed in this
  build (shown in Settings but not editable). Ask if you want them configurable.

### Backup & restore (JSON)

In **Settings → Backup & restore**:

- **Export JSON** downloads a complete snapshot (people, groups, entries,
  payments, settings) as `carpawl-backup-YYYY-MM-DD.json`.
- **Restore JSON** imports a backup file. ⚠️ **This fully replaces everything on
  the device** — it's not a merge — and asks you to confirm first.

Export regularly and keep the file somewhere safe (cloud drive, email to
yourself, etc.).

---

## Google Drive backup (optional, not yet built)

This build ships **JSON backup only.** Google Drive backup is documented here as
a later add-on. If/when you want it, it needs a Google Cloud OAuth client, set up
once:

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and
   **create a new project**.
2. **Enable the Google Drive API** for that project
   (APIs & Services → Library → Google Drive API → Enable).
3. **Configure the OAuth consent screen** → User type **External**. Leave it in
   **Testing** mode (no verification needed for personal use) and add your own
   Google account as a test user.
4. **Create credentials → OAuth 2.0 Client ID** → application type
   **Web application**. Under **Authorized JavaScript origins**, add:
   - `http://localhost:5173` (local dev)
   - your deployed Netlify URL (e.g. `https://carpawl.netlify.app`)
5. Copy the generated **Client ID** into a local `.env` file (never commit it):
   ```
   VITE_GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
   ```
6. The integration should use Google Identity Services scoped **only** to
   `drive.file` (files this app creates) — never broader Drive access.

Until that's wired up, use the JSON export/import above.

---

## How the numbers work (quick reference)

- **Per-passenger share** = `(their assigned distance ÷ trip distance) × total cost`.
  Distance not assigned to anyone is your own driving and is never billed.
- **Owned cars:** you're never a "passenger" — your driving is always excluded.
- **Carpools you ride in:** you're tracked as a passenger like anyone else.
- **Owed vs credit** are always shown **separately, never netted** — an
  overpayment on one fill-up doesn't reduce what's owed on another.
- **Efficiency chart** only plots fill-ups where you entered a *real* second
  measurement (actual distance or liters), so the line reflects reality rather
  than the flat default.

The full ruleset lives in `src/lib/calc.js`, covered by `src/lib/calc.test.js`.

---

## Project structure

```
src/
  app/          AppContext — navigation, overlays, toasts, confirm dialog
  components/   UI + feature components (nav, sheets, cards, chart, forms)
    brand/      CyberCat mascot (Settings easter egg)
    ui/         primitives (Icons, Sheet, Toasts, ConfirmModal, inputs)
  db/           Dexie schema (db.js), write actions (actions.js), hooks
  lib/          calc engine, formatting, identity, backup, theme, uiPop
  screens/      Dashboard, Groups, GroupDetail, History, Settings, Onboarding
  styles/       typography + app CSS (composed from the design tokens)
zaiki-design-system/   the design-system bundle (tokens, components, reference)
```

## Design system

The visual language is the **Zaiki design system** (see
`zaiki-design-system/`). One accent (purple `#a754ff`), dark-first with a light
toggle, JetBrains Mono everywhere, glass cards, and the signature bouncy/squishy
motion. The one deliberate deviation from the source: the font is **self-hosted**
(not loaded from a CDN) so the installed app works with no network.

## Design decisions worth knowing

A few engineering calls were made to keep things simple — flag any you'd like
changed:

- Storage/tooling: Dexie, Vite + vite-plugin-pwa, Recharts, lucide-react.
- MYR + DD-MM-YYYY are fixed (shown, not editable).
- The efficiency chart skips unmeasured fill-ups instead of plotting the default.
- A passenger with recorded payments can't be removed from a fill-up until those
  payments are dealt with.
- Restoring a backup fully replaces current data (no merge).
