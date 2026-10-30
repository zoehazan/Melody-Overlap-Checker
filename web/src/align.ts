/* Local alignment (Smith-Waterman) of two fingerprints, and classification of the best match.
 *
 * H[i][j] is the best score of any aligned run that ends at interval i of A and interval j of B.
 * Each cell extends a diagonal (match or mismatch), skips a note in A (up), skips one in B (left),
 * or resets to 0 (start fresh). Resetting is what makes it *local*: unrelated material before
 * and after a shared passage costs nothing. The highest cell anywhere is the end of the best
 * passage, and following the traceback pointers from there finds its start.
 *
 * Cost is O(n*m) time and memory, fine for one melody against hundreds of songs. Phase 4 adds an
 * n-gram prefilter so it only runs on likely candidates in a large index.
 */
import type { Fingerprint } from "./fingerprint";

/** Penalty for skipping a note in either melody. */
const GAP = -2;

/** Reward for a matching interval: repeated note 1, step (1-2 semitones) 1.5, leap (3+) 3. */
export function weight(x: number): number {
  const a = Math.abs(x);
  return a === 0 ? 1 : a <= 2 ? 1.5 : 3;
}

export interface Alignment {
  score: number;
  /** The passage in A (the user's melody), as note indices, inclusive: notes uStart..uEnd. */
  uStart: number;
  uEnd: number;
  /** The passage in B (the reference), as note indices, inclusive. */
  rStart: number;
  rEnd: number;
  /** Aligned columns, including mismatches and gaps. */
  cols: number;
  /** Columns where the intervals are identical. */
  exact: number;
  /** exact / cols */
  identity: number;
  /** Share of exact columns whose rhythm values also agree. */
  rhythm: number;
  /** Exact columns that are leaps of 3 semitones or more. */
  leaps: number;
}

export function align(A: Fingerprint, B: Fingerprint): Alignment | null {
  const n = A.iv.length, m = B.iv.length;
  if (!n || !m) return null;
  const W = m + 1;
  const H = new Float32Array((n + 1) * W);
  const T = new Uint8Array((n + 1) * W); // traceback: 0 stop, 1 diag, 2 up, 3 left
  let best = 0, bi = 0, bj = 0;
  for (let i = 1; i <= n; i++) {
    const a = A.iv[i - 1], ar = A.rh[i - 1];
    for (let j = 1; j <= m; j++) {
      const b = B.iv[j - 1];
      let s;
      if (a === b) s = weight(a) + (ar === B.rh[j - 1] ? 1 : 0);
      else if (Math.abs(a - b) === 1) s = -0.5; // off by a semitone: a mild penalty
      else s = -2;
      const d = H[(i - 1) * W + j - 1] + s, u = H[(i - 1) * W + j] + GAP, l = H[i * W + j - 1] + GAP;
      let v = 0, t = 0;
      if (d > v) { v = d; t = 1; }
      if (u > v) { v = u; t = 2; }
      if (l > v) { v = l; t = 3; }
      H[i * W + j] = v;
      T[i * W + j] = t;
      if (v > best) { best = v; bi = i; bj = j; }
    }
  }
  if (best <= 0) return null;

  // Walk back from the best cell, counting what the passage is made of.
  let i = bi, j = bj, cols = 0, exact = 0, rhythmSame = 0, leaps = 0;
  while (i > 0 && j > 0 && T[i * W + j] !== 0) {
    const t = T[i * W + j];
    cols++;
    if (t === 1) {
      if (A.iv[i - 1] === B.iv[j - 1]) {
        exact++;
        if (A.rh[i - 1] === B.rh[j - 1]) rhythmSame++;
        if (Math.abs(A.iv[i - 1]) >= 3) leaps++;
      }
      i--; j--;
    } else if (t === 2) i--;
    else j--;
  }
  return {
    score: best, uStart: i, uEnd: bi, rStart: j, rEnd: bj, cols, exact,
    identity: exact / cols, rhythm: exact ? rhythmSame / exact : 0, leaps,
  };
}

/** 2 = Close match, 1 = Worth a listen, 0 = Passing resemblance. */
export type Level = 0 | 1 | 2;

export interface Classification {
  level: Level;
  /** True when the level was lowered because the passage moves only by steps. */
  stepwise: boolean;
}

export function classify(r: Alignment): Classification {
  let level: Level = 0;
  if (r.exact >= 8 && r.identity >= 0.85 && r.rhythm >= 0.5) level = 2;
  else if (r.exact >= 6 && r.identity >= 0.75) level = 1;
  // Scales and repeated notes are everywhere; without a single shared leap, short runs mean little.
  const stepwise = r.leaps === 0 && r.exact < 10 && level > 0;
  if (stepwise) level = (level - 1) as Level;
  return { level, stepwise };
}
