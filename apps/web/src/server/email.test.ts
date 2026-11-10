// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const { sendMail, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn();
  return { sendMail, createTransport: vi.fn((_options: unknown) => ({ sendMail })) };
});

vi.mock("nodemailer", () => ({ default: { createTransport } }));
vi.mock("@/lib/env", () => ({
  env: { SMTP_HOST: "smtp.test", SMTP_PORT: 465, EMAIL_FROM: "Cables <no-reply@cables.test>" },
}));

const { sendEmail } = await import("./email");
// El transporte se crea al importar el módulo; se guarda antes de que Vitest
// limpie el historial de los mocks entre tests.
const transportOptions: unknown = createTransport.mock.calls[0]?.[0];

const message = {
  to: "ana@cables.test",
  subject: "Asunto",
  text: "Texto",
  html: "<p>Texto</p>",
};

describe("sendEmail", () => {
  afterEach(() => {
    sendMail.mockReset();
    vi.restoreAllMocks();
  });

  it("uses TLS on port 465 and no credentials when none are configured", () => {
    expect(transportOptions).toEqual({
      host: "smtp.test",
      port: 465,
      secure: true,
      auth: undefined,
    });
  });

  it("sends from EMAIL_FROM", async () => {
    sendMail.mockResolvedValue({});

    await sendEmail(message);

    expect(sendMail).toHaveBeenCalledWith({ from: "Cables <no-reply@cables.test>", ...message });
  });

  it("logs delivery failures instead of throwing", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    sendMail.mockRejectedValue(new Error("SMTP caído"));

    await expect(sendEmail(message)).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
  });
});
