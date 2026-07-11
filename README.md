# CarPawl

CarPawl is a small, offline-first app for tracking fuel costs and splitting
carpool fuel bills. It runs in the browser with IndexedDB (no backend, no
account), and also ships as a native **Android app** via Capacitor. Optional
Google Drive sync keeps your data across devices.

## Features

- Track your own fuel fill-ups by cost, liters, or distance.
- Split trip costs with passengers (distance / equal / custom-with-markup).
- See balances owed to you and balances you owe.
- Schedule **upcoming** refuels and **prepay** them in advance.
- **Recurring trips** (daily / weekly / monthly / yearly) auto-schedule their next occurrence.
- Review monthly spend, fuel use, and fuel efficiency trends.
- Selectable currency and date format.
- Optional **Google Drive sync** across devices, or manual JSON backup/restore.
- Works fully offline; installable as a PWA or a native Android app.

## Tech stack

- React 18 + Vite
- Dexie with IndexedDB
- Recharts for charts, lucide-react for icons
- vite-plugin-pwa for PWA support
- Capacitor 8 for the native Android app
- Netlify for the web deployment

## Development

```bash
npm install
npm run dev        # web dev server (localhost:5173)
npm run build      # web production build -> dist/
npm run preview
npm test           # vitest

# Android (see ANDROID.md for the full from-scratch guide)
npm run build:mobile   # web build + copy into the android/ project
npm run android        # open the android/ project in Android Studio
```

The first run opens a welcome step: start fresh, sync from Google Drive, or
restore from a backup file.

## Data, sync and backup

- Data is stored locally in IndexedDB (database name `carpawl`). In a browser
  tab it can be evicted, so export backups; the native app keeps it durably.
- **Google Drive sync** (Settings -> Google Drive sync): a single JSON snapshot
  in your Drive's hidden appData folder (never your regular Drive files).
  Per-record last-write-wins with tombstones for deletes. Connect, "Sync now",
  disconnect, or delete the Drive backup entirely.
- **Manual backup**: export/restore a JSON file from Settings (native uses the
  OS share sheet; web downloads the file).

## How the split works

- Distance split: each passenger is charged for the distance they were assigned;
  unassigned distance is your own driving and isn't billed.
- Equal split: cost divided evenly. Custom split: a fixed pool plus an optional
  maintenance markup, remainder shared by distance or equally.
- Upcoming (future-dated) refuels stay out of the live balances until their date
  arrives; advance payments against them are held the same way.

## Project structure

```text
src/
  app/          UI/navigation state (tabs, sheets, confirm, hardware back)
  components/   cards, sheets, charts, UI primitives
  db/           Dexie schema + all write actions
  lib/          calc, sync, drive, recurrence, native helpers
  screens/      Dashboard, Groups, GroupDetail, History, Settings, Onboarding
  styles/
android/        Capacitor native Android project
zaiki-design-system/
```

---

## Changes since the last commit (`0339892`)

A large body of work landed on top of the initial Google Drive sync commit.
Grouped by area:

### Platform: native Android app (Capacitor)
- Wrapped the web app with Capacitor 8; added `capacitor.config.json` and the `android/` project. Native WebView storage isn't evicted, fixing the "data resets after a while" problem.
- Reworked Google sign-in for the WebView using `@capgo/capacitor-social-login` (browser OAuth popups don't work in a WebView). `MainActivity` is modified per the plugin's scope requirement.
- Fixed Drive REST issues surfaced on-device: v3 has no JSON `etag` field (dropped `fields=...,etag`, which caused a 400 on every update), and etag header/field quoting is normalized.
- Full setup guide in [ANDROID.md](ANDROID.md): SDK/Studio install, build & run, signed APK, and the Google Cloud Android OAuth client.
- Android hardware back / gesture now navigates in-app (closes sheets/overlays) instead of exiting straight to the homescreen.

### Native device features
- Comprehensive **haptics** across taps, toggles, confirms, and toasts.
- **Local notifications**: an opt-in smart refuel reminder that only fires after you've gone quiet.
- **Native share sheet** for the balances export and for the JSON backup file.
- **Biometric app lock** (fingerprint/face) on launch and on returning from the background.
- **"Download the app"** button in Settings, shown only in an Android web browser.
- App icons (favicon, PWA, Android launcher/adaptive) regenerated from the brand art.

### New tracking features
- **Recurring trips**: mark a refuel/trip daily/weekly/monthly/yearly; the next occurrence is auto-scheduled as upcoming and rolls forward (missed steps are skipped, so nothing back-fills).
- **Advance payments**: record a prepayment against an upcoming refuel; it's held out of live balances until the refuel date arrives.
- **Onboarding**: choose to start fresh, sync from Google Drive, or restore from a backup file.

### Google Drive sync hardening
- Device-local sync state (etag, last-synced, connection) is kept out of the synced snapshot so it can't leak between devices or make the app look perpetually "dirty".
- Change-driven sync: auto-sync only touches Drive when data actually changed, plus a periodic remote poll - conserving OAuth token grants.
- First-connect **conflict reconciliation**: when both this device and Drive have data, choose Merge vs Replace.
- Graceful handling of a lapsed sign-in (no error spam, backs off, recovers on a manual "Sync now"); interactive re-auth now reaches the token client.
- Delete the Drive backup entirely (and disconnect) from Settings; disabled when there's nothing in Drive.
- "Clear all data" now disconnects Drive first so it doesn't immediately re-pull.

### UI / UX
- Chart carousel shows one full-width chart at a time with a firm snap (no corner peeking or over-swiping).
- Bottom sheets (entry, payment, forms) can be swiped down to dismiss.
- Confirmation dialogs stack their buttons vertically so long labels don't overflow.
- Drive "Disconnect" uses the app's danger/red styling.
- Carpool trips now require at least one passenger (a carpool can't be a solo trip); your own vehicle can still be a solo refuel.

### Reliability / tests
- Fixed a token-client callback bug that hung `getToken()` after the first token; a concurrency race in `syncNow`; and various edge cases.
- Test suite expanded to **143 passing** (merge engine, snapshot round-trips, sync orchestration, etag helpers, recurrence, EntryCard).

## Notes

- Single user; no shared/multi-user backend. Google Drive sync is just your own
  data across your own devices.
