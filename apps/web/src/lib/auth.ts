import "server-only";
import { prisma } from "@cables/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { after } from "next/server";
import { ROLES } from "@cables/shared";
import { env } from "@/lib/env";
import { authRateLimit } from "@/lib/auth-rate-limit";
import { passwordResetEmail, verificationEmail } from "@/lib/email-templates";
import { assertAccountActive } from "@/server/auth-policy";
import { sendEmail } from "@/server/email";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

export const auth = betterAuth({
  appName: "Buscador de Cables",
  baseURL: env.BETTER_AUTH_URL ?? env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail(passwordResetEmail({ to: user.email, name: user.name, url }));
    },
  },

  emailVerification: {
    sendOnSignUp: false,
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
        // El registro público está desactivado: las altas se hacen desde el panel
        // de administración, que escribe con Prisma directamente.
        before: async () => {
          throw new APIError("FORBIDDEN", {
            message: "El registro público está desactivado. Pide un alta a un administrador.",
          });
        },
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
