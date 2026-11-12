// ESLint, flat config: the recommended JavaScript and TypeScript rules, and the
// React hooks rules.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "public/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // The codebase uses `any` in a few places where a third-party shape is
      // genuinely unknown. Visible, not fatal.
      "@typescript-eslint/no-explicit-any": "warn",
      // A leading underscore means "deliberately unused", which this codebase uses
      // for discarded destructuring and required-but-ignored parameters.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: { globals: globals.node },
  },
  {
    // Test files mock modules and assert on loose shapes.
    files: ["**/__tests__/**", "tests-e2e/**", "*.config.*"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
