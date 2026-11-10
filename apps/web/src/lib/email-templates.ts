import type { OutgoingEmail } from "@/server/email";

const APP_NAME = "Buscador de Cables";

function layout(title: string, body: string, actionLabel: string, url: string): string {
  return `<!doctype html>
<html lang="es">
  <body style="font-family:Arial,Helvetica,sans-serif;color:#202321">
    <h1 style="font-size:20px">${title}</h1>
    <p>${body}</p>
    <p><a href="${url}" style="display:inline-block;padding:10px 16px;background:#202321;color:#fff;text-decoration:none;border-radius:6px">${actionLabel}</a></p>
    <p style="font-size:12px;color:#666">Si el botón no funciona, copia este enlace en tu navegador:<br>${url}</p>
    <p style="font-size:12px;color:#666">${APP_NAME}</p>
  </body>
</html>`;
}

export function passwordResetEmail(input: {
  to: string;
  name: string;
  url: string;
}): OutgoingEmail {
  const body = `Hola ${input.name}. Hemos recibido una solicitud para restablecer tu contraseña. El enlace caduca en 1 hora y solo puede usarse una vez.`;
  return {
    to: input.to,
    subject: `${APP_NAME}: restablecer contraseña`,
    text: `Hola ${input.name}.\n\nRestablece tu contraseña en este enlace (caduca en 1 hora):\n${input.url}\n\nSi no lo has pedido, ignora este correo.`,
    html: layout("Restablecer contraseña", body, "Restablecer contraseña", input.url),
  };
}

export function verificationEmail(input: { to: string; name: string; url: string }): OutgoingEmail {
  const body = `Hola ${input.name}. Confirma tu dirección de correo para completar tu cuenta.`;
  return {
    to: input.to,
    subject: `${APP_NAME}: confirma tu correo`,
    text: `Hola ${input.name}.\n\nConfirma tu correo en este enlace:\n${input.url}`,
    html: layout("Confirma tu correo", body, "Confirmar correo", input.url),
  };
}
