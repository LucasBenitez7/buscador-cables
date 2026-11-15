import type { Metadata } from "next";
import { CreateUserForm } from "@/features/users/components/create-user-form";
import { RoleGuide } from "@/features/users/components/role-guide";
import { UserEvents } from "@/features/users/components/user-events";
import { UsersTable } from "@/features/users/components/users-table";
import { requirePermission } from "@/server/session";
import { listUserEvents, listUsers } from "@/server/users/service";

export const metadata: Metadata = { title: "Usuarios" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const current = await requirePermission("user:manage");
  const [users, events] = await Promise.all([listUsers(), listUserEvents()]);
  const pendingCount = users.filter((user) => user.pending).length;

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
        <p className="text-muted-foreground text-sm">
          Cualquiera puede pedir una cuenta con su correo y contraseña, pero no entra hasta que la
          apruebas aquí eligiendo su rol. Desde aquí también se cambian los roles, se desactivan
          cuentas y se dan de alta usuarios directamente.
        </p>
      </div>

      {pendingCount > 0 ? (
        <p role="status" className="border-warning/50 rounded-lg border px-4 py-3 text-sm">
          {pendingCount === 1
            ? "Hay 1 cuenta pendiente de aprobación."
            : `Hay ${pendingCount} cuentas pendientes de aprobación.`}{" "}
          Elige su rol y apruébalas solo si conoces a la persona.
        </p>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="text-base font-medium">Cuentas ({users.length})</h2>
            <UsersTable users={users} currentUserId={current.id} currentRole={current.role} />
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-medium">Dar de alta un usuario</h2>
            <CreateUserForm currentRole={current.role} />
          </section>

          <UserEvents events={events} />
        </div>

        {/* Siempre a la vista: en el escritorio se queda fija al bajar por la página. */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <RoleGuide />
        </aside>
      </div>
    </div>
  );
}
