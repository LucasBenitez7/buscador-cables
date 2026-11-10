import "server-only";
import { prisma } from "@cables/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { after } from "next/server";
import { ROLES } from "@cables/shared";
import { env } from "@/lib/env";
import { authRateLimit } from "@/lib/auth-rate-limit";
import { accountExistsEmail, passwordResetEmail, verificationEmail } from "@/lib/email-templates";
import { assertAccountActive, prepareSignUpUser } from "@/server/auth-policy";
import { sendEmail } from "@/server/email";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
export const EMAIL_VERIFICATION_EXPIRES_SECONDS = 60 * 60 * 24;

const baseURL = env.BETTER_AUTH_URL ?? env.APP_URL;

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
    // Registro abierto: cualquiera crea su cuenta con su correo y contraseña, pero
    // no puede entrar hasta confirmar el correo. Empieza como VIEWER (solo lectura).
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
    autoSignInAfterVerification: true,
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
        // Valida el nombre con Zod y fuerza rol VIEWER y cuenta activa. Las altas
        // del panel de administración escriben con Prisma y no pasan por aquí.
        before: async (user) => prepareSignUpUser(user),
      },
    },
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
