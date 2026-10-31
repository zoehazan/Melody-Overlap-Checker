/* Search: compare one melody's fingerprint with the library and rank what resembles it.
 *
 * Two ways to search:
 *   searchLibrary  aligns against every entry (exact, but slow for thousands of long songs)
 *   searchIndexed  asks the n-gram index for the TOP_K most promising songs and aligns only
 *                  those, plus any files you added yourself, which are always fully checked
 */
import { align, classify, type Alignment, type Level } from "./align";
import type { Fingerprint } from "./fingerprint";
import type { LibraryEntry } from "./library";
import { N, type NgramIndex } from "./ngram";

export interface Hit {
  lib: LibraryEntry;
  r: Alignment;
  level: Level;
  stepwise: boolean;
}

/** Shorter shared runs are ignored completely. */
const MIN_EXACT = 4;

/** Songs passed from the n-gram prefilter to full alignment. */
export const TOP_K = 200;

/** Hits sorted by level (close first), then by alignment score. */
export function searchLibrary(query: Fingerprint, library: LibraryEntry[]): Hit[] {
  const results: Hit[] = [];
  for (const lib of library) {
    const r = align(query, lib.fp);
    if (!r || r.exact < MIN_EXACT) continue;
    results.push({ lib, r, ...classify(r) });
  }
  return results.sort((a, b) => b.level - a.level || b.r.score - a.r.score);
}

export interface SearchResult {
  hits: Hit[];
  /** Songs that went through full alignment. */
  aligned: number;
  /** True when the n-gram prefilter chose them; false when everything was aligned. */
  prefiltered: boolean;
}

/**
 * Prefilter `indexed` (the songs the n-gram index was built from, same order) to the TOP_K best
 * candidates, then align those and every entry in `always`.
 * Falls back to aligning everything when the library is small or the melody is shorter than one
 * n-gram, since the prefilter has nothing to gain (or nothing to go on) then.
 */
export function searchIndexed(query: Fingerprint, indexed: LibraryEntry[], index: NgramIndex | null,
  always: LibraryEntry[] = [], k = TOP_K): SearchResult {
  const usable = index !== null && query.iv.length >= N && indexed.length > k;
  const pool = usable ? index.candidates(query.iv, k).map((i) => indexed[i]) : indexed;
  const all = pool.concat(always);
  return { hits: searchLibrary(query, all), aligned: all.length, prefiltered: usable };
}
