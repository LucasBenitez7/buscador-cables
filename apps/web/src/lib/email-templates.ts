import { PERMISSION_LABELS, isPermission } from "@cables/shared";

/** A role as the emails show it (fase 12: roles live in the database). */
export type RoleSummary = { name: string; description: string | null; permissions: string[] };
import type { OutgoingEmail } from "@/server/email";

/**
 * Every email the app sends, with one look: the logo and the name on top, a light card (most
 * mail clients show white), the important data in a table and one button. Each one also has
 * a plain text version. Who receives each email: docs/ARQUITECTURA.md, "Correos y avisos".
 */

const APP_NAME = "Buscador de Cables";
const TIME_ZONE = "Europe/Madrid";
const COLORS = {
  page: "#eef1f5",
  card: "#ffffff",
  header: "#101419",
  title: "#101419",
  text: "#3b4350",
  muted: "#6b7480",
  line: "#e3e7ec",
  panel: "#f5f7fa",
  button: "#1f7fd1",
  warning: "#b26b00",
  warningPanel: "#fff6e5",
};

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

// Fecha y hora por separado: el separador entre ellas cambia según la versión de ICU de Node
// (", " o " a las "), y así el texto es el mismo en todas partes.
const dayFormat = new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeZone: TIME_ZONE });
const timeFormat = new Intl.DateTimeFormat("es-ES", { timeStyle: "short", timeZone: TIME_ZONE });
export const formatEmailDate = (date: Date) =>
  `${dayFormat.format(date)}, a las ${timeFormat.format(date)}`;

/** The logo of the emails: a public file of the app (`public/brand`), absolute for mail clients. */
function logoUrl(): string {
  return new URL("/brand/logo-email.png", process.env.APP_URL ?? "http://localhost:3000").href;
}

type EmailContent = {
  /** Shown by the inbox next to the subject. */
  preheader: string;
  title: string;
  paragraphs: string[];
  /** Important data, in a table: label and value. */
  details?: [string, string][];
  /** A list under the details (what a role can do…). */
  list?: { title: string; items: readonly string[] };
  action?: { label: string; url: string };
  /** Highlighted in amber: security notices. */
  warning?: string;
  /** Small text under the button. */
  note?: string;
};

