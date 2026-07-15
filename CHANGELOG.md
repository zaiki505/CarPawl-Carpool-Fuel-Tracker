# Changelog

All notable changes to CarPawl are recorded here. Newest first.

## [0.2.8a] - 2026-07-15

### Added
- **Carpool default name**: adding a carpool now prefills its name as "{owner}'s Car" once you pick the owner (live as you pick, and when editing the vehicle too).
- **Fuel-efficiency info**: a short (i) tooltip on the km/L field explains the ~12 km/L default and how to find your car's exact figure (on both the add and edit forms).
- **About CarPawl**: a new Settings section with the app version, a GitHub link, a manual update check, and a "What's new" button that pulls the latest release notes in-app. The "How it works" concept cards now live here.

### Polish
- Untitled entries now show a generic "Refuel"/"Trip" title (the car name is already on the chip).
- The FAB shows a car icon on the Vehicles tab (add vehicle) and the "+" elsewhere (add refuel), blur-morphing between them, with more space above the bottom nav.
- Concept-card illustrations: tighter glow for legibility, remade Upcoming (timeline) and Google Drive Sync (cloud to phone + laptop) art, and re-centered Distance split, Custom split, Credit, Prepay and Repeats.
- The entry vehicle picker colours your own cars purple and carpools blue.
- The passenger list when adding an entry shows the first few, with "+ more" to reveal the rest.
- The fixed-amount field now shows the auto-calculated price as its placeholder (instead of "Auto").
- The "apply to all entries" warning now lists exactly which fields will change.
- Applied credit shows as a purple chip with an undo button (matching the payment chips).
- Edit a trip's vehicle by tapping its icon (a small pencil marks it) - the name chip is no longer tap-to-edit.
- A floating status card at the top of the dashboard shows Google Drive sync progress, and can be dismissed.
- Swapped the export/import backup icons, and animated the "work out distance from route" chevron.
- A passenger's split distance can be left blank (uses the full trip) - the field no longer auto-fills, and an explicit 0 still means 0 km.
- Fully-settled trips show the total with a tick in a filled green circle.
- Removed the "Custom split defaults" section from the vehicle page (you can still set a fixed amount per entry).

### Fixed
- **Manual Google Drive sync** no longer shows an account chooser - it silently uses your connected account. This fixes an occasional "401 UNAUTHENTICATED" that happened when the wrong device account was picked. (Reconnecting from Settings still lets you switch accounts.)
- Payments already settled by credit no longer show up in the "to pay" / "to collect" totals or lists.

### Added (earlier in 0.2.8)
- **Onboarding tutorial**: after setting up your first car, a short swipeable primer explains the key concepts, then an interactive guided tour points out the main parts of the app (add button, balance cards, navigation).
- **Route distance (A -> B)**: in the fuel entry form you can now work out a trip's distance from a start and end location, with live place suggestions as you type. It fills the distance in for you.
- **Google Drive comparison on connect**: when both this device and your Drive already have data, a side-by-side comparison (This device vs Google Drive) lets you choose Merge or Replace, instead of a plain text prompt.
- **Carpool owner as a rider**: a carpool's owner can now be picked as a passenger - their share is tracked for reference but never owed (like "Me" in a car I own).
- **Edit a carpool's owner**: change who owns a carpool from its page; this recomputes every trip's balances (with a warning first).
- **"Add new vehicle" pill**: the Vehicles page's add button is now a labelled purple pill; the old top-right "+Add" was removed.

### Changed
- **"Fuel this month" merged into the fuel-spend card**: litres now show beside the total spend for the selected period, and the per-vehicle breakdown shows `RM / L`. The separate "Fuel this month" card was removed.
- **"How it works" concept cards** are now a swipeable, illustrated deck with a visual-first layout (bigger illustration, less text).
- **Reconnecting Google Drive** now shows the account chooser, so you can switch accounts instead of it silently reusing the last one.
- **Trip cards** now show the vehicle's name (not the owner's), and once every share is settled they show the total with a done tick instead of "RM3 / RM3".
- **Carpool litres** now count toward the dashboard's fuel litres - your prorated share of each carpool trip (by cost), to match the money total.
- **Split distance**: leaving a passenger's distance blank uses the full trip distance; typing 0 registers a real 0 km.
- **Concept illustrations** now glow (neon style) to match the mockups.

### Fixed
- **Sync robustness**: a short buffer after each sync plus a merge that preserves edits made mid-sync, so syncing can no longer overwrite, fight, or duplicate changes you just made.
- **Drive conflict dialog** buttons no longer wrap onto multiple awkward lines.
- **Update download**: the "Update" action now opens the GitHub release page in the system browser (where the APK downloads reliably) instead of the direct APK link, which silently failed inside the app (WebView download / biometric-lock interruption).
- **Silent background sync**: a routine sync on an already-connected account no longer flashes a Google account popup.

---

Earlier releases (v0.2.6 and before) predate this changelog; see the git history.
