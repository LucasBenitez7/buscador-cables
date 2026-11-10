/**
 * Rate limiting for the Better Auth endpoints.
 *
 * Counters live in the database (`rateLimit` table) instead of memory: on Vercel
 * every serverless instance has its own memory, so an in-memory limit would
 * barely slow down an attacker. Paths are relative to `/api/auth`.
 */
export const authRateLimit = {
  enabled: true,
  storage: "database",
  window: 60,
  max: 100,
  customRules: {
    "/sign-in/email": { window: 60, max: 5 },
    "/request-password-reset": { window: 60, max: 3 },
    "/reset-password": { window: 60, max: 5 },
    "/send-verification-email": { window: 60, max: 3 },
  },
} as const;
