/* Speed at Lakh scale, in Node: public domain library + a large index file.
 *
 *   npx tsx scripts/make-synthetic-index.ts        # once: 45,000 random songs -> data/
 *   npx tsx scripts/bench-scale.ts [index file]    # default ../data/synthetic-index.json.gz
 *
 * Queries are 3-minute random melodies with a passage of a random index song hidden inside
 * (transposed, new tempo, one note changed), to check the source is still found at this scale.
 */
import { openAsBlob, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { SearchEngine } from "../src/engine";
import { encode } from "../src/fingerprint";
import { decodeIv, decodeRh, type MelodyIndexFile } from "../src/library";
import type { Note } from "../src/midi";
import { randomMelody, rng } from "../test/random-melody";
import { notesFromFingerprint } from "./bench-search-helpers";

const pub = fileURLToPath(new URL("../public/", import.meta.url));
const indexPath = process.argv[2] ?? fileURLToPath(new URL("../../data/synthetic-index.json.gz", import.meta.url));
// The engine fetches the public domain library; serve it from disk.
globalThis.fetch = (async (url: string) => new Response(readFileSync(pub + url.replace(/^\.\//, "")))) as typeof fetch;

const mb = () => (process.memoryUsage().heapUsed / 1e6).toFixed(0);
const engine = new SearchEngine();
let t0 = performance.now();
const pd = await engine.loadPd("./");
console.log(`Public domain library: ${pd.manifest.total} melodies, loaded and indexed in ${(performance.now() - t0).toFixed(0)} ms`);

t0 = performance.now();
const priv = await engine.loadPrivate(await openAsBlob(indexPath));
console.log(`Private index "${priv.name}": ${priv.count.toLocaleString()} songs, loaded + indexed in ${(performance.now() - t0).toFixed(0)} ms ` +
  `(n-gram index ${priv.index.grams.toLocaleString()} n-grams, ${priv.index.mb.toFixed(0)} MB, built in ${priv.index.ms.toFixed(0)} ms; heap ${mb()} MB)`);

// Fingerprints of the index songs, to build queries from.
const songs = (JSON.parse(gunzipSync(readFileSync(indexPath)).toString()) as MelodyIndexFile).melodies;
const rand = rng(5);
const times: number[] = [];
let first = 0, top5 = 0;
const QUERIES = 20;
for (let q = 0; q < QUERIES; q++) {
  const k = Math.floor(rand() * songs.length);
  const fp = { iv: decodeIv(songs[k].iv), rh: decodeRh(songs[k].rh) };
  const from = Math.floor(rand() * (fp.iv.length - 30));
  const excerpt = notesFromFingerprint(fp, from, 16 + Math.floor(rand() * 9), 60, 0.75);
  excerpt[5].pitch += 1;
  const filler = randomMelody(rand, 180);
  const notes: Note[] = [...filler];
  let t = filler[filler.length - 1].start + 1;
  for (const n of excerpt) notes.push({ ...n, start: t + n.start });
  t = notes[notes.length - 1].start + 1;
  for (const n of randomMelody(rand, 180)) notes.push({ ...n, start: t + n.start });

  t0 = performance.now();
  const reply = engine.search(encode(notes));
  times.push(performance.now() - t0);
  const titles = reply.hits.slice(0, 5).map((h) => h.lib.title);
  if (titles[0] === songs[k].title) first++;
  if (titles.includes(songs[k].title)) top5++;
}
times.sort((a, b) => a - b);
console.log(`${QUERIES} searches with 3-minute melodies (~${360 + 20} notes) against ${engine.size.toLocaleString()} melodies: ` +
  `median ${times[QUERIES >> 1].toFixed(0)} ms, slowest ${times[QUERIES - 1].toFixed(0)} ms`);
console.log(`Hidden source found: first ${first}/${QUERIES}, top 5 ${top5}/${QUERIES}`);
