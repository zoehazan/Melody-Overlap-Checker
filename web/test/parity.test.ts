/* Parity with the original single-file prototype.
 *
 * Phase 1 promised "identical results" after the refactor. This test pulls the matching code out
 * of prototype.html and runs both versions on the same inputs. When Phase 5 tunes thresholds and
 * weights on purpose, results will differ: delete this test then, and rely on the eval harness.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { align, classify } from "../src/align";
import { EXAMPLE } from "../src/example";
import { encode } from "../src/fingerprint";
import { entriesFromFile, type LibraryFile } from "../src/library";
import { pickMelody, skyline } from "../src/melody";
import { parseMidi, type Note } from "../src/midi";
import { searchLibrary } from "../src/search";
import { writeMidi } from "./midi-writer";

const PROTOTYPE = fileURLToPath(new URL("../../prototype.html", import.meta.url));
const LIBRARY = fileURLToPath(new URL("../public/pd-library.json", import.meta.url));

/* eslint-disable @typescript-eslint/no-explicit-any */
function loadPrototype(): any {
  const html = readFileSync(PROTOTYPE, "utf8");
  const from = html.indexOf("/* ---------- Note helpers");
  const to = html.indexOf("/* ---------- State");
  const code = html.slice(from, to);
  return new Function(`${code}; return { encode, align, classify, parseMidi, skyline, pickMelody, seqFromText, PD };`)();
}

/** Small seeded random generator, so failures are reproducible. */
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function randomMelody(rand: () => number, len: number): Note[] {
  const out: Note[] = [];
  let pitch = 55 + Math.floor(rand() * 20), t = 0;
  const durs = [0.25, 0.5, 0.5, 1, 1, 1, 1.5, 2];
  for (let k = 0; k < len; k++) {
    const dur = durs[Math.floor(rand() * durs.length)];
    out.push({ pitch, start: t, dur });
    t += dur;
    pitch += Math.floor(rand() * 9) - 4 + (rand() < 0.1 ? 12 * Math.sign(rand() - 0.5) : 0);
    pitch = Math.min(100, Math.max(30, pitch)); // stay inside MIDI's 0-127, even after chord notes are added below
  }
  return out;
}

describe.skipIf(!existsSync(PROTOTYPE))("parity with prototype.html", () => {
  const proto = loadPrototype();
  const library = entriesFromFile(JSON.parse(readFileSync(LIBRARY, "utf8")) as LibraryFile);

  it("built-in library fingerprints are identical", () => {
    expect(library.map((l) => [l.title, l.credit, l.fp])).toEqual(
      proto.PD.map(([title, credit, txt]: string[]) => [title, credit, proto.encode(proto.seqFromText(txt))]),
    );
  });

  it("example melody gives identical results", () => {
    const fp = encode(EXAMPLE);
    const expected = library
      .map((lib) => ({ lib, r: proto.align(fp, lib.fp) }))
      .filter((x) => x.r && x.r.exact >= 4)
      .map((x) => ({ ...x, ...proto.classify(x.r) }))
      .sort((a, b) => b.level - a.level || b.r.score - a.r.score);
    const actual = searchLibrary(fp, library);
    expect(actual).toEqual(expected);
    // And the prototype's headline result: Ode to Joy, borrowed in the example, is a close match.
    expect(actual[0].lib.title).toBe("Ode to Joy");
    expect(actual[0].level).toBe(2);
  });

  it("encode, align and classify agree on 300 random queries", () => {
    const rand = rng(1);
    for (let q = 0; q < 300; q++) {
      // Mix of pure random lines and library tunes with random notes changed.
      let notes = randomMelody(rand, 6 + Math.floor(rand() * 60));
      if (q % 2) {
        const [, , txt] = proto.PD[q % proto.PD.length];
        notes = proto.seqFromText(txt).map((n: Note) => (rand() < 0.15 ? { ...n, pitch: n.pitch + Math.floor(rand() * 5) - 2 } : n));
      }
      const fp = encode(notes);
      expect(fp).toEqual(proto.encode(notes));
      for (const lib of library) {
        const r = align(fp, lib.fp);
        expect(r).toEqual(proto.align(fp, lib.fp));
        if (r) expect(classify(r)).toEqual(proto.classify(r));
      }
    }
  });

  it("MIDI parsing, track choice and skyline agree on 100 random files", () => {
    const rand = rng(2);
    for (let f = 0; f < 100; f++) {
      const tracks = Array.from({ length: 1 + Math.floor(rand() * 4) }, (_, k) => {
        let notes = randomMelody(rand, 4 + Math.floor(rand() * 40));
        if (rand() < 0.4) notes = notes.flatMap((n) => [n, { ...n, pitch: n.pitch - 3 - Math.floor(rand() * 5) }]); // chords
        return {
          name: rand() < 0.5 ? ["Lead", "Vox", "Bass", "Pad", "Keys", "Strings"][Math.floor(rand() * 6)] : undefined,
          notes, channel: rand() < 0.15 ? 9 : k, runningStatus: rand() < 0.5, zeroVelocityOff: rand() < 0.5,
        };
      });
      const file = writeMidi({ ppq: [96, 480, 960][f % 3], timeSig: rand() < 0.5 ? [6, 8] : undefined, tracks });
      const ours = parseMidi(file);
      expect(ours).toEqual(proto.parseMidi(file));
      if (!ours.tracks.length) continue;
      const idx = pickMelody(ours);
      expect(idx).toBe(proto.pickMelody(ours));
      expect(skyline(ours.tracks[idx].notes)).toEqual(proto.skyline(ours.tracks[idx].notes));
    }
  });
});

describe("pd-library.json", () => {
  it("is up to date with the seed melodies (run `npm run build:seed-library` if this fails)", async () => {
    const { buildSeedLibrary } = await import("../scripts/seed-library");
    expect(JSON.parse(readFileSync(LIBRARY, "utf8"))).toEqual(buildSeedLibrary());
  });

  it("stores fingerprints and credits only, never notes", () => {
    const file = JSON.parse(readFileSync(LIBRARY, "utf8")) as LibraryFile;
    for (const m of file.melodies) expect(Object.keys(m).sort()).toEqual(["credit", "iv", "rh", "source", "title"]);
  });
});
