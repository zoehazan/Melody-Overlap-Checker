/* Inverted index of interval n-grams: the prefilter that makes search fast at scale.
 *
 * An n-gram is a run of N = 6 consecutive intervals. Like the index at the back of a book, the
 * inverted index maps each n-gram to the list of songs that contain it ("postings"). To search,
 * look up each n-gram of your melody and give every song that shares it a few points:
 *
 *   score(song) = sum over shared n-grams g of IDF(g),   IDF(g) = log(songs / songs containing g)
 *
 * IDF ("inverse document frequency") makes rare n-grams count for a lot and common ones (scales,
 * repeated notes) for almost nothing. The best-scoring few hundred songs then get the full,
 * slow Smith-Waterman alignment; everything else is skipped.
 *
 * Intervals are key-independent and rhythm is ignored here, so neither a transposition nor a
 * new rhythm stops a song from being found. Alignment then judges rhythm as before.
 */
import type { Fingerprint } from "./fingerprint";

/** Intervals per n-gram. 6 is long enough to be distinctive, short enough to survive edits. */
export const N = 6;
const BASE = 25; // intervals are folded into -12..12: 25 possible values
const TOP = BASE ** (N - 1);

/** Every n-gram of a sequence as an integer key (base-25 digits), in order. Empty if too short. */
export function gramKeys(iv: ArrayLike<number>): Int32Array {
  const count = iv.length - N + 1;
  if (count <= 0) return new Int32Array(0);
  const out = new Int32Array(count);
  let key = 0;
  for (let k = N - 1; k >= 0; k--) key = key * BASE + (iv[k] + 12);
  out[0] = key;
  for (let j = 1; j < count; j++) {
    // Slide the window: drop the oldest interval (lowest digit), add the newest as the highest.
    key = Math.floor(key / BASE) + (iv[j + N - 1] + 12) * TOP;
    out[j] = key;
  }
  return out;
}

/** The distinct n-gram keys of a sequence, sorted. A song counts each n-gram once. */
export function uniqueGrams(iv: ArrayLike<number>): Int32Array {
  const keys = gramKeys(iv).sort();
  let w = 0;
  for (let r = 0; r < keys.length; r++) if (r === 0 || keys[r] !== keys[r - 1]) keys[w++] = keys[r];
  return keys.subarray(0, w);
}

/** Integer -> integer hash map (open addressing), much leaner than a Map for millions of keys. */
class IntMap {
  private keys: Int32Array;
  private vals: Int32Array;
  size = 0;

  constructor(capacity = 1 << 16) {
    this.keys = new Int32Array(capacity).fill(-1);
    this.vals = new Int32Array(capacity);
  }

  private slot(key: number): number {
    const mask = this.keys.length - 1;
    let i = Math.imul(key, 0x9e3779b1) & mask;
    while (this.keys[i] !== -1 && this.keys[i] !== key) i = (i + 1) & mask;
    return i;
  }

  get(key: number): number {
    const i = this.slot(key);
    return this.keys[i] === key ? this.vals[i] : -1;
  }

  /** The value for key, adding `next` if it is new. */
  getOrAdd(key: number, next: number): number {
    if (this.size * 4 >= this.keys.length * 3) this.grow(); // keep it at most 75% full
    const i = this.slot(key);
    if (this.keys[i] === key) return this.vals[i];
    this.keys[i] = key;
    this.vals[i] = next;
    this.size++;
    return next;
  }

  private grow(): void {
    const { keys, vals } = this;
    this.keys = new Int32Array(keys.length * 2).fill(-1);
    this.vals = new Int32Array(keys.length * 2);
    for (let i = 0; i < keys.length; i++) {
      if (keys[i] === -1) continue;
      const j = this.slot(keys[i]);
      this.keys[j] = keys[i];
      this.vals[j] = vals[i];
    }
  }

  get bytes(): number {
    return this.keys.byteLength + this.vals.byteLength;
  }
}

