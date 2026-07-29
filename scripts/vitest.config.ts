import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

function workspaceSource(path: string): string {
  return fileURLToPath(new URL(`../packages/${path}/src/index.ts`, import.meta.url));
}

export default defineConfig({
  resolve: {
    alias: {
      "@capex-lens/indicators": workspaceSource("indicators"),
      "@capex-lens/providers": workspaceSource("providers"),
      "@capex-lens/shared": workspaceSource("shared"),
    },
  },
});
