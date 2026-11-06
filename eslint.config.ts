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

const deepRelativeImport = {
  regex: "^\\.\\./\\.\\./",
  message:
    "Для импортов между каталогами используйте алиасы из package.json imports.",
};

export default ts.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      ".nuxt/**",
      ".output/**",
      ".local/**",
      "artifacts/**",
      ".publication-check/**",
      "lab/**",
      "exercises/**",
      "public/labs/**",
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
      "no-restricted-imports": ["error", { patterns: [deepRelativeImport] }],
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
            deepRelativeImport,
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
                "\\#ui/**",
                "\\#server/**",
                "\\#scripts/**",
                "\\#tests/**",
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
            deepRelativeImport,
            {
              group: [
                "node:*",
                "**/server/**",
                "**/features/**",
                "**/pages/**",
                "**/layouts/**",
                "\\#server/**",
                "\\#scripts/**",
                "\\#tests/**",
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
            deepRelativeImport,
            {
              regex: `(?:^|/)(?:${features.filter((name) => name !== feature).join("|")})/(?:ui|model|api)/`,
              message: "Другие features подключаются через публичный index.ts.",
            },
            {
              group: [
                "node:*",
                "**/server/**",
                "\\#server/**",
                "\\#scripts/**",
                "\\#tests/**",
              ],
              message: "Браузерный сценарий обращается к серверу через API.",
            },
          ],
        },
      ],
    },
  })),
  prettier,
);
