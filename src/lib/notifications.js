/* Local notifications (native only) via @capacitor/local-notifications.

   The one reminder we schedule is a SMART refuel nudge: instead of a fixed
   weekly alarm that pesters even active users, we (re)schedule a single
   notification for REMIND_AFTER_DAYS after the most recent refuel. Every app
   open reschedules it forward, so it only ever fires once you've genuinely
   gone quiet for that long. Toggle lives in Settings (settings.refuelReminder).

   Everything here is a safe no-op on web - the plugin's schedule() isn't
   meaningful in a browser tab, so we gate on Capacitor.isNativePlatform() and
   the Settings UI hides the toggle off-native. */

import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { db } from "../db/db.js";

const REFUEL_REMINDER_ID = 1001;
const REMIND_AFTER_DAYS = 10;
const REMIND_HOUR = 19; // 7pm local, a sensible "did you fill up?" time

/** Ask for notification permission. Returns true if granted. Native only. */
export async function ensureNotificationPermission() {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const cur = await LocalNotifications.checkPermissions();
    if (cur.display === "granted") return true;
    const req = await LocalNotifications.requestPermissions();
    return req.display === "granted";
  } catch {
    return false;
  }
}

/** ISO date (yyyy-mm-dd) of the most recent entry, or null if none. */
async function latestEntryDate() {
  try {
    const entries = await db.entries.toArray();
    if (!entries.length) return null;
    return entries.reduce((max, e) => (e.date > max ? e.date : max), entries[0].date);
  } catch {
    return null;
  }
}

/**
 * Reconcile the refuel reminder with the user's setting + activity. Call on
 * app open, when the toggle changes, and after logging a refuel.
 * Safe to call anytime; no-ops on web or when disabled (after cancelling).
 */
export async function syncRefuelReminder(enabled) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    // Always clear the old one first so we never stack duplicates.
    await LocalNotifications.cancel({ notifications: [{ id: REFUEL_REMINDER_ID }] });
    if (!enabled) return;

    const lastISO = await latestEntryDate();
    // Anchor to the later of "last refuel" and "now", then push out the window.
    const anchor = lastISO ? new Date(`${lastISO}T00:00:00`) : new Date();
    const now = new Date();
    const base = anchor > now ? anchor : now;
    const at = new Date(base);
    at.setDate(at.getDate() + REMIND_AFTER_DAYS);
    at.setHours(REMIND_HOUR, 0, 0, 0);
    // If that computed time is already in the past (e.g. a very old last entry),
    // fire REMIND_AFTER_DAYS from now instead.
    if (at <= now) {
      at.setTime(now.getTime());
      at.setDate(at.getDate() + REMIND_AFTER_DAYS);
      at.setHours(REMIND_HOUR, 0, 0, 0);
    }

    await LocalNotifications.schedule({
      notifications: [
        {
          id: REFUEL_REMINDER_ID,
          title: "Log your fuel ⛽",
          body: "It's been a while since your last refuel - keep your fuel spend up to date.",
          schedule: { at, allowWhileIdle: true },
        },
      ],
    });
  } catch {
    // ignore - reminders are enhancement only
  }
}
