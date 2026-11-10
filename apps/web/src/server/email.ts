import "server-only";
import nodemailer from "nodemailer";
import { env } from "@/lib/env";

export type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

// Mailpit en local no exige autenticación; en producción se usan SMTP_USER y SMTP_PASSWORD.
const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: false,
  auth:
    env.SMTP_USER && env.SMTP_PASSWORD
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
      : undefined,
});

/**
 * Sends an email. Errors are logged and not rethrown so that auth endpoints do
 * not reveal, through timing or error codes, whether an address exists.
 */
export async function sendEmail(message: OutgoingEmail): Promise<void> {
  try {
    await transporter.sendMail({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  } catch (error) {
    console.error("No se pudo enviar el correo", error);
  }
}
