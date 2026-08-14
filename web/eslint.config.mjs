import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import hooks from "eslint-plugin-react-hooks";
import next from "@next/eslint-plugin-next";

export default tseslint.config(
  { ignores: [".next/**", "node_modules/**", "public/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { react, "react-hooks": hooks, "@next/next": next },
    languageOptions: {
      globals: {
        window: "readonly", document: "readonly", navigator: "readonly",
        localStorage: "readonly", fetch: "readonly", console: "readonly",
        Notification: "readonly", atob: "readonly", crypto: "readonly",
        process: "readonly", setTimeout: "readonly", clearTimeout: "readonly",
        BufferSource: "readonly", Navigator: "readonly", RequestInit: "readonly",
      },
    },
    rules: {
      ...hooks.configs.recommended.rules,
      ...next.configs.recommended.rules,
      ...next.configs["core-web-vitals"].rules,
      "react/jsx-key": "error",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
