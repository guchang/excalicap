import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      obsidian: fileURLToPath(
        new URL("./src/test/obsidian-runtime.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    exclude: [...configDefaults.exclude, ".worktrees/**"],
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
