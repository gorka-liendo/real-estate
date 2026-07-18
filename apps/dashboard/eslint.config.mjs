import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Next 16 activa esta regla nueva y muy agresiva de react-hooks: se dispara
      // en el patrón idiomático de carga de datos en efecto (`void load()` con el
      // setState tras un await, que NO es síncrono) que usamos en todo el dashboard.
      // La desactivamos; el resto de reglas de react-hooks siguen activas.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
