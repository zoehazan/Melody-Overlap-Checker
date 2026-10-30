/* Writes public/pd-library.json from the seed melodies: fingerprints and credits only.
 * Run with: npm run build:seed-library
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSeedLibrary } from "./seed-library";

const out = fileURLToPath(new URL("../public/pd-library.json", import.meta.url));
const lib = buildSeedLibrary();
writeFileSync(out, JSON.stringify(lib) + "\n");
console.log(`Wrote ${lib.melodies.length} melodies to ${out}`);
