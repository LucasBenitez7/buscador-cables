import { ROLE_LABELS, type Role } from "@cables/shared";
import type { UserEventRow } from "@/server/users/service";

const dateFormat = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});

const role = (value: Role | null) => (value ? ROLE_LABELS[value] : "");

/** "Admin aprobó a Ana como Técnico". */
export function describeUserEvent(event: UserEventRow): string {
  switch (event.action) {
    case "CREATED":
      return `${event.actor} dio de alta a ${event.target} como ${role(event.toRole)}`;
    case "APPROVED":
      return `${event.actor} aprobó a ${event.target} como ${role(event.toRole)}`;
    case "ROLE_CHANGED":
      return `${event.actor} cambió a ${event.target} de ${role(event.fromRole)} a ${role(event.toRole)}`;
    case "DEACTIVATED":
      return `${event.actor} desactivó a ${event.target}`;
    case "REACTIVATED":
      return `${event.actor} reactivó a ${event.target}`;
  }
}

/** The audit of the accounts: who approved, changed or deactivated whom, and when. */
export function UserEvents({ events }: { events: UserEventRow[] }) {
  return (
    <section aria-labelledby="user-events" className="space-y-3">
      <div className="space-y-1">
        <h2 id="user-events" className="text-base font-medium">
          Cambios en las cuentas
        </h2>
        <p className="text-muted-foreground text-xs">
          Los últimos cambios hechos desde este panel: quién aprobó, cambió de rol o desactivó a
          quién. No se pueden editar ni borrar.
        </p>
      </div>
      {events.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border p-4 text-sm">
          Todavía no hay cambios registrados.
        </p>
      ) : (
        <ol className="divide-y rounded-lg border text-sm">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex flex-col gap-0.5 px-4 py-2 sm:flex-row sm:justify-between sm:gap-4"
            >
              <span>{describeUserEvent(event)}</span>
              <time
                dateTime={event.createdAt.toISOString()}
                className="text-muted-foreground shrink-0 text-xs tabular-nums"
              >
                {dateFormat.format(event.createdAt)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
