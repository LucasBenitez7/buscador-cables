// @vitest-environment node
import { APIError } from "better-auth/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearLoginFailures: vi.fn(),
  recordLoginFailure: vi.fn(),
  notifyPasswordChanged: vi.fn(),
}));

vi.mock("@/server/login-throttle", () => ({
  clearLoginFailures: mocks.clearLoginFailures,
  recordLoginFailure: mocks.recordLoginFailure,
}));
vi.mock("@/server/account-notifications", () => ({
  notifyPasswordChanged: mocks.notifyPasswordChanged,
}));

const { afterPasswordChange, changedPasswordOwner } = await import("./password-change");

const owner = { name: "Ana Pérez", email: "ana@planta.example" };
const wrongPassword = APIError.from("BAD_REQUEST", {
  code: "INVALID_PASSWORD",
  message: "Invalid password",
});

describe("changedPasswordOwner", () => {
  it("reads the person from Better Auth's answer", () => {
    expect(changedPasswordOwner({ token: null, user: { id: "u1", ...owner } })).toEqual(owner);
  });

  it("is null for an error or anything else", () => {
    expect(changedPasswordOwner(wrongPassword)).toBeNull();
    expect(changedPasswordOwner(null)).toBeNull();
    expect(changedPasswordOwner({ user: { name: 1 } })).toBeNull();
  });
});

describe("afterPasswordChange", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  it("tells the owner by email and clears the failed attempts", async () => {
    await afterPasswordChange(owner, { token: "t", user: owner });

    expect(mocks.notifyPasswordChanged).toHaveBeenCalledWith(owner);
    expect(mocks.clearLoginFailures).toHaveBeenCalledWith(owner.email);
    expect(mocks.recordLoginFailure).not.toHaveBeenCalled();
  });

  // Sin esto, «Mi cuenta» servía para adivinar la contraseña sin el bloqueo del inicio de sesión.
  it("counts a wrong current password like a failed sign-in", async () => {
    await afterPasswordChange(owner, wrongPassword);

    expect(mocks.recordLoginFailure).toHaveBeenCalledWith(owner.email);
    expect(mocks.notifyPasswordChanged).not.toHaveBeenCalled();
  });

  it("does not count other errors", async () => {
    await afterPasswordChange(
      owner,
      APIError.from("BAD_REQUEST", { code: "PASSWORD_TOO_SHORT", message: "short" }),
    );

    expect(mocks.recordLoginFailure).not.toHaveBeenCalled();
    expect(mocks.notifyPasswordChanged).not.toHaveBeenCalled();
  });
});
