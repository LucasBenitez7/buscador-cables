"use client";

import { cn } from "cn";
import {
  PERMISSION_GROUPS,
  REQUIRED_PERMISSIONS,
  isProtectedPermission,
  type Permission,
} from "@cables/shared";

type Props = {
  /** What is ticked. */
  value: readonly Permission[];
  onChange: (next: Permission[]) => void;
  /** Ticked and fixed, with why ("por su rol"): what the person already has from their role. */
  fixed?: { permissions: readonly Permission[]; reason: string };
  disabled?: boolean;
  /** Show the administration block (only for reading the administrator role). */
  showProtected?: boolean;
};

/**
 * The permission catalogue by topic, each one explained in plain words, as checkboxes. "Ver
 * cables" is always ticked; the administration permissions are never offered: they belong to
 * the administrator role only (the server and the database refuse them anyway).
 */
export function PermissionPicker({ value, onChange, fixed, disabled, showProtected }: Props) {
  const isFixed = (permission: Permission) =>
    (REQUIRED_PERMISSIONS as readonly string[]).includes(permission) ||
    Boolean(fixed?.permissions.includes(permission));

  function toggle(permission: Permission, checked: boolean) {
    const next = checked ? [...value, permission] : value.filter((item) => item !== permission);
    onChange([...new Set(next)]);
  }

  return (
    <div className="space-y-4">
      {PERMISSION_GROUPS.filter(
        (group) =>
          showProtected || !group.permissions.every((item) => isProtectedPermission(item.id)),
      ).map((group) => (
        <fieldset key={group.title} className="bg-card space-y-2 rounded-lg border p-3">
          <legend className="px-1 text-sm font-semibold">{group.title}</legend>
          <ul className="space-y-2">
            {group.permissions.map((item) => {
              const locked = disabled || isFixed(item.id) || isProtectedPermission(item.id);
              const checked = value.includes(item.id) || isFixed(item.id);
              const id = `permiso-${item.id.replace(":", "-")}`;
              return (
                <li key={item.id} className="flex items-start gap-3">
                  <input
                    id={id}
                    type="checkbox"
                    checked={checked}
                    disabled={locked}
                    onChange={(event) => toggle(item.id, event.target.checked)}
                    className="accent-primary mt-1 size-4 shrink-0"
                  />
                  <label htmlFor={id} className={cn("text-sm", locked && "opacity-80")}>
                    <span className="font-medium">{item.label}</span>
                    {fixed?.permissions.includes(item.id) ? (
                      <span className="text-muted-foreground"> · {fixed.reason}</span>
                    ) : null}
                    <span className="text-muted-foreground block text-xs">{item.help}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
    </div>
  );
}
