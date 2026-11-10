import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
});

// `server-only` throws when imported outside the Next.js server runtime.
vi.mock("server-only", () => ({}));
