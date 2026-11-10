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

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
        <p className="text-muted-foreground text-sm">
          No hay registro público. Las altas las hace un administrador y el usuario puede cambiar su
          contraseña desde “He olvidado mi contraseña”.
        </p>
      </div>

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
