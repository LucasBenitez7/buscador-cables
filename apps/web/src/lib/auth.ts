import "server-only";
import { prisma } from "@cables/db";
import { betterAuth } from "better-auth";
import { createAuthMiddleware, isAPIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { after } from "next/server";
import { ROLES } from "@cables/shared";
import { env } from "@/lib/env";
import { authRateLimit } from "@/lib/auth-rate-limit";
import { accountExistsEmail, passwordResetEmail, verificationEmail } from "@/lib/email-templates";
import { notifyAdminsOfPendingAccount } from "@/server/account-approval";
import {
  assertAccountActive,
  assertNoProfileSelfEdit,
  prepareSignUpUser,
} from "@/server/auth-policy";
import { sendEmail } from "@/server/email";
import {
  assertLoginNotLocked,
  clearLoginFailures,
  recordLoginFailure,
} from "@/server/login-throttle";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
export const EMAIL_VERIFICATION_EXPIRES_SECONDS = 60 * 60 * 24;

const baseURL = env.BETTER_AUTH_URL ?? env.APP_URL;

const SIGN_IN_PATH = "/sign-in/email";

const signInEmail = (body: unknown): unknown =>
  typeof body === "object" && body !== null ? (body as { email?: unknown }).email : undefined;

export const auth = betterAuth({
  appName: "Buscador de Cables",
  baseURL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    // Cualquiera puede pedir una cuenta con su correo y contraseña, pero no entra hasta
    // confirmar el correo y hasta que un administrador la apruebe (la app guarda los datos
    // reales del cliente). Empieza como VIEWER (solo lectura).
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail(passwordResetEmail({ to: user.email, name: user.name, url }));
    },
    // Con verificación obligatoria, Better Auth responde igual exista o no el
    // correo (no revela cuentas). Avisamos solo al dueño real del buzón.
    onExistingUserSignUp: async ({ user }) => {
      await sendEmail(
        accountExistsEmail({
          to: user.email,
          name: user.name,
          forgotPasswordUrl: new URL("/forgot-password", env.APP_URL).toString(),
        }),
      );
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    // Si intenta entrar sin haber confirmado, se le reenvía el enlace.
    sendOnSignIn: true,
    expiresIn: EMAIL_VERIFICATION_EXPIRES_SECONDS,
    // Sin inicio de sesión automático: la cuenta nueva aún espera la aprobación.
    autoSignInAfterVerification: false,
    afterEmailVerification: async (user) => {
      await notifyAdminsOfPendingAccount(user.id);
    },
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail(verificationEmail({ to: user.email, name: user.name, url }));
    },
  },

  user: {
    additionalFields: {
      // Campos controlados por el servidor: el cliente nunca puede escribirlos.
      role: {
        type: [...ROLES],
        required: false,
        defaultValue: "VIEWER",
        input: false,
      },
      active: {
        type: "boolean",
        required: false,
        defaultValue: true,
        input: false,
      },
    },
  },

  session: {
    expiresIn: SESSION_MAX_AGE_SECONDS,
    updateAge: 60 * 60,
  },

  rateLimit: authRateLimit,

  databaseHooks: {
    session: {
      create: {
        // Better Auth no conoce nuestro campo `active`: sin esto, un usuario
        // desactivado podría volver a entrar con su contraseña.
        before: async (session) => {
          await assertAccountActive(session.userId);
        },
      },
    },
    user: {
      create: {
        // Valida el nombre con Zod y fuerza rol VIEWER y cuenta pendiente de aprobación.
        // Las altas del panel de administración escriben con Prisma y no pasan por aquí.
        before: async (user) => prepareSignUpUser(user),
      },
      update: {
        // `POST /api/auth/update-user` deja a cualquiera cambiarse el nombre, y el
        // historial enseña el nombre actual de quien hizo cada cosa.
        before: async (data) => {
          assertNoProfileSelfEdit(data);
        },
      },
    },
  },

  hooks: {
    // Límite de intentos por cuenta, además del límite por IP de `rateLimit`.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === SIGN_IN_PATH) {
        await assertLoginNotLocked(signInEmail(ctx.body));
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== SIGN_IN_PATH) {
        return;
      }
      const email = signInEmail(ctx.body);
      const { returned } = ctx.context;
      if (!isAPIError(returned)) {
        await clearLoginFailures(email);
      } else if (returned.status === "UNAUTHORIZED") {
        // Solo cuenta la contraseña incorrecta: una cuenta sin confirmar o pendiente de
        // aprobación responde 403 después de acertarla.
        await recordLoginFailure(email);
      }
    }),
  },

  advanced: {
    // Better Auth lanza el envío de correos como tarea en segundo plano para no
    // revelar por tiempos si un correo existe. `after` mantiene viva la función
    // serverless (Vercel) hasta que termina; con `void` el correo podía perderse.
    backgroundTasks: { handler: (promise) => after(promise) },
  },

  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
