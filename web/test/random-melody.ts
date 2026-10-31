/* Seeded random melodies for tests. Synthetic, so no real song's notes are involved. */
import type { Note } from "../src/midi";

/** Small seeded random generator (LCG), so failures are reproducible. */
export function rng(seed: number): () => number {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export function randomMelody(rand: () => number, len: number): Note[] {
  const out: Note[] = [];
  let pitch = 55 + Math.floor(rand() * 20), t = 0;
  const durs = [0.25, 0.5, 0.5, 1, 1, 1, 1.5, 2];
  for (let k = 0; k < len; k++) {
    const dur = durs[Math.floor(rand() * durs.length)];
    out.push({ pitch, start: t, dur });
    t += dur;
    pitch += Math.floor(rand() * 9) - 4 + (rand() < 0.1 ? 12 * Math.sign(rand() - 0.5) : 0);
    pitch = Math.min(100, Math.max(30, pitch)); // stay inside MIDI's 0-127, even after chord notes are added
  }
  return out;
}
