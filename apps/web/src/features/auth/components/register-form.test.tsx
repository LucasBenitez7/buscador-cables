import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RegisterForm } from "./register-form";

const { signUpEmail } = vi.hoisted(() => ({ signUpEmail: vi.fn() }));

vi.mock("@/lib/auth-client", () => ({ authClient: { signUp: { email: signUpEmail } } }));

function fill(values: Partial<Record<"name" | "email" | "password" | "confirm", string>>) {
  const data = {
    name: "Luis Gómez",
    email: "Luis@Planta.example",
    password: "clave-segura-1",
    confirm: "clave-segura-1",
    ...values,
  };
  fireEvent.change(screen.getByLabelText("Nombre y apellidos"), { target: { value: data.name } });
  fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: data.email } });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: data.password } });
  fireEvent.change(screen.getByLabelText("Repite la contraseña"), {
    target: { value: data.confirm },
  });
  fireEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
}

describe("RegisterForm", () => {
  beforeEach(() => {
    signUpEmail.mockReset();
    render(<RegisterForm />);
  });

  it("signs up with normalized data and asks to check the inbox", async () => {
    signUpEmail.mockResolvedValue({ data: {}, error: null });

    fill({});

    await screen.findByText(/te hemos enviado un correo/i);
    expect(signUpEmail).toHaveBeenCalledWith({
      name: "Luis Gómez",
      email: "luis@planta.example",
      password: "clave-segura-1",
      callbackURL: "/verify-email",
    });
  });

  it("does not call the server when the passwords differ", async () => {
    fill({ confirm: "otra-clave-123" });

    await screen.findByText("Las contraseñas no coinciden");
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("shows a rate limit message", async () => {
    signUpEmail.mockResolvedValue({ data: null, error: { status: 429 } });

    fill({});

    await screen.findByText(/demasiados intentos/i);
  });
});
