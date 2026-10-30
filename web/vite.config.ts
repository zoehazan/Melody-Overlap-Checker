import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative asset paths, so the built `dist/` folder works from any host or subfolder.
  base: "./",
  build: { outDir: "dist", emptyOutDir: true },
  test: { environment: "node", include: ["test/**/*.test.ts"] },
});
