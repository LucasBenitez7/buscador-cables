import type { Metadata } from "next";
import { CreateUserForm } from "@/features/users/components/create-user-form";
import { UsersTable } from "@/features/users/components/users-table";
import { requirePermission } from "@/server/session";
import { listUsers } from "@/server/users/service";

export const metadata: Metadata = { title: "Usuarios" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const current = await requirePermission("user:manage");
  const users = await listUsers();
  const pendingCount = users.filter((user) => user.pending).length;

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
        <p className="text-muted-foreground text-sm">
          Cualquiera puede pedir una cuenta con su correo y contraseña, pero no entra hasta que la
          apruebas aquí; empieza con rol de consulta. Desde aquí también se cambian los roles, se
          desactivan cuentas y se dan de alta usuarios directamente.
        </p>
      </div>

      {pendingCount > 0 ? (
        <p role="status" className="border-warning/50 rounded-lg border px-4 py-3 text-sm">
          {pendingCount === 1
            ? "Hay 1 cuenta pendiente de aprobación."
            : `Hay ${pendingCount} cuentas pendientes de aprobación.`}{" "}
          Aprueba solo a las personas que conozcas.
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-base font-medium">Dar de alta un usuario</h2>
        <CreateUserForm currentRole={current.role} />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-medium">Cuentas ({users.length})</h2>
        <UsersTable users={users} currentUserId={current.id} currentRole={current.role} />
      </section>
    </div>
  );
}
