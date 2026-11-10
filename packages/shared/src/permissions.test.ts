import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
  canManageActor,
  hasAnyPermission,
  hasPermission,
  isRole,
} from "./permissions";

describe("isRole", () => {
  it("accepts every declared role", () => {
    for (const role of ROLES) {
      expect(isRole(role)).toBe(true);
    }
  });

  it("rejects unknown values", () => {
    expect(isRole("ROOT")).toBe(false);
    expect(isRole(undefined)).toBe(false);
    expect(isRole(42)).toBe(false);
  });
});

describe("hasPermission", () => {
  it("gives VIEWER read-only access", () => {
    expect(hasPermission("VIEWER", "cable:read")).toBe(true);
    expect(hasPermission("VIEWER", "export:run")).toBe(true);
    expect(hasPermission("VIEWER", "cable:create")).toBe(false);
    expect(hasPermission("VIEWER", "cable:retire")).toBe(false);
    expect(hasPermission("VIEWER", "user:manage")).toBe(false);
  });

  it("lets TECHNICIAN run field actions but not retire or correct", () => {
    for (const permission of [
      "cable:lay",
      "cable:coil",
      "cable:connect",
      "cable:disconnect",
      "cable:move",
      "cable:create",
      "cable:update",
    ] as const) {
      expect(hasPermission("TECHNICIAN", permission)).toBe(true);
    }

    expect(hasPermission("TECHNICIAN", "cable:retire")).toBe(false);
    expect(hasPermission("TECHNICIAN", "cable:correct")).toBe(false);
    expect(hasPermission("TECHNICIAN", "user:manage")).toBe(false);
  });

  it("lets SUPERVISOR retire, correct and manage catalogs", () => {
    expect(hasPermission("SUPERVISOR", "cable:retire")).toBe(true);
    expect(hasPermission("SUPERVISOR", "cable:correct")).toBe(true);
    expect(hasPermission("SUPERVISOR", "location:manage")).toBe(true);
    expect(hasPermission("SUPERVISOR", "catalog:manage")).toBe(true);
    expect(hasPermission("SUPERVISOR", "import:run")).toBe(true);
    expect(hasPermission("SUPERVISOR", "cable:delete")).toBe(false);
    expect(hasPermission("SUPERVISOR", "user:manage")).toBe(false);
  });

  it("gives ADMIN every declared permission", () => {
    for (const permission of PERMISSIONS) {
      expect(hasPermission("ADMIN", permission)).toBe(true);
    }
  });

  it("never grants a permission outside the declared catalog", () => {
    for (const role of ROLES) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(PERMISSIONS).toContain(permission);
      }
    }
  });
});

describe("hasAnyPermission", () => {
  it("is true when at least one permission matches", () => {
    expect(hasAnyPermission("VIEWER", ["cable:create", "cable:read"])).toBe(true);
  });

  it("is false when none match", () => {
    expect(hasAnyPermission("VIEWER", ["cable:create", "user:manage"])).toBe(false);
  });

  it("is false for an empty list", () => {
    expect(hasAnyPermission("ADMIN", [])).toBe(false);
  });
});

describe("canManageActor", () => {
  it("lets ADMIN manage anyone, including other admins", () => {
    for (const target of ROLES) {
      expect(canManageActor("ADMIN", target)).toBe(true);
    }
  });

  it("lets a role manage only strictly lower ranks", () => {
    expect(canManageActor("SUPERVISOR", "TECHNICIAN")).toBe(true);
    expect(canManageActor("SUPERVISOR", "VIEWER")).toBe(true);
    expect(canManageActor("SUPERVISOR", "SUPERVISOR")).toBe(false);
    expect(canManageActor("SUPERVISOR", "ADMIN")).toBe(false);
  });

  it("never lets VIEWER manage anyone", () => {
    for (const target of ROLES) {
      expect(canManageActor("VIEWER", target)).toBe(false);
    }
  });
});

describe("role hierarchy is monotonic", () => {
  it("each role includes every permission of the role below it", () => {
    const ordered = ["VIEWER", "TECHNICIAN", "SUPERVISOR", "ADMIN"] as const;

    for (let i = 1; i < ordered.length; i += 1) {
      const lower = ROLE_PERMISSIONS[ordered[i - 1]!];
      const higher = ROLE_PERMISSIONS[ordered[i]!];
      for (const permission of lower) {
        expect(higher).toContain(permission);
      }
    }
  });
});
