import type { OutgoingEmail } from "@/server/email";

const APP_NAME = "Buscador de Cables";

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes text before interpolating it into the HTML body of an email. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

function layout(title: string, body: string, actionLabel: string, rawUrl: string): string {
  const url = escapeHtml(rawUrl);
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
  const body = `Hola ${escapeHtml(input.name)}. Hemos recibido una solicitud para restablecer tu contraseña. El enlace caduca en 1 hora y solo puede usarse una vez.`;
  return {
    to: input.to,
    subject: `${APP_NAME}: restablecer contraseña`,
    text: `Hola ${input.name}.\n\nRestablece tu contraseña en este enlace (caduca en 1 hora):\n${input.url}\n\nSi no lo has pedido, ignora este correo.`,
    html: layout("Restablecer contraseña", body, "Restablecer contraseña", input.url),
  };
}

export function verificationEmail(input: { to: string; name: string; url: string }): OutgoingEmail {
  const body = `Hola ${escapeHtml(input.name)}. Confirma tu dirección de correo para activar tu cuenta. El enlace caduca en 24 horas.`;
  return {
    to: input.to,
    subject: `${APP_NAME}: confirma tu correo`,
    text: `Hola ${input.name}.\n\nConfirma tu correo en este enlace (caduca en 24 horas):\n${input.url}`,
    html: layout("Confirma tu correo", body, "Confirmar correo", input.url),
  };
}

/** Sent to every active administrator when a new account confirms its email. */
export function pendingApprovalEmail(input: {
  to: string;
  applicantName: string;
  applicantEmail: string;
  usersUrl: string;
}): OutgoingEmail {
  const who = `${input.applicantName} (${input.applicantEmail})`;
  return {
    to: input.to,
    subject: `${APP_NAME}: cuenta pendiente de aprobación`,
    text: `${who} ha creado una cuenta y ha confirmado su correo.\n\nNo podrá entrar hasta que un administrador la apruebe:\n${input.usersUrl}\n\nSi no conoces a esta persona, no la apruebes.`,
    html: layout(
      "Cuenta pendiente de aprobación",
      `${escapeHtml(who)} ha creado una cuenta y ha confirmado su correo. No podrá entrar hasta que un administrador la apruebe. Si no conoces a esta persona, no la apruebes.`,
      "Revisar usuarios",
      input.usersUrl,
    ),
  };
}

/** Sent to the user when an administrator approves the account. */
export function accountApprovedEmail(input: {
  to: string;
  name: string;
  loginUrl: string;
}): OutgoingEmail {
  return {
    to: input.to,
    subject: `${APP_NAME}: tu cuenta está aprobada`,
    text: `Hola ${input.name}.\n\nUn administrador ha aprobado tu cuenta. Ya puedes entrar:\n${input.loginUrl}`,
    html: layout(
      "Tu cuenta está aprobada",
      `Hola ${escapeHtml(input.name)}. Un administrador ha aprobado tu cuenta. Ya puedes entrar con tu correo y tu contraseña.`,
      "Iniciar sesión",
      input.loginUrl,
    ),
  };
}

/**
 * Sent when someone tries to register with an email that already has an account.
 * The sign-up form always shows the same answer, so only the real owner of the
 * mailbox learns that the account exists.
 */
export function accountExistsEmail(input: {
  to: string;
  name: string;
  forgotPasswordUrl: string;
}): OutgoingEmail {
  const body = `Hola ${escapeHtml(input.name)}. Alguien ha intentado crear una cuenta con este correo, pero ya tienes una. Si has olvidado la contraseña, puedes restablecerla. Si no has sido tú, ignora este mensaje.`;
  return {
    to: input.to,
    subject: `${APP_NAME}: ya tienes una cuenta`,
    text: `Hola ${input.name}.\n\nAlguien ha intentado crear una cuenta con este correo, pero ya tienes una.\nSi has olvidado la contraseña, restablécela aquí:\n${input.forgotPasswordUrl}\n\nSi no has sido tú, ignora este mensaje.`,
    html: layout("Ya tienes una cuenta", body, "Restablecer contraseña", input.forgotPasswordUrl),
  };
}