function renderHtml(content: EmailContent): string {
  const e = escapeHtml;
  const paragraphs = content.paragraphs
    .map(
      (text) =>
        `<p style="margin:0 0 14px;color:${COLORS.text};font-size:15px;line-height:1.55">${e(text)}</p>`,
    )
    .join("");
  const warning = content.warning
    ? `<p style="margin:0 0 16px;padding:12px 14px;background:${COLORS.warningPanel};border-left:4px solid ${COLORS.warning};color:${COLORS.text};font-size:14px;line-height:1.5;border-radius:6px">${e(content.warning)}</p>`
    : "";
  const details = content.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;background:${COLORS.panel};border-radius:8px;border-collapse:separate">${content.details
        .map(
          ([label, value]) =>
            `<tr><td style="padding:9px 14px;color:${COLORS.muted};font-size:13px;white-space:nowrap;vertical-align:top">${e(label)}</td><td style="padding:9px 14px;color:${COLORS.title};font-size:14px;font-weight:600;word-break:break-word">${e(value)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const list = content.list
    ? `<p style="margin:0 0 6px;color:${COLORS.title};font-size:14px;font-weight:600">${e(content.list.title)}</p><ul style="margin:0 0 18px;padding-left:20px;color:${COLORS.text};font-size:14px;line-height:1.55">${content.list.items.map((item) => `<li>${e(item)}</li>`).join("")}</ul>`
    : "";
  const action = content.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 18px"><tr><td style="border-radius:8px;background:${COLORS.button}"><a href="${e(content.action.url)}" style="display:inline-block;padding:12px 22px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px">${e(content.action.label)}</a></td></tr></table><p style="margin:0 0 14px;color:${COLORS.muted};font-size:12px;line-height:1.5">Si el botón no funciona, copia este enlace en tu navegador:<br><span style="word-break:break-all">${e(content.action.url)}</span></p>`
    : "";
  const note = content.note
    ? `<p style="margin:0;color:${COLORS.muted};font-size:13px;line-height:1.5">${e(content.note)}</p>`
    : "";
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${e(content.title)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.page};font-family:'Segoe UI',Arial,Helvetica,sans-serif">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${e(content.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.page};padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${COLORS.card};border-radius:12px;overflow:hidden;border:1px solid ${COLORS.line}">
<tr><td style="background:${COLORS.header};padding:18px 28px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle"><img src="${e(logoUrl())}" width="40" height="40" alt="" style="display:block;border:0;border-radius:9px"></td>
<td style="vertical-align:middle;padding-left:12px;color:#e8edf3;font-size:17px;font-weight:700">${APP_NAME}</td>
</tr></table></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;color:${COLORS.title};font-size:22px;line-height:1.3">${e(content.title)}</h1>
${warning}${paragraphs}${details}${list}${action}${note}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid ${COLORS.line};color:${COLORS.muted};font-size:12px;line-height:1.5">Correo automático de ${APP_NAME}. No respondas a este mensaje: si necesitas ayuda, habla con un administrador de la aplicación.</td></tr>
</table>
</td></tr></table>
</body>
</html>`;
}

function renderText(content: EmailContent): string {
  const parts = [
    content.title,
    "",
    ...(content.warning ? [content.warning, ""] : []),
    ...content.paragraphs.flatMap((text) => [text, ""]),
    ...(content.details?.length
      ? [...content.details.map(([label, value]) => `${label}: ${value}`), ""]
      : []),
    ...(content.list
      ? [content.list.title, ...content.list.items.map((item) => `- ${item}`), ""]
      : []),
    ...(content.action ? [`${content.action.label}: ${content.action.url}`, ""] : []),
    ...(content.note ? [content.note, ""] : []),
    `— ${APP_NAME}`,
  ];
  return parts.join("\n");
}

function email(to: string, subject: string, content: EmailContent): OutgoingEmail {
  return {
    to,
    subject: `${APP_NAME}: ${subject}`,
    text: renderText(content),
    html: renderHtml(content),
  };
}

/** What the role lets the person do, in words. */
const roleList = (role: RoleSummary) => ({
  title: role.description ?? `Con el rol ${role.name} puedes:`,
  items: role.permissions.filter(isPermission).map((permission) => PERMISSION_LABELS[permission]),
});

// ---------------------------------------------------------------------------------------------
// To the person: their own account
// ---------------------------------------------------------------------------------------------

export function verificationEmail(input: { to: string; name: string; url: string }): OutgoingEmail {
  return email(input.to, "confirma tu correo", {
    preheader: "Confirma tu correo para terminar de pedir tu cuenta.",
    title: "Confirma tu correo",
    paragraphs: [
      `Hola, ${input.name}. Has pedido una cuenta en ${APP_NAME}. Confirma que este correo es tuyo con el botón. El enlace caduca en 24 horas.`,
      "Después, un administrador revisará tu cuenta y te asignará un rol. Te avisaremos por correo cuando puedas entrar.",
    ],
    action: { label: "Confirmar correo", url: input.url },
    note: "Si no has pedido ninguna cuenta, ignora este mensaje.",
  });
}

export function passwordResetEmail(input: {
  to: string;
  name: string;
  url: string;
}): OutgoingEmail {
  return email(input.to, "restablecer contraseña", {
    preheader: "Enlace para poner una contraseña nueva. Caduca en 1 hora.",
    title: "Restablecer contraseña",
    paragraphs: [
      `Hola, ${input.name}. Hemos recibido una petición para cambiar la contraseña de tu cuenta. Pulsa el botón para poner una nueva. El enlace caduca en 1 hora y solo sirve una vez.`,
    ],
    action: { label: "Poner contraseña nueva", url: input.url },
    note: "Si no lo has pedido tú, ignora este correo: tu contraseña no cambia.",
  });
}

/** After the password was changed with the reset link: if it was not them, they must act. */
export function passwordChangedEmail(input: {
  to: string;
  name: string;
  changedAt: Date;
  forgotPasswordUrl: string;
}): OutgoingEmail {
  return email(input.to, "tu contraseña ha cambiado", {
    preheader: "Se ha cambiado la contraseña de tu cuenta.",
    title: "Tu contraseña ha cambiado",
    paragraphs: [
      `Hola, ${input.name}. La contraseña de tu cuenta se cambió con un enlace de recuperación. Por seguridad, se han cerrado todas tus sesiones abiertas.`,
    ],
    details: [["Fecha", formatEmailDate(input.changedAt)]],
    warning:
      "Si no has sido tú, pide ahora otro enlace con «He olvidado mi contraseña» y avisa a un administrador.",
    action: { label: "He olvidado mi contraseña", url: input.forgotPasswordUrl },
  });
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
  return email(input.to, "ya tienes una cuenta", {
    preheader: "Alguien ha intentado crear una cuenta con tu correo.",
    title: "Ya tienes una cuenta",
    paragraphs: [
      `Hola, ${input.name}. Alguien ha intentado crear una cuenta con este correo, pero ya tienes una. Si has olvidado la contraseña, puedes poner otra.`,
    ],
    action: { label: "Restablecer contraseña", url: input.forgotPasswordUrl },
    note: "Si no has sido tú, ignora este mensaje: tu cuenta no ha cambiado.",
  });
}

/** Sent when an administrator approves the account: welcome, with the role and what it can do. */
export function welcomeEmail(input: {
  to: string;
  name: string;
  role: RoleSummary;
  loginUrl: string;
}): OutgoingEmail {
  return email(input.to, "tu cuenta está aprobada", {
    preheader: `Ya puedes entrar con el rol ${input.role.name}.`,
    title: `Bienvenido/a, ${input.name}`,
    paragraphs: [
      "Un administrador ha aprobado tu cuenta. Ya puedes entrar con tu correo y tu contraseña.",
    ],
    details: [
      ["Tu rol", input.role.name],
      ["Correo", input.to],
    ],
    list: roleList(input.role),
    action: { label: "Entrar", url: input.loginUrl },
  });
}

/** Sent when an administrator creates the account from the panel. */
export function accountCreatedEmail(input: {
  to: string;
  name: string;
  role: RoleSummary;
  createdBy: string;
  loginUrl: string;
  forgotPasswordUrl: string;
}): OutgoingEmail {
  return email(input.to, "te han dado de alta", {
    preheader: `${input.createdBy} te ha dado de alta con el rol ${input.role.name}.`,
    title: `Bienvenido/a, ${input.name}`,
    paragraphs: [
      `${input.createdBy} te ha dado de alta en ${APP_NAME}. Te dará una contraseña temporal para el primer acceso.`,
      "Te recomendamos cambiarla en cuanto entres: en la pantalla de entrada, «He olvidado mi contraseña» te envía un enlace para poner una tuya.",
    ],
    details: [
      ["Tu rol", input.role.name],
      ["Correo", input.to],
    ],
    list: roleList(input.role),
    action: { label: "Entrar", url: input.loginUrl },
    note: `Para poner tu propia contraseña: ${input.forgotPasswordUrl}`,
  });
}

export function roleChangedEmail(input: {
  to: string;
  name: string;
  fromRole: RoleSummary;
  toRole: RoleSummary;
  changedBy: string;
  loginUrl: string;
}): OutgoingEmail {
  return email(input.to, `ahora eres ${input.toRole.name}`, {
    preheader: `Tu rol ha cambiado a ${input.toRole.name}.`,
    title: "Tu rol ha cambiado",
    paragraphs: [
      `Hola, ${input.name}. ${input.changedBy} ha cambiado tu rol. El cambio ya está activo: la próxima página que abras lo tendrá en cuenta.`,
    ],
    details: [
      ["Antes", input.fromRole.name],
      ["Ahora", input.toRole.name],
    ],
    list: roleList(input.toRole),
    action: { label: "Abrir la aplicación", url: input.loginUrl },
  });
}

export function accountDeactivatedEmail(input: { to: string; name: string }): OutgoingEmail {
  return email(input.to, "tu cuenta está desactivada", {
    preheader: "Ya no puedes entrar en la aplicación.",
    title: "Tu cuenta está desactivada",
    paragraphs: [
      `Hola, ${input.name}. Un administrador ha desactivado tu cuenta y se han cerrado tus sesiones. Ya no puedes entrar. Tu historial de trabajo se conserva.`,
      "Si crees que es un error, habla con un administrador: puede reactivarla.",
    ],
  });
}

export function accountReactivatedEmail(input: {
  to: string;
  name: string;
  loginUrl: string;
}): OutgoingEmail {
  return email(input.to, "tu cuenta vuelve a estar activa", {
    preheader: "Ya puedes volver a entrar.",
    title: "Tu cuenta vuelve a estar activa",
    paragraphs: [
      `Hola, ${input.name}. Un administrador ha reactivado tu cuenta. Puedes entrar otra vez con tu correo y tu contraseña.`,
    ],
    action: { label: "Entrar", url: input.loginUrl },
    note: "Si no recuerdas la contraseña, usa «He olvidado mi contraseña» en la pantalla de entrada.",
  });
}

// ---------------------------------------------------------------------------------------------
// To the administrators
// ---------------------------------------------------------------------------------------------

/** Sent to every active administrator when a new account confirms its email. */
export function pendingApprovalEmail(input: {
  to: string;
  applicantName: string;
  applicantEmail: string;
  registeredAt: Date;
  /** Accounts waiting now, this one included. */
  pendingCount: number;
  usersUrl: string;
}): OutgoingEmail {
  return email(input.to, `cuenta pendiente: ${input.applicantName}`, {
    preheader: `${input.applicantName} espera tu aprobación.`,
    title: "Cuenta pendiente de aprobación",
    paragraphs: [
      `${input.applicantName} ha pedido una cuenta y ha confirmado su correo. No podrá entrar hasta que un administrador la apruebe y le asigne un rol.`,
    ],
    details: [
      ["Nombre", input.applicantName],
      ["Correo", input.applicantEmail],
      ["Pedida el", formatEmailDate(input.registeredAt)],
      ["Pendientes ahora", String(input.pendingCount)],
    ],
    warning:
      "Aprueba solo a personas que conozcas: la aplicación guarda datos reales del proyecto. Dale el rol más bajo que le baste.",
    action: { label: "Revisar y aprobar", url: input.usersUrl },
    note: "En la página de Usuarios verás qué puede hacer cada rol antes de elegirlo.",
  });
}

/** Sent to the other active administrators when someone becomes an administrator. */
export function newAdminEmail(input: {
  to: string;
  adminName: string;
  adminEmail: string;
  grantedBy: string;
  usersUrl: string;
}): OutgoingEmail {
  return email(input.to, `${input.adminName} es administrador/a`, {
    preheader: `${input.grantedBy} ha dado el rol de administrador a ${input.adminName}.`,
    title: "Nuevo administrador",
    paragraphs: [
      `${input.grantedBy} ha dado el rol de administrador a ${input.adminName}. Un administrador puede aprobar cuentas, cambiar roles y desactivar a cualquiera.`,
    ],
    details: [
      ["Nuevo administrador", input.adminName],
      ["Correo", input.adminEmail],
      ["Lo ha hecho", input.grantedBy],
    ],
    warning: "Si no lo esperabas, revisa la auditoría de cuentas en la página de Usuarios.",
    action: { label: "Ver usuarios", url: input.usersUrl },
  });
}
