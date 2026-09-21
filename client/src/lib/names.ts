/** Anyone the app might have to put on screen. */
type Person = { name: string | null; email: string };

/**
 * What to call someone, almost everywhere.
 *
 * This is six friends planning a weekend, not a staff directory — "Simon" is
 * how the room refers to Simon, and a page of full names reads like a formal
 * invitation to something nobody agreed to attend. Somebody an admin has added
 * who hasn't signed in yet has no name at all, so fall back to the local part
 * of their email rather than the whole address.
 *
 * Full names still belong where identity is the point rather than the tone:
 * the admin user list at `/users`, and every avatar's hover title, which is
 * also what tells two Simons apart.
 */
export function firstName(user: Person): string {
  const source = user.name?.trim() || user.email.split("@")[0] || user.email;
  return source.split(/\s+/)[0] || source;
}

/** The whole name, for the places that want it. Email if there isn't one. */
export function fullName(user: Person): string {
  return user.name?.trim() || user.email;
}
