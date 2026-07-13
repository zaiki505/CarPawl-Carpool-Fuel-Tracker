# Changelog

All notable changes to CarPawl are recorded here. Newest first.

## [0.2.8] - 2026-07-12

### Added
- **Onboarding tutorial**: after setting up your first car, a short swipeable primer explains the key concepts, then an interactive guided tour points out the main parts of the app (add button, balance cards, navigation).
- **Route distance (A -> B)**: in the fuel entry form you can now work out a trip's distance from a start and end location, with live place suggestions as you type. It fills the distance in for you.
- **Google Drive comparison on connect**: when both this device and your Drive already have data, a side-by-side comparison (This device vs Google Drive) lets you choose Merge or Replace, instead of a plain text prompt.

### Changed
- **"Fuel this month" merged into the fuel-spend card**: litres now show beside the total spend for the selected period, and the per-vehicle breakdown shows `RM / L`. The separate "Fuel this month" card was removed.
- **"How it works" concept cards** are now a swipeable, illustrated deck with a visual-first layout (bigger illustration, less text).
- **Reconnecting Google Drive** now shows the account chooser, so you can switch accounts instead of it silently reusing the last one.

### Fixed
- **Sync robustness**: a short buffer after each sync plus a merge that preserves edits made mid-sync, so syncing can no longer overwrite, fight, or duplicate changes you just made.
- **Drive conflict dialog** buttons no longer wrap onto multiple awkward lines.

---

Earlier releases (v0.2.6 and before) predate this changelog; see the git history.
