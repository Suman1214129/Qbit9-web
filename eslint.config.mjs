import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "playwright-report/**", "test-results/**", "public/sw.js"]),
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": ["warn", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // The domain layer must stay framework free and IO free so the same rules can move to a backend.
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react-dom", "next", "next/*", "@/components/*", "@/features/*", "@/services/*", "@/providers/*", "@/hooks/*"], message: "domain/ is pure: no React, Next, services or UI." },
          ],
        },
      ],
    },
  },
  {
    // Screens talk to services through hooks only, never to an adapter directly.
    files: ["src/features/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [{ group: ["@/services/mock/*", "@/services/supabase/*"], message: "Use the service hooks. Adapters are wired in services/registry.ts only." }],
        },
      ],
    },
  },
]);
