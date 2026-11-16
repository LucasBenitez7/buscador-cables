import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  PROTECTED_PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
  effectivePermissions,
  hasAnyPermission,
  hasPermission,
  isPermission,
  isRole,
  permissionsOfRole,
} from "./permissions";
import { createRoleSchema, diffPermissions, updateRoleSchema, userGrantsSchema } from "./roles";

describe("isRole and isPermission", () => {
  it("accept the declared values only", () => {
    for (const role of ROLES) expect(isRole(role)).toBe(true);
    expect(isRole("ROOT")).toBe(false);
    expect(isPermission("cable:read")).toBe(true);
    expect(isPermission("cable:fly")).toBe(false);
    expect(isPermission(42)).toBe(false);
  });
});

describe("starting roles", () => {
  const can = (role: (typeof ROLES)[number], permission: (typeof PERMISSIONS)[number]) =>
    hasPermission(permissionsOfRole(role), permission);

  it("keep what each role could do before fase 12", () => {
    expect(can("VIEWER", "cable:read")).toBe(true);
    expect(can("VIEWER", "cable:create")).toBe(false);
    expect(can("TECHNICIAN", "cable:wiring")).toBe(true);
    expect(can("TECHNICIAN", "cable:retire")).toBe(false);
    expect(can("SUPERVISOR", "activity:view")).toBe(true);
    expect(can("SUPERVISOR", "user:manage")).toBe(false);
    for (const permission of PERMISSIONS) expect(can("ADMIN", permission)).toBe(true);
  });

  it("give the protected permissions to the administrator role only", () => {
    for (const role of ROLES.filter((role) => role !== "ADMIN")) {
      for (const permission of PROTECTED_PERMISSIONS) expect(can(role, permission)).toBe(false);
    }
  });

  it("each include every permission of the role below", () => {
    const ordered = ["VIEWER", "TECHNICIAN", "SUPERVISOR", "ADMIN"] as const;
    for (let i = 1; i < ordered.length; i += 1) {
      for (const permission of ROLE_PERMISSIONS[ordered[i - 1]!]) {
        expect(ROLE_PERMISSIONS[ordered[i]!]).toContain(permission);
      }
    }
  });
});

describe("hasAnyPermission", () => {
  it("is true when one matches and false for none or an empty list", () => {
    const viewer = permissionsOfRole("VIEWER");
    expect(hasAnyPermission(viewer, ["cable:create", "cable:read"])).toBe(true);
    expect(hasAnyPermission(viewer, ["cable:create", "user:manage"])).toBe(false);
    expect(hasAnyPermission(permissionsOfRole("ADMIN"), [])).toBe(false);
  });
});

describe("effectivePermissions", () => {
  it("joins the role and the extras, in catalogue order, always with cable:read", () => {
    expect(
      effectivePermissions({
        roleId: "custom",
        rolePermissions: ["cable:connect"],
        grants: ["cable:test", "cable:connect"],
      }),
    ).toEqual(["cable:read", "cable:connect", "cable:test"]);
  });

  it("drops unknown permissions and the protected ones outside the administrator role", () => {
    expect(
      effectivePermissions({
        roleId: "SUPERVISOR",
        rolePermissions: ["cable:read", "user:manage", "cable:fly"],
        grants: ["role:manage"],
      }),
    ).toEqual(["cable:read"]);
    expect(
      effectivePermissions({ roleId: "ADMIN", rolePermissions: ROLE_PERMISSIONS.ADMIN }),
    ).toContain("role:manage");
  });
});

describe("permission catalogue for the screens", () => {
  it("explains every permission exactly once", () => {
    const listed = PERMISSION_GROUPS.flatMap((group) => group.permissions.map((item) => item.id));
    expect([...listed].sort()).toEqual([...PERMISSIONS].sort());
    for (const permission of PERMISSIONS) expect(PERMISSION_LABELS[permission]).toBeTruthy();
  });
});

describe("role and grant schemas", () => {
  it("cleans a role: trims, orders the permissions and always adds cable:read", () => {
    expect(
      createRoleSchema.parse({
        name: "  Conexionista ",
        description: "",
        permissions: ["cable:test", "cable:connect", "cable:test"],
      }),
    ).toEqual({
      name: "Conexionista",
      description: null,
      permissions: ["cable:read", "cable:connect", "cable:test"],
    });
  });

  it("refuses protected or unknown permissions, markup and bad versions", () => {
    const base = { name: "Jefe", permissions: ["cable:read"] };
    expect(createRoleSchema.safeParse({ ...base, permissions: ["user:manage"] }).success).toBe(
      false,
    );
    expect(createRoleSchema.safeParse({ ...base, permissions: ["cable:fly"] }).success).toBe(false);
    expect(createRoleSchema.safeParse({ ...base, name: "<b>x</b>" }).success).toBe(false);
    expect(createRoleSchema.safeParse({ ...base, name: "x" }).success).toBe(false);
    expect(updateRoleSchema.safeParse({ ...base, id: "../x", version: 1 }).success).toBe(false);
    expect(updateRoleSchema.safeParse({ ...base, id: "r1", version: 0 }).success).toBe(false);
  });

  it("refuses protected extras", () => {
    expect(userGrantsSchema.safeParse({ userId: "u", permissions: ["role:manage"] }).success).toBe(
      false,
    );
    expect(userGrantsSchema.parse({ userId: "u", permissions: ["cable:test"] })).toEqual({
      userId: "u",
      permissions: ["cable:test"],
    });
  });

  it("says what was added and removed", () => {
    expect(diffPermissions(["cable:read", "cable:test"], ["cable:read", "cable:lay"])).toEqual({
      added: ["cable:lay"],
      removed: ["cable:test"],
    });
  });
});
