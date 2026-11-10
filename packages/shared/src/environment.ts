import { z } from "zod";

const optionalUrl = z.union([z.url(), z.literal("")]).optional();

export const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: optionalUrl,
  DATABASE_URL_TEST: optionalUrl,
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().trim().min(1).default("no-reply@cables.local"),
  // Better Auth reads these two straight from process.env; we only validate them.
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  BETTER_AUTH_URL: optionalUrl,
});

export type AppEnvironment = z.infer<typeof environmentSchema>;

export type EnvironmentInput = Record<string, string | undefined>;

export function parseEnvironment(input: EnvironmentInput): AppEnvironment {
  return environmentSchema.parse(input);
}
