import { describe, expect, it } from "vitest";
import { escapeHtml, passwordResetEmail, verificationEmail } from "./email-templates";

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

    expect(email.html).not.toContain("<img");
    expect(email.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("escapes the ampersands of the link inside the HTML", () => {
    const email = verificationEmail({ to: "a@b.example", name: "Ana", url: `${url}&x=1` });

    expect(email.html).toContain("token=abc123&amp;x=1");
    expect(email.text).toContain(`${url}&x=1`);
  });
});
