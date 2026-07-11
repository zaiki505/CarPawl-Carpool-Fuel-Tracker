/* Shared definitions for the app's concepts, used by both the inline info
   tooltips (InfoTip) and the "How it works" concepts page. `short` is a
   one-liner for the tooltip; `long` is a fuller explanation for the page. */

export const GLOSSARY = {
  ownVsCarpool: {
    term: "My car vs Carpool",
    short: "A car you own (you paid the pump) vs riding in someone else's car (you owe them your share).",
    long: "A 'My Vehicle' is a car you own - you paid for the fuel, so passengers owe you their share. A 'Carpool' is someone else's car you ride in - you owe the owner your share of their fuel.",
  },
  distanceSplit: {
    term: "Distance split",
    short: "Each passenger pays for the distance they actually rode.",
    long: "The fuel cost is divided by how far each passenger travelled. Someone who got off early pays less. The driver's own distance is tracked but never billed.",
  },
  equalSplit: {
    term: "Equal split",
    short: "The fuel cost is divided evenly among everyone on the trip.",
    long: "Everyone on the trip pays the same share of the fuel, regardless of how far they rode.",
  },
  customSplit: {
    term: "Custom split",
    short: "Split by distance plus tolls, parking and a maintenance markup, with optional fixed amounts.",
    long: "For drivers who want to recover more than just fuel: add tolls, parking and a % maintenance markup on top, then split the total. You can also pin a fixed amount for any passenger.",
  },
  maintenanceMarkup: {
    term: "Maintenance markup",
    short: "An extra % added on top of fuel to cover wear and tear (Custom split only).",
    long: "A percentage added to the fuel + parking total so the driver recovers a bit toward maintenance. Set a default in Settings; each trip can override it.",
  },
  credit: {
    term: "Credit",
    short: "Money someone overpaid - it sits as credit until it's applied or refunded.",
    long: "When a passenger pays more than they owe on a trip, the extra becomes credit they hold with that owner. It isn't automatically used up - you choose when to apply it.",
  },
  creditOffset: {
    term: "Applying credit",
    short: "Use someone's overpayment to reduce another debt they owe the same person.",
    long: "Credit can be applied against other debts the same person owes the same owner. You pick which debts to offset; every application is recorded in history and can be undone.",
  },
  upcoming: {
    term: "Upcoming",
    short: "A trip dated in the future - it doesn't count toward balances until its date arrives.",
    long: "A future-dated trip or refuel, shown as scheduled. It stays out of your balances and spend totals until the date arrives, then starts counting.",
  },
  prepay: {
    term: "Prepay",
    short: "Record a payment on an upcoming trip in advance; it's held until the date arrives.",
    long: "You can record a payment against an upcoming trip before its date. The money is held out of live balances until the trip date, then nets out.",
  },
  recurring: {
    term: "Repeats",
    short: "A trip that auto-schedules its next occurrence (daily/weekly/monthly/yearly).",
    long: "Set a schedule and CarPawl auto-creates the next occurrence as an upcoming trip. When it passes, the next one is scheduled - so a regular commute logs itself.",
  },
  driveSync: {
    term: "Google Drive sync",
    short: "Keeps your data in sync across devices via a hidden file in your Drive.",
    long: "Stores one private file in your Google Drive's hidden app folder to sync across your devices. It never touches your normal Drive files, and works offline in between syncs.",
  },
};