export interface NgramIndexOptions {
  /** N-grams found in more than this share of songs are left out ("stop-grams"). Default 5%. */
  maxDfShare?: number;
  /** ...but never drop n-grams found in fewer than this many songs. Default 20. */
  minStopDf?: number;
}

export class NgramIndex {
  /** n-gram key -> slot number */
  private slots: IntMap;
  /** postings of slot s are postings[offsets[s] .. offsets[s+1]): song ids, ascending.
   * 16-bit ids when there are fewer than 65,536 songs, which halves the biggest array.
   * A slot's song count is its postings length, so IDF needs no array of its own;
   * stop-grams get an empty postings list. */
  private offsets: Int32Array;
  private postings: Uint16Array | Int32Array;
  /** Reused between queries: per-song score accumulator, and which songs have been seen. */
  private scores: Float32Array;
  private seen: Uint8Array;
  readonly songs: number;
  readonly grams: number;
  readonly stopGrams: number;

  private constructor(songs: number, slots: IntMap, offsets: Int32Array, postings: Uint16Array | Int32Array, stop: number) {
    this.songs = songs;
    this.slots = slots;
    this.offsets = offsets;
    this.postings = postings;
    this.scores = new Float32Array(songs);
    this.seen = new Uint8Array(songs);
    this.grams = slots.size;
    this.stopGrams = stop;
  }

  /** Two passes over the library: count each n-gram's songs, then lay out all postings in one array. */
  static build(fps: ArrayLike<Fingerprint>, opts: NgramIndexOptions = {}): NgramIndex {
    const n = fps.length;
    const slots = new IntMap();
    let df = new Int32Array(1 << 16);
    for (let s = 0; s < n; s++) {
      for (const key of uniqueGrams(fps[s].iv)) {
        const slot = slots.getOrAdd(key, slots.size);
        if (slot >= df.length) { const bigger = new Int32Array(df.length * 2); bigger.set(df); df = bigger; }
        df[slot]++;
      }
    }
    const grams = slots.size;
    const maxDf = Math.max(opts.minStopDf ?? 20, Math.floor((opts.maxDfShare ?? 0.05) * n));
    const offsets = new Int32Array(grams + 1);
    let stop = 0;
    for (let g = 0; g < grams; g++) {
      const kept = df[g] <= maxDf;
      if (!kept) stop++;
      offsets[g + 1] = offsets[g] + (kept ? df[g] : 0);
    }
    const postings = n < 65536 ? new Uint16Array(offsets[grams]) : new Int32Array(offsets[grams]);
    const cursor = offsets.slice(0, grams);
    for (let s = 0; s < n; s++) {
      for (const key of uniqueGrams(fps[s].iv)) {
        const g = slots.get(key);
        if (offsets[g + 1] > offsets[g]) postings[cursor[g]++] = s;
      }
    }
    return new NgramIndex(n, slots, offsets, postings, stop);
  }

  /** Up to k song ids sharing the most (IDF-weighted) n-grams with the query, best first. */
  candidates(iv: ArrayLike<number>, k: number): number[] {
    const { scores, seen, offsets, postings, songs } = this;
    const touched: number[] = [];
    for (const key of uniqueGrams(iv)) {
      const g = this.slots.get(key);
      if (g < 0) continue;
      const df = offsets[g + 1] - offsets[g]; // 0 for stop-grams: skipped
      const w = Math.log(songs / df); // IDF
      for (let p = offsets[g]; p < offsets[g + 1]; p++) {
        const s = postings[p];
        if (!seen[s]) { seen[s] = 1; touched.push(s); }
        scores[s] += w;
      }
    }
    touched.sort((a, b) => scores[b] - scores[a] || a - b);
    const top = touched.slice(0, k);
    for (const s of touched) { scores[s] = 0; seen[s] = 0; }
    return top;
  }

  /** Approximate memory use, for the stats line. */
  get bytes(): number {
    return this.slots.bytes + this.offsets.byteLength + this.postings.byteLength + this.scores.byteLength + this.seen.byteLength;
  }
}
