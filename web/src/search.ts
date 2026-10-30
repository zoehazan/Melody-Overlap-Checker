/* Search: compare one melody's fingerprint with every library entry and rank what resembles it.
 *
 * Phase 1 aligns against every entry, which is instant for a small library. Phase 4 adds an
 * interval n-gram prefilter here so only the most promising few hundred songs get aligned.
 */
import { align, classify, type Alignment, type Level } from "./align";
import type { Fingerprint } from "./fingerprint";
import type { LibraryEntry } from "./library";

export interface Hit {
  lib: LibraryEntry;
  r: Alignment;
  level: Level;
  stepwise: boolean;
}

/** Shorter shared runs are ignored completely. */
const MIN_EXACT = 4;

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
