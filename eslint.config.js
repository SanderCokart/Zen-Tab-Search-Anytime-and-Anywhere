import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [".output/**", ".wxt/**", "node_modules/**", "signed/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["entrypoints/**/*.ts"],
    languageOptions: {
      globals: {
        browser: "readonly",
        chrome: "readonly",
        defineBackground: "readonly",
        defineContentScript: "readonly",
        defineUnlistedScript: "readonly",
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
  {
    files: ["tests/**/*.ts"],
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
    files: ["scripts/**/*.mjs", "download-signed.js"],
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
