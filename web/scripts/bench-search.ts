/* Times a full library search in Node, to see how the brute-force search scales.
 * Run with: npx tsx scripts/bench-search.ts */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EXAMPLE } from "../src/example";
import { encode } from "../src/fingerprint";
import { entriesFromFile, type LibraryFile, type LibraryManifest } from "../src/library";
import { searchLibrary } from "../src/search";
import { randomMelody, rng } from "../test/random-melody";

const pub = fileURLToPath(new URL("../public/", import.meta.url));
const manifest = JSON.parse(readFileSync(pub + "pd-library.json", "utf8")) as LibraryManifest;
const library = manifest.sources.flatMap((s) => entriesFromFile(JSON.parse(readFileSync(pub + s.file, "utf8")) as LibraryFile, s));
const intervals = library.reduce((a, e) => a + e.fp.iv.length, 0);
console.log(`${library.length} melodies, ${intervals.toLocaleString()} intervals in total`);

for (const [label, notes] of [["example (32 notes)", EXAMPLE], ["3-minute melody (300 notes)", randomMelody(rng(3), 300)]] as const) {
  const fp = encode(notes);
  const t0 = performance.now();
  const hits = searchLibrary(fp, library);
  const ms = performance.now() - t0;
  const levels = [2, 1, 0].map((l) => hits.filter((h) => h.level === l).length);
  console.log(`${label}: ${ms.toFixed(0)} ms, ${levels[0]} close / ${levels[1]} worth a listen / ${levels[2]} passing`);
}
