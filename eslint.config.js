import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [".output/**", ".wxt/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["app/**/*.{ts,tsx}", "entrypoints/**/*.{ts,tsx}", "features/**/*.{ts,tsx}", "shared/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        browser: "readonly",
        chrome: "readonly",
        defineBackground: "readonly",
        defineContentScript: "readonly",
        defineUnlistedScript: "readonly",
        createShadowRootUi: "readonly",
        injectScript: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Architectural boundaries. Dependencies point one way:
  //   entrypoints -> app -> features -> shared
  // so a feature can be read, moved or deleted without chasing back-references.
  {
    files: ["shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/*", "@/app/*", "@/entrypoints/*"],
              message:
                "shared/ is the bottom layer: it must not import from features/, app/ or entrypoints/.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["features/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/*", "@/entrypoints/*"],
              message:
                "features/ must not import from app/ or entrypoints/; those wire features together, not the other way round.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.test.{ts,tsx}"],
    languageOptions: {
      globals: {
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
      },
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
        require: "readonly",
        __dirname: "readonly",
        Buffer: "readonly",
        fetch: "readonly",
      },
    },
  },
);
