import { describe, expect, it } from "vitest";
import { passwordResetEmail, verificationEmail } from "./email-templates";

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
