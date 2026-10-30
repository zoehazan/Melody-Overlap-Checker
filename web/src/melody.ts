/* Melody extraction: choose the likeliest melody track, then reduce it to one note at a time.
 *
 * Both steps are heuristics. They work well for a songwriter's own export with the melody on
 * its own track, and less reliably on fan-made MIDI files of full arrangements.
 * The Phase 3 Python indexer must mirror this scoring exactly so both sides pick the same way.
 */
import type { Note, ParsedMidi, Track } from "./midi";

/** Notes starting within this many beats of each other count as one chord. */
const CHORD_WINDOW = 0.06;

/** Keep the top note at each onset and trim overlaps, so chords reduce to a single melodic line. */
export function skyline(notes: Note[]): Note[] {
  const out: Note[] = [];
  for (const n of notes) {
    const last = out[out.length - 1];
    if (last && Math.abs(n.start - last.start) < CHORD_WINDOW) {
      if (n.pitch > last.pitch) out[out.length - 1] = { ...n };
      continue;
    }
    out.push({ ...n });
  }
  for (let k = 0; k < out.length - 1; k++) out[k].dur = Math.min(out[k].dur, out[k + 1].start - out[k].start);
  return out;
}

/** Higher is more melody-like. */
export function trackScore(t: Track): number {
  const nm = t.name.toLowerCase();
  let s = /melod|vocal|vox|lead|voice|sing|tune/.test(nm) ? 3 : 0;
  if (/bass|drum|perc|pad|chord|string/.test(nm)) s -= 2;
  const sky = skyline(t.notes);
  // Share of notes that survive the skyline: 1.0 for a single line, low for a chord part.
  s += (sky.length / t.notes.length) * 2;
  // Mean pitch between A3 and C6, the usual singing and lead range.
  const mean = sky.reduce((a, n) => a + n.pitch, 0) / sky.length;
  if (mean >= 57 && mean <= 84) s += 1.5;
  if (sky.length < 12) s -= 3;
  return s;
}

/** Index of the best-scoring track. The first one wins ties. */
export function pickMelody(parsed: ParsedMidi): number {
  if (!parsed.tracks.length) throw new Error("No notes found in this file.");
  let best = 0, bs = -1e9;
  parsed.tracks.forEach((t, i) => {
    const s = trackScore(t);
    if (s > bs) { bs = s; best = i; }
  });
  return best;
}
