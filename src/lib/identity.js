/* "who" identity helpers.

   A passenger/payer is identified by a `who` object:
    { type: 'me' } -> the app's single built-in user
    { type: 'person', personId: '...' } -> a saved Person

   "Me" is never a Person row. In owned groups (ownerType === 'me') the owner is
   never added as a passenger at all; "me" only appears as a passenger in
   non-owned groups. These helpers give a stable string key and equality so we
   can group/sum by payer consistently. 
   
   REMEMBER: "me" is a special case and
   should not be treated as a regular person.  */

export const ME = Object.freeze({ type: "me" });

export function person(personId) {
  return { type: "person", personId };
}

/** Stable string key for a `who`, safe to use as an object/Map key. */
export function whoKey(who) {
  if (!who) return "?";
  return who.type === "me" ? "me" : `person:${who.personId}`;
}

export function whoEquals(a, b) {
  if (!a || !b) return false;
  if (a.type !== b.type) return false;
  if (a.type === "me") return true;
  return a.personId === b.personId;
}

export function isMe(who) {
  return Boolean(who) && who.type === "me";
}
