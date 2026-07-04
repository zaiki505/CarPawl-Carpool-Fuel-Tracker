/* Resolve a `who` (or personId) to a display name. "Me" is the fixed built-in
   identity. Archived people still resolve by name so historical rows read
   correctly (peopleMap should include archived people - see usePeopleMap) ;) */

export function whoName(who, peopleMap) {
  if (!who) return "Someone";
  if (who.type === "me") return "Me";
  const p = peopleMap?.get?.(who.personId);
  return p ? p.name : "Someone";
}

export function personName(personId, peopleMap) {
  const p = peopleMap?.get?.(personId);
  return p ? p.name : "Someone";
}
