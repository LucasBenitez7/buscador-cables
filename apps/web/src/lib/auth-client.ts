import { createAuthClient } from "better-auth/react";

// Mismo origen que la app: no hace falta baseURL.
export const authClient = createAuthClient();
