import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "src/components/ui/**",
  ]),
  {
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // Client Components must not reach the database or server-only code.
    files: ["src/components/**/*.tsx", "src/features/**/components/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@cables/db", "@cables/db/*", "server-only", "@/server/*"],
              message: "Los componentes no pueden acceder a la base de datos ni al servidor.",
              // Type-only imports are erased at compile time and create no runtime coupling.
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
]);
