import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { groupBalances } from "./calc.js";
import { formatMoney, formatMoneyShort, formatDate } from "./format.js";
import { whoName } from "./names.js";

/* Plain-text balances export for sharing. Lists every passenger's
   current outstanding balance in a group. Delivered through the device's native
   share sheet. */
export function buildWhatsAppText(group, entries, payments, peopleMap) {
  // In your own vehicle, your own billed share is never collectable (you
  // paid the pump) - exclude it here the same way the Balances screen does,
  // or the shared text would list "Me" as an outstanding balance to yourself.
  const balances = groupBalances(entries, payments, { excludeMe: group.ownerType === "me" });
  const lines = [];
  lines.push(`⛽ ${group.name} - fuel balances`);
  lines.push(`(as of ${formatDate(new Date().toISOString())})`);
  lines.push("");

  const owing = balances.filter((b) => b.owed > 0);
  if (owing.length === 0) {
    lines.push("Everyone's all settled 🎉");
  } else {
    for (const b of owing) {
      let line = `• ${whoName(b.who, peopleMap)}: ${formatMoney(b.owed)}`;
      if (b.credit > 0) line += ` (${formatMoneyShort(b.credit)} credit held)`;
      lines.push(line);
    }
  }

  const credits = balances.filter((b) => b.credit > 0 && b.owed === 0);
  if (credits.length) {
    lines.push("");
    for (const b of credits) {
      lines.push(`• ${whoName(b.who, peopleMap)}: ${formatMoneyShort(b.credit)} in credit`);
    }
  }

  lines.push("");
  lines.push("- sent from CarPawl 🐾");
  return lines.join("\n");
}

/**
 * Share text via the OS share sheet, falling back to clipboard.
 * On native (Android/iOS) uses @capacitor/share - the WebView often doesn't
 * implement navigator.share, so relying on the Web Share API alone would
 * silently degrade to clipboard on the very platform where a real share sheet
 * matters most. On web it uses navigator.share when available, else clipboard.
 * @returns {'shared'|'copied'|'failed'}
 */
export async function shareText(text, title) {
  if (Capacitor.isNativePlatform()) {
    try {
      await Share.share({ title, text, dialogTitle: title });
      return "shared";
    } catch (e) {
      // User cancelled the sheet - treat as a non-error, don't spam clipboard.
      if (e?.message && /cancel/i.test(e.message)) return "shared";
      // Genuine failure - fall through to clipboard below.
    }
  } else if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return "shared";
    } catch (e) {
      // User dismissed the share sheet, fall through to clipboard on other failures
      if (e && e.name === "AbortError") return "shared";
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
