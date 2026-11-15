import { describe, expect, it } from "vitest";
import {
  accountCreatedEmail,
  accountDeactivatedEmail,
  accountExistsEmail,
  accountReactivatedEmail,
  escapeHtml,
  newAdminEmail,
  passwordChangedEmail,
  passwordResetEmail,
  pendingApprovalEmail,
  roleChangedEmail,
  verificationEmail,
  welcomeEmail,
} from "./email-templates";

const url = "https://cables.example/reset-password?token=abc123";

describe("passwordResetEmail", () => {
  it("is addressed to the user, in Spanish, and includes the link", () => {
    const email = passwordResetEmail({ to: "ana@planta.example", name: "Ana", url });

    expect(email.to).toBe("ana@planta.example");
    expect(email.subject).toMatch(/restablecer contraseña/i);
    expect(email.text).toContain(url);
    expect(email.html).toContain(url);
    expect(email.text).toMatch(/1 hora/);
  });
});

describe("verificationEmail", () => {
  it("includes the confirmation link", () => {
    const email = verificationEmail({ to: "ana@planta.example", name: "Ana", url });

    expect(email.subject).toMatch(/confirma tu correo/i);
    expect(email.text).toContain(url);
  });
});

// Regresión: el nombre y la URL se insertaban en el HTML sin escapar.
describe("HTML escaping", () => {
  it("escapes special characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
    );
  });

  it("does not inject markup from the user name into the HTML body", () => {
    const email = passwordResetEmail({
      to: "ana@planta.example",
      name: '<img src=x onerror="alert(1)">',
      url,
    });

    expect(email.html).not.toContain("<img src=x");
    expect(email.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("escapes the ampersands of the link inside the HTML", () => {
    const email = verificationEmail({ to: "a@b.example", name: "Ana", url: `${url}&x=1` });

    expect(email.html).toContain("token=abc123&amp;x=1");
    expect(email.text).toContain(`${url}&x=1`);
  });
});

describe("accountExistsEmail", () => {
  it("points the owner to password recovery", () => {
    const email = accountExistsEmail({
      to: "ana@planta.example",
      name: "Ana <b>",
      forgotPasswordUrl: "https://cables.example/forgot-password",
    });

    expect(email.subject).toMatch(/ya tienes una cuenta/i);
    expect(email.text).toContain("https://cables.example/forgot-password");
    expect(email.html).toContain("Ana &lt;b&gt;");
  });
});

describe("pendingApprovalEmail", () => {
  it("tells the administrator who waits, since when, how many and where to approve", () => {
    const email = pendingApprovalEmail({
      to: "admin@planta.example",
      applicantName: "Nico <b>",
      applicantEmail: "nico@planta.example",
      registeredAt: new Date("2026-11-15T09:30:00Z"),
      pendingCount: 3,
      usersUrl: "https://cables.example/admin/users",
    });

    expect(email.to).toBe("admin@planta.example");
    expect(email.subject).toBe("Buscador de Cables: cuenta pendiente: Nico <b>");
    expect(email.text).toContain("Correo: nico@planta.example");
    expect(email.text).toContain("Pedida el: 15 de noviembre de 2026, a las 10:30");
    expect(email.text).toContain("Pendientes ahora: 3");
    expect(email.text).toContain("https://cables.example/admin/users");
    expect(email.html).toContain("Nico &lt;b&gt;");
    expect(email.html).not.toContain("<b>");
  });
});

// Fase 10: correos con el logo y un aspecto común.
describe("email layout", () => {
  it("shows the logo of the app, a button and a footer, with a preheader", () => {
    const email = verificationEmail({ to: "ana@planta.example", name: "Ana", url });

    expect(email.html).toMatch(/<img src="https?:\/\/[^"]+\/brand\/logo-email\.png"/);
    expect(email.html).toContain(">Confirmar correo</a>");
    expect(email.html).toContain("Correo automático de Buscador de Cables");
    expect(email.html).toContain('style="display:none');
    expect(email.text).toContain(`Confirmar correo: ${url}`);
  });
});

describe("account emails to the person", () => {
  const loginUrl = "https://cables.example/login";
  const forgot = "https://cables.example/forgot-password";

  it("welcomes an approved account with its role and what it can do", () => {
    const email = welcomeEmail({
      to: "nico@planta.example",
      name: "Nico",
      role: "TECHNICIAN",
      loginUrl,
    });

    expect(email.subject).toMatch(/aprobada/i);
    expect(email.text).toContain("Bienvenido/a, Nico");
    expect(email.text).toContain("Tu rol: Técnico");
    expect(email.text).toContain("- Conectar, desconectar y timbrar.");
    expect(email.text).toContain(`Entrar: ${loginUrl}`);
  });

  it("welcomes an account created from the panel and explains the temporary password", () => {
    const email = accountCreatedEmail({
      to: "ana@planta.example",
      name: "Ana",
      role: "SUPERVISOR",
      createdBy: "Ada",
      loginUrl,
      forgotPasswordUrl: forgot,
    });

    expect(email.text).toContain("Ada te ha dado de alta");
    expect(email.text).toContain("contraseña temporal");
    expect(email.text).toContain("Tu rol: Supervisor");
    expect(email.text).toContain(forgot);
  });

  it("tells the new role, the old one and what it can do now", () => {
    const email = roleChangedEmail({
      to: "ana@planta.example",
      name: "Ana",
      fromRole: "VIEWER",
      toRole: "TECHNICIAN",
      changedBy: "Ada",
      loginUrl,
    });

    expect(email.subject).toBe("Buscador de Cables: ahora eres Técnico");
    expect(email.text).toContain("Antes: Consulta");
    expect(email.text).toContain("Ahora: Técnico");
  });

  it("warns about a password change, in case it was not them", () => {
    const email = passwordChangedEmail({
      to: "ana@planta.example",
      name: "Ana",
      changedAt: new Date("2026-11-15T09:30:00Z"),
      forgotPasswordUrl: forgot,
    });

    expect(email.subject).toMatch(/contraseña ha cambiado/);
    expect(email.text).toContain("Si no has sido tú");
    expect(email.html).toContain("border-left:4px solid");
  });

  it("tells about deactivation without a button, and about reactivation with one", () => {
    const off = accountDeactivatedEmail({ to: "ana@planta.example", name: "Ana" });
    const on = accountReactivatedEmail({ to: "ana@planta.example", name: "Ana", loginUrl });

    expect(off.html).not.toContain("<a href");
    expect(off.text).toContain("habla con un administrador");
    expect(on.text).toContain(`Entrar: ${loginUrl}`);
  });
});

describe("newAdminEmail", () => {
  it("tells the other administrators who is a new administrator and who did it", () => {
    const email = newAdminEmail({
      to: "otro@planta.example",
      adminName: "Ana",
      adminEmail: "ana@planta.example",
      grantedBy: "Ada",
      usersUrl: "https://cables.example/admin/users",
    });

    expect(email.subject).toBe("Buscador de Cables: Ana es administrador/a");
    expect(email.text).toContain("Lo ha hecho: Ada");
    expect(email.text).toContain("auditoría");
  });
});
