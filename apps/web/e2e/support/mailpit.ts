/**
 * Mailpit (correo de pruebas): los E2E leen ahí los enlaces de verificación y de
 * recuperación de contraseña. Local: `docker compose up -d`. CI: servicio del job.
 */
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

export async function clearMailbox() {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: "DELETE" });
}

type Summary = { ID: string; Subject: string };

/** Espera el último correo enviado a `to` cuyo asunto encaja y devuelve el primer enlace. */
export async function linkFromLatestEmail(to: string, subject: RegExp): Promise<string> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const response = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
    );
    const { messages } = (await response.json()) as { messages: Summary[] };
    const match = messages.find((message) => subject.test(message.Subject));
    if (match) {
      const message = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${match.ID}`)).json()) as {
        Text: string;
      };
      const link = message.Text.match(/https?:\/\/\S+/)?.[0];
      if (link) {
        return link;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No llegó ningún correo a ${to} con asunto ${subject}.`);
}
