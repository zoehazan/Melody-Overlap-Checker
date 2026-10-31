/* Shared by the benchmark scripts. */
import type { Fingerprint } from "../src/fingerprint";
import type { Note } from "../src/midi";

/** Notes that reproduce a fingerprint slice exactly: pitches from intervals, gaps from rhythm ratios. */
export function notesFromFingerprint(fp: Fingerprint, from: number, count: number, startPitch = 64, scale = 1): Note[] {
  const notes: Note[] = [{ pitch: startPitch, start: 0, dur: scale }];
  let gap = scale;
  for (let k = from; k < from + count - 1; k++) {
    if (k > from) gap *= 2 ** fp.rh[k];
    const prev = notes[notes.length - 1];
    notes.push({ pitch: prev.pitch + fp.iv[k], start: prev.start + gap, dur: gap });
  }
  return notes;
}
