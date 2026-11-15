import { prisma } from "@cables/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Sent = { to: string; subject: string; text: string };
const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn<(email: Sent) => Promise<void>>() }));
vi.mock("@/server/email", () => ({ sendEmail }));

const { notifyAccountChange, notifyAdminsOfPendingAccount, notifyPasswordChanged } =
  await import("./account-notifications");

const sent = () =>
  sendEmail.mock.calls.map(([email]) => ({
    to: email.to,
    subject: email.subject.replace("Buscador de Cables: ", ""),
  }));

beforeEach(async () => {
  sendEmail.mockReset();
  await prisma.$executeRawUnsafe('TRUNCATE "user" CASCADE');
  await prisma.user.createMany({
    data: [
      { id: "a1", name: "Ada", email: "ada@cables.test", role: "ADMIN", approvedAt: new Date() },
      { id: "a2", name: "Bea", email: "bea@cables.test", role: "ADMIN", approvedAt: new Date() },
      // Administradora desactivada: nunca recibe avisos.
      {
        id: "a3",
        name: "Cris",
        email: "cris@cables.test",
        role: "ADMIN",
        active: false,
        approvedAt: new Date(),
      },
      {
        id: "s1",
        name: "Sol",
        email: "sol@cables.test",
        role: "SUPERVISOR",
        approvedAt: new Date(),
      },
      { id: "n1", name: "Nico", email: "nico@cables.test", active: false },
      { id: "n2", name: "Noa", email: "noa@cables.test", active: false },
    ],
  });
});

// Fase 10: quién recibe cada aviso de las cuentas (docs/ARQUITECTURA.md, "Correos y avisos").
describe("account notifications", () => {
  it("tells only the active administrators about an account waiting, with how many wait", async () => {
    await notifyAdminsOfPendingAccount("n1");

    expect(sent()).toEqual([
      { to: "ada@cables.test", subject: "cuenta pendiente: Nico" },
      { to: "bea@cables.test", subject: "cuenta pendiente: Nico" },
    ]);
    expect(sendEmail.mock.calls[0]![0].text).toContain("Pendientes ahora: 2");
  });

  it("welcomes the approved person and nobody else", async () => {
    await notifyAccountChange(
      {
        action: "APPROVED",
        user: { id: "n1", name: "Nico", email: "nico@cables.test" },
        toRole: "TECHNICIAN",
      },
      { id: "a1", name: "Ada" },
    );

    expect(sent()).toEqual([{ to: "nico@cables.test", subject: "tu cuenta está aprobada" }]);
  });

  it("tells the other active administrators when someone becomes an administrator", async () => {
    await notifyAccountChange(
      {
        action: "ROLE_CHANGED",
        user: { id: "s1", name: "Sol", email: "sol@cables.test" },
        fromRole: "SUPERVISOR",
        toRole: "ADMIN",
      },
      { id: "a1", name: "Ada" },
    );

    expect(sent()).toEqual([
      { to: "sol@cables.test", subject: "ahora eres Administrador" },
      { to: "bea@cables.test", subject: "Sol es administrador/a" },
    ]);
  });

  it("tells the person about deactivation, and the owner about a password change", async () => {
    await notifyAccountChange(
      { action: "DEACTIVATED", user: { id: "s1", name: "Sol", email: "sol@cables.test" } },
      { id: "a1", name: "Ada" },
    );
    await notifyPasswordChanged({ name: "Sol", email: "sol@cables.test" });

    expect(sent()).toEqual([
      { to: "sol@cables.test", subject: "tu cuenta está desactivada" },
      { to: "sol@cables.test", subject: "tu contraseña ha cambiado" },
    ]);
  });
});
