import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_ERROR_CODES } from "@/lib/auth-errors";
import { LoginForm } from "./login-form";

const { signInEmail, replace, refresh } = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({ authClient: { signIn: { email: signInEmail } } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));

function submit() {
  fireEvent.change(screen.getByLabelText("Correo electrónico"), {
    target: { value: "ana@cables.test" },
  });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "clave-segura-1" } });
  fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
}

describe("LoginForm", () => {
  beforeEach(() => {
    signInEmail.mockReset();
    replace.mockReset();
    refresh.mockReset();
  });

  // Regresión: se pasaba `callbackURL` a signIn.email y Better Auth redirigía ahí
  // tras un login correcto (a /verify-email), ignorando la página pedida.
  it("goes to the requested page and never asks Better Auth to redirect", async () => {
    signInEmail.mockResolvedValue({ data: {}, error: null });
    render(<LoginForm next="/locations" />);

    submit();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/locations"));
    expect(signInEmail).toHaveBeenCalledWith({
      email: "ana@cables.test",
      password: "clave-segura-1",
      rememberMe: true,
    });
    expect(signInEmail.mock.calls[0]?.[0]).not.toHaveProperty("callbackURL");
  });

  it("explains unverified emails and stays on the page", async () => {
    signInEmail.mockResolvedValue({
      data: null,
      error: { status: 403, code: AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED },
    });
    render(<LoginForm next="/" />);

    submit();

    await screen.findByText(/aún no está confirmado/);
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows the reset notice", () => {
    render(<LoginForm next="/" notice="Contraseña actualizada. Ya puedes entrar." />);

    expect(screen.getByRole("status")).toHaveTextContent("Contraseña actualizada");
  });
});
