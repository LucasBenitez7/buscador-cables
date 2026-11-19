/**
 * The people of the «Quién» filter of «Actividad»: the current person first, as «Yo», so that
 * whoever sees everyone's activity finds their own in one click; then the rest by name.
 */
export function activityPeople(
  users: readonly { id: string; label: string }[],
  me: { id: string; name: string },
): { id: string; label: string }[] {
  return [{ id: me.id, label: `Yo (${me.name})` }, ...users.filter((user) => user.id !== me.id)];
}
