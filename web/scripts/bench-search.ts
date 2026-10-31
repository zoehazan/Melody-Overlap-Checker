/* Prefiltered search vs brute force on the public domain library: speed, and how many flags the
 * prefilter loses (recall). Run with: npx tsx scripts/bench-search.ts
 *
 * Queries are built from library fingerprints (public domain) and synthetic random melodies.
 * Options (environment variables):
 *   MAX_DF=0.2     stop-gram threshold: n-grams in more than this share of songs are dropped
 *   DEBUG_LOST=1   explain each source song the prefilter lost (and skip the slow random queries)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EXAMPLE } from "../src/example";
import { encode } from "../src/fingerprint";
import { entriesFromFile, type LibraryEntry, type LibraryFile, type LibraryManifest } from "../src/library";
import type { Note } from "../src/midi";
import { NgramIndex, uniqueGrams } from "../src/ngram";
import { searchIndexed, searchLibrary, type Hit } from "../src/search";
import { randomMelody, rng } from "../test/random-melody";
import { notesFromFingerprint } from "./bench-search-helpers";

const pub = fileURLToPath(new URL("../public/", import.meta.url));
const manifest = JSON.parse(readFileSync(pub + "pd-library.json", "utf8")) as LibraryManifest;
const library = manifest.sources.flatMap((s) => entriesFromFile(JSON.parse(readFileSync(pub + s.file, "utf8")) as LibraryFile, s));
const intervals = library.reduce((a, e) => a + e.fp.iv.length, 0);

let t0 = performance.now();
const index = NgramIndex.build(library.map((e) => e.fp), process.env.MAX_DF ? { maxDfShare: Number(process.env.MAX_DF) } : {});
console.log(`${library.length} melodies, ${intervals.toLocaleString()} intervals. Index: ${index.grams.toLocaleString()} n-grams ` +
  `(${index.stopGrams} stop-grams), ${(index.bytes / 1e6).toFixed(1)} MB, built in ${(performance.now() - t0).toFixed(0)} ms\n`);

function concat(parts: Note[][]): Note[] {
  const out: Note[] = [];
  let t = 0;
  for (const p of parts) {
    const t0 = p[0].start;
    for (const n of p) out.push({ ...n, start: n.start - t0 + t });
    t = out[out.length - 1].start + out[out.length - 1].dur;
  }
  return out;
}

const rand = rng(11);
const queries: { kind: string; notes: Note[]; source?: LibraryEntry }[] = [{ kind: "example", notes: EXAMPLE }];
while (queries.filter((q) => q.kind === "excerpt").length < 100) {
  const src = library[Math.floor(rand() * library.length)];
  const len = 10 + Math.floor(rand() * 21);
  if (src.fp.iv.length < len + 1) continue;
  const from = Math.floor(rand() * (src.fp.iv.length - len));
  const excerpt = notesFromFingerprint(src.fp, from, len + 1, 55 + Math.floor(rand() * 15), 0.5 + rand());
  const changes = Math.floor(rand() * 3);
  for (let c = 0; c < changes; c++) excerpt[1 + Math.floor(rand() * (excerpt.length - 2))].pitch += rand() < 0.5 ? 1 : -2;
  queries.push({ kind: "excerpt", notes: concat([randomMelody(rand, 20), excerpt, randomMelody(rand, 20)]), source: src });
}
for (let q = 0; q < (process.env.DEBUG_LOST ? 0 : 30); q++) queries.push({ kind: "random", notes: randomMelody(rand, 100 + Math.floor(rand() * 200)) });

const key = (h: Hit) => h.lib;
type Tally = { flagged: number; top5: number; top1: number };
const stats: Record<string, { brute: number; fast: number; flags: number; kept: number; closeFlags: number; closeKept: number;
  n: number; srcBrute: Tally; srcFast: Tally; lostByPrefilter: number }> = {};
/** Where the source song ended up in a ranked hit list. */
function tally(t: Tally, hits: Hit[], source: LibraryEntry): boolean {
  const i = hits.findIndex((h) => h.lib === source);
  const flagged = i >= 0 && hits[i].level > 0;
  if (flagged) t.flagged++;
  if (i >= 0 && i < 5) t.top5++;
  if (i === 0) t.top1++;
  return flagged;
}
for (const q of queries) {
  const fp = encode(q.notes);
  t0 = performance.now();
  const brute = searchLibrary(fp, library);
  const tb = performance.now() - t0;
  t0 = performance.now();
  const fast = searchIndexed(fp, library, index).hits;
  const tf = performance.now() - t0;
  const fastSet = new Map(fast.map((h) => [key(h), h.level]));
  const s = (stats[q.kind] ??= { brute: 0, fast: 0, flags: 0, kept: 0, closeFlags: 0, closeKept: 0, n: 0,
    srcBrute: { flagged: 0, top5: 0, top1: 0 }, srcFast: { flagged: 0, top5: 0, top1: 0 }, lostByPrefilter: 0 });
  s.n++; s.brute += tb; s.fast += tf;
  for (const h of brute) {
    if (h.level === 0) continue;
    s.flags++;
    if ((fastSet.get(key(h)) ?? -1) >= h.level) s.kept++;
    if (h.level === 2) { s.closeFlags++; if (fastSet.get(key(h)) === 2) s.closeKept++; }
  }
  if (q.source) {
    const b = tally(s.srcBrute, brute, q.source);
    const f = tally(s.srcFast, fast, q.source);
    if (b && !f) {
      s.lostByPrefilter++;
      if (process.env.DEBUG_LOST) {
        const shared = [...new Set(uniqueGrams(fp.iv))].filter((g) => new Set(uniqueGrams(q.source!.fp.iv)).has(g)).length;
        const rank = index.candidates(fp.iv, library.length).indexOf(library.indexOf(q.source));
        const h = brute.find((x) => x.lib === q.source)!;
        console.log(`  lost: shared 6-grams ${shared}, prefilter rank ${rank}, brute level ${h.level}, exact ${h.r.exact}, identity ${h.r.identity.toFixed(2)}`);
      }
    }
  }
}
for (const [kind, s] of Object.entries(stats)) {
  console.log(`${kind} (${s.n} queries): brute force ${(s.brute / s.n).toFixed(0)} ms, prefiltered ${(s.fast / s.n).toFixed(0)} ms per query`);
  console.log(`  all flags kept by the prefilter: close ${s.closeKept}/${s.closeFlags}, close + worth a listen ${s.kept}/${s.flags}`);
  if (kind === "excerpt") {
    const show = (t: Tally) => `flagged ${t.flagged}, top 5 ${t.top5}, first ${t.top1}`;
    console.log(`  source song (of ${s.n}): brute force ${show(s.srcBrute)}; prefiltered ${show(s.srcFast)}`);
    console.log(`  source flagged by brute force but lost by the prefilter: ${s.lostByPrefilter}`);
  }
}
