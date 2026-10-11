import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", ".next-cloud/**", ".cloud-build*/**", ".cloud-functions/**", "out/**", "out-cloudbase/**", "node_modules/**", "data/**", "releases/**"]),
  { files: ["cloud/functions/**/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
]);
