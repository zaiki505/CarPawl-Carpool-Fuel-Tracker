import React, { useMemo, useState } from "react";
import { parseISODate } from "../lib/format.js";
import { partitionUpcoming, upcomingWindowDays, UPCOMING_STEP } from "../lib/upcoming.js";
import { CalendarClock } from "./ui/Icons.jsx";

/* Renders a list of entries with far-future upcoming trips collapsed behind a
   staged "show more" (5 at a time). Upcoming trips are the newest dates, so the
   reveal button and the revealed cards sit at the TOP of the list. Each screen
   passes renderEntry(entry) so it keeps full control of the EntryCard props. */
export function UpcomingReveal({ entries, windowValue, renderEntry }) {
  const days = upcomingWindowDays(windowValue);
  const { visible, hidden } = useMemo(
    () => partitionUpcoming(entries, days),
    [entries, days]
  );
  const [shown, setShown] = useState(0);

  const remaining = Math.max(0, hidden.length - shown);
  // Revealed ones display newest-first (desc), above the within-window entries.
  const revealed = useMemo(
    () =>
      hidden
        .slice(0, shown)
        .sort((a, b) => (parseISODate(b.date) || 0) - (parseISODate(a.date) || 0)),
    [hidden, shown]
  );
  const list = [...revealed, ...visible];

  return (
    <>
      {remaining > 0 && (
        <button
          type="button"
          className="upcoming-more"
          onClick={() => setShown((s) => s + UPCOMING_STEP)}
        >
          <CalendarClock size={15} />
          Show {Math.min(UPCOMING_STEP, remaining)} more upcoming
          <span className="upcoming-more__count">{remaining}</span>
        </button>
      )}
      {list.map(renderEntry)}
    </>
  );
}
