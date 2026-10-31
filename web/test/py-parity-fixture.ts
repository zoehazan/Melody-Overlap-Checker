/* Cross-language parity fixture: what the TypeScript pipeline makes of a set of synthetic MIDI
 * files, saved to indexer/tests/fixtures/parity.json for the Python port to reproduce.
 *
 * Only the recipe for each file is saved (note lists and writer options) plus a SHA-256 of its
 * bytes. The Python test rebuilds the bytes with its own copy of the writer, checks the hash,
 * then checks that parsing, track choice, skyline and fingerprint all come out the same.
 */
import { createHash } from "node:crypto";
import { encode } from "../src/fingerprint";
import { pickMelody, skyline } from "../src/melody";
import { parseMidi, type Note } from "../src/midi";
import { writeMidi, type FileSpec } from "./midi-writer";
import { randomMelody, rng } from "./random-melody";

const strip = (ns: Note[]) => ns.map(({ pitch, start, dur }) => [pitch, start, dur]);

export function buildPyParityFixture() {
  const rand = rng(7);
  const files = [];
  for (let f = 0; f < 60; f++) {
    const tracks = Array.from({ length: 1 + Math.floor(rand() * 4) }, (_, k) => {
      let notes = randomMelody(rand, 4 + Math.floor(rand() * 40));
      // Chords, with humanized timing so some chord notes land either side of the 0.06-beat chord window.
      if (rand() < 0.5) notes = notes.flatMap((n) => [n, { ...n, pitch: n.pitch - 3 - Math.floor(rand() * 5), start: Math.max(0, n.start + (rand() - 0.5) * 0.16) }]);
      if (rand() < 0.3) notes = notes.map((n) => ({ ...n, start: n.start * 0.75, dur: n.dur * 0.75 })); // odd tick values
      return {
        name: rand() < 0.5 ? ["Lead", "Vox", "Bass", "Pad", "Keys", "Strings", " Melody "][Math.floor(rand() * 7)] : undefined,
        notes, channel: rand() < 0.15 ? 9 : k, runningStatus: rand() < 0.5, zeroVelocityOff: rand() < 0.5,
        programChange: rand() < 0.2 ? Math.floor(rand() * 128) : undefined,
      };
    });
    const spec: FileSpec = {
      ppq: [96, 480, 960, 384, 25][f % 5], timeSig: rand() < 0.3 ? [6, 8] : rand() < 0.2 ? [3, 4] : undefined,
      tempo: rand() < 0.3 ? 500_000 : undefined, tracks,
    };
    const bytes = new Uint8Array(writeMidi(spec));
    const parsed = parseMidi(bytes.buffer);
    const pick = parsed.tracks.length ? pickMelody(parsed) : -1;
    const sky = pick >= 0 ? skyline(parsed.tracks[pick].notes) : [];
    files.push({
      spec: { ...spec, tracks: spec.tracks.map((t) => ({ ...t, notes: strip(t.notes) })) },
      sha256: createHash("sha256").update(bytes).digest("hex"),
      tracks: parsed.tracks.map((t) => ({ name: t.name, notes: strip(t.notes) })),
      beatsPerBar: parsed.beatsPerBar,
      pick,
      skyline: strip(sky),
      fp: encode(sky),
    });
  }
  // Plain note lists with awkward timing ratios, to exercise rounding in the rhythm encoding.
  const sequences = [];
  for (let q = 0; q < 200; q++) {
    const notes = randomMelody(rand, 3 + Math.floor(rand() * 30)).map((n, k) => ({ ...n, start: n.start * (1 + (k % 3) * Math.SQRT2 / 7) }));
    sequences.push({ notes: strip(notes), fp: encode(notes) });
  }
  return { generatedBy: "web/test/py-parity-fixture.ts (npm run build:py-parity-fixture)", files, sequences };
}
