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
import { isFutureDate } from "./format.js";
import { outstanding } from "./calc.js";
import { isMe } from "./identity.js";

const REFUEL_REMINDER_ID = 1001;
const UPDATE_AVAILABLE_ID = 1002;
const REMIND_AFTER_DAYS = 10;
const REMIND_HOUR = 19; // 7pm local, a sensible "did you fill up?" time

/**
 * Fire a one-off "update available" notification (native only). The caller
 * (UpdateBanner) guards against re-notifying for the same version, so this just
 * schedules it a couple seconds out (delivers even if the app is backgrounded).
 */
export async function notifyUpdateAvailable(version) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const granted = await ensureNotificationPermission();
    if (!granted) return;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: UPDATE_AVAILABLE_ID,
          title: "CarPawl update available",
          body: `Version ${version} is ready - open CarPawl to download it.`,
          schedule: { at: new Date(Date.now() + 2000), allowWhileIdle: true },
        },
      ],
    });
  } catch {
    // ignore - update nudge is enhancement only
  }
}

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

// Payment reminders (#2) live in the 2000-4999 notification-id range so they
// can be cleared/rescheduled as a group without touching the refuel reminder.
const PAY_LEAD_BASE = 2000; // "before a scheduled trip" (one per upcoming trip)
const PAY_ARRIVAL_BASE = 3000; // "trip is due today" (one per upcoming trip)
const DEBT_NUDGE_ID = 4000; // periodic unpaid-balance nudge (single)
const LEAD_DAYS = { "1d": 1, "3d": 3, "7d": 7 };
const NUDGE_DAYS = { "7d": 7, "14d": 14, "30d": 30 };

/**
 * Reschedule the payment reminders from the user's settings (#2): a lead-time
 * heads-up before each upcoming trip, an on-the-day reminder when one becomes
 * due, and a periodic nudge while any balance is unpaid. Rebuilds from scratch
 * each call (clears the 2000-4999 range first). Native-only; no-op on web.
 */
export async function syncPaymentReminders(settings) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const pending = await LocalNotifications.getPending();
    const mine = (pending.notifications || []).filter((n) => n.id >= 2000 && n.id <= 4999);
    if (mine.length) await LocalNotifications.cancel({ notifications: mine.map((n) => ({ id: n.id })) });

    const lead = LEAD_DAYS[settings?.upcomingReminderLead];
    const arrival = Boolean(settings?.upcomingArrivalReminder);
    const nudge = NUDGE_DAYS[settings?.debtNudgeInterval];
    if (!lead && !arrival && !nudge) return;

    const granted = await ensureNotificationPermission();
    if (!granted) return;

    const now = new Date();
    const entries = await db.entries.toArray();
    const upcoming = entries.filter((e) => isFutureDate(e.date));
    const notifications = [];
    const atOn = (dateStr, minusDays = 0) => {
      const at = new Date(`${dateStr}T00:00:00`);
      if (minusDays) at.setDate(at.getDate() - minusDays);
      at.setHours(REMIND_HOUR, 0, 0, 0);
      return at;
    };

    if (lead) {
      upcoming.forEach((e, i) => {
        const at = atOn(e.date, lead);
        if (at > now) {
          notifications.push({
            id: PAY_LEAD_BASE + i,
            title: "Trip coming up",
            body: `"${e.title || "A trip"}" is scheduled for ${e.date}.`,
            schedule: { at, allowWhileIdle: true },
          });
        }
      });
    }
    if (arrival) {
      upcoming.forEach((e, i) => {
        const at = atOn(e.date);
        if (at > now) {
          notifications.push({
            id: PAY_ARRIVAL_BASE + i,
            title: "Scheduled trip is due",
            body: `"${e.title || "A trip"}" is today - time to settle up.`,
            schedule: { at, allowWhileIdle: true },
          });
        }
      });
    }
    if (nudge) {
      const payments = await db.payments.toArray();
      const groups = await db.groups.toArray();
      const ownedMap = new Map(groups.map((g) => [g.id, g.ownerType === "me"]));
      const hasDebt = entries.some((e) => {
        if (isFutureDate(e.date)) return false;
        const owned = ownedMap.get(e.groupId);
        return (e.passengers || []).some(
          (p) => !(owned && isMe(p.who)) && outstanding(e, p.who, payments) > 0.005
        );
      });
      if (hasDebt) {
        const at = new Date(now);
        at.setDate(at.getDate() + nudge);
        at.setHours(REMIND_HOUR, 0, 0, 0);
        notifications.push({
          id: DEBT_NUDGE_ID,
          title: "Unsettled balances",
          body: "You still have unpaid balances - open CarPawl to see who owes what.",
          schedule: { at, allowWhileIdle: true },
        });
      }
    }
    if (notifications.length) await LocalNotifications.schedule({ notifications });
  } catch {
    // ignore - reminders are enhancement only
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
