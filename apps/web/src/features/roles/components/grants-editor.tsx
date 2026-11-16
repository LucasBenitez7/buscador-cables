"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Permission } from "@cables/shared";
import { Button } from "@/components/ui/button";
import { setUserGrantsAction } from "@/features/roles/actions";
import { PermissionPicker } from "./permission-picker";

/**
 * The extra permissions of one person: what their role already gives is ticked and fixed ("por
 * su rol"); the rest can be added only for them.
 */
export function GrantsEditor({
  userId,
  roleName,
  rolePermissions,
  extras,
}: {
  userId: string;
  roleName: string;
  rolePermissions: Permission[];
  extras: Permission[];
}) {
  const router = useRouter();
  const [value, setValue] = useState<Permission[]>(extras);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const response = await setUserGrantsAction({
        userId,
        permissions: value.filter((permission) => !rolePermissions.includes(permission)),
      });
      setResult(response);
      if (response.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <PermissionPicker
        value={value}
        onChange={setValue}
        fixed={{ permissions: rolePermissions, reason: `por su rol (${roleName})` }}
      />
      {result ? (
        <p
          role={result.ok ? "status" : "alert"}
          className={result.ok ? "text-success text-sm" : "text-destructive text-sm"}
        >
          {result.message}
        </p>
      ) : null}
      <Button type="button" onClick={save} disabled={pending}>
        {pending ? "Guardando…" : "Guardar permisos extra"}
      </Button>
    </div>
  );
}
