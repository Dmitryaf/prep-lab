import js from "@eslint/js";
import ts from "typescript-eslint";
import vue from "eslint-plugin-vue";
import prettier from "eslint-config-prettier";
import globals from "globals";
import { readdirSync } from "node:fs";
import type { Linter } from "eslint";

const features = readdirSync(new URL("./app/features", import.meta.url), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

export default ts.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      ".nuxt/**",
      ".output/**",
      ".local/**",
      "artifacts/**",
      "lab/**",
      "openspec/**",
      ".agents/**",
      ".codex/**",
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs["flat/recommended"],
  {
    files: ["**/*.vue"],
    // ESLint's assignment analysis does not track reads from Vue templates.
    rules: { "no-useless-assignment": "off" },
  },
  {
    files: ["**/*.ts", "**/*.vue"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      parserOptions: { parser: ts.parser, extraFileExtensions: [".vue"] },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "vue/multi-word-component-names": "off",
    },
  },
  {
    files: ["domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "vue",
                "vue-router",
                "pinia",
                "nuxt",
                "nuxt/*",
                "node:*",
                "**/app/**",
                "**/server/**",
                "**/content/**",
              ],
              message:
                "Domain содержит предметную логику без UI, ввода-вывода и каталога экземпляра.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        "window",
        "document",
        "localStorage",
        "fetch",
      ],
    },
  },
  {
    files: ["app/entities/**/*.{ts,vue}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "node:*",
                "**/server/**",
                "**/features/**",
                "**/pages/**",
                "**/layouts/**",
              ],
              message:
                "Entity не зависит от интерфейсных сценариев, страниц и сервера.",
            },
          ],
        },
      ],
    },
  },
  ...features.map((feature): Linter.Config => ({
    files: [`app/features/${feature}/**/*.{ts,vue}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: `(?:^|/)(?:${features.filter((name) => name !== feature).join("|")})/(?:ui|model|api)/`,
              message: "Другие features подключаются через публичный index.ts.",
            },
            {
              group: ["node:*", "**/server/**"],
              message: "Браузерный сценарий обращается к серверу через API.",
            },
          ],
        },
      ],
    },
  })),
  prettier,
);
