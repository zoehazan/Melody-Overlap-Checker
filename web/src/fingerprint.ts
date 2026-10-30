/* Fingerprint encoding: a melody becomes two parallel sequences, one entry per pair of consecutive notes.
 *
 *   iv (interval): semitones from this note to the next. Transposing a melody adds the same
 *                  number to every pitch, so the differences, and the fingerprint, stay the same.
 *   rh (rhythm):   log2 of (this inter-onset gap / previous gap), rounded and clamped to -3..3.
 *                  Playing faster or slower scales every gap by the same factor, so ratios stay
 *                  the same. 0 = same length, 1 = twice as long, -1 = half as long.
 *
 * Only these sequences (plus title and credit) are stored for reference songs, never the notes.
 */
import type { Note } from "./midi";

export interface Fingerprint {
  iv: number[];
  rh: number[];
}

export function encode(notes: Note[]): Fingerprint {
  const iv: number[] = [], rh: number[] = [];
  for (let k = 0; k < notes.length - 1; k++) {
    let d = notes[k + 1].pitch - notes[k].pitch;
    // Fold leaps wider than an octave into one octave, so octave displacement still matches.
    while (d > 12) d -= 12;
    while (d < -12) d += 12;
    iv.push(d);
    const ioi = Math.max(1e-3, notes[k + 1].start - notes[k].start);
    if (k === 0) rh.push(0); // the first gap has nothing to compare against
    else {
      const prev = Math.max(1e-3, notes[k].start - notes[k - 1].start);
      rh.push(Math.max(-3, Math.min(3, Math.round(Math.log2(ioi / prev)))));
    }
  }
  return { iv, rh };
}

/* ---------- Note text: "C4 D4:0.5 F#4:2" = pitch name + octave, optional ":beats" (default 1) ---------- */

const NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function pitchOf(s: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) throw new Error(`Not a note name: ${s}`);
  const p = NAMES[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  return p + (parseInt(m[3], 10) + 1) * 12;
}

/** Notes played back to back, starting at beat 0. */
export function seqFromText(txt: string): Note[] {
  let t = 0;
  const notes: Note[] = [];
  for (const tok of txt.trim().split(/\s+/)) {
    const [n, d] = tok.split(":");
    const dur = d ? parseFloat(d) : 1;
    notes.push({ pitch: pitchOf(n), start: t, dur });
    t += dur;
  }
  return notes;
}
