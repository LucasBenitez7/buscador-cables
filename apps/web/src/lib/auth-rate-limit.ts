/**
 * Rate limiting for the Better Auth endpoints, per IP.
 *
 * Counters live in the database (`rateLimit` table) instead of memory: on Vercel
 * every serverless instance has its own memory, so an in-memory limit would
 * barely slow down an attacker. Paths are relative to `/api/auth`.
 *
 * Sign-in is generous on purpose: a whole plant shares one public IP, and five sign-ins a
 * minute for everybody locked people out at every shift change. Guessing one account's
 * password is stopped per email instead (see `server/login-throttle.ts`).
 */
export const authRateLimit = {
  enabled: true,
  storage: "database",
  window: 60,
  max: 100,
  customRules: {
    "/sign-in/email": { window: 60, max: 30 },
    "/sign-up/email": { window: 60, max: 3 },
    "/request-password-reset": { window: 60, max: 3 },
    "/reset-password": { window: 60, max: 5 },
    "/send-verification-email": { window: 60, max: 3 },
  },
} as const;
