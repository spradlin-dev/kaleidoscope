import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{js,ts}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: globals.browser },
    rules: {
      complexity: ["error", 10],
      "max-depth": ["error", 3],
      "max-lines-per-function": [
        "error",
        { max: 60, skipBlankLines: true, skipComments: true },
      ],
      "max-params": ["error", 4],
    },
  },
]);
