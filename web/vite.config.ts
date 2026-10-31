import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vitest/config";

/** Files that must never be deployed: MIDI, and private indexes such as the Lakh fingerprint index. */
export const PRIVATE_FILE = /\.(mid|midi|kar)$|lakh|lmd_|-index\.json(\.gz)?$|\.index\.(bin|gz)$|\.tsv$/i;

/**
 * Everything in public/ is copied into the deployed site, whether or not git tracks it.
 * Fail the build if anything private is in there (CLAUDE.md ground rule 3).
 */
export function privateFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) => PRIVATE_FILE.test(f));
}

const guardPublicFolder = (): Plugin => ({
  name: "guard-public-folder",
  buildStart() {
    const found = privateFiles(fileURLToPath(new URL("./public", import.meta.url)));
    if (found.length) this.error(`Refusing to build: private files in web/public would be published: ${found.join(", ")}`);
  },
});

export default defineConfig({
  // Relative asset paths, so the built `dist/` folder works from any host or subfolder.
  base: "./",
  build: { outDir: "dist", emptyOutDir: true },
  plugins: [guardPublicFolder()],
  test: { environment: "node", include: ["test/**/*.test.ts"] },
});
