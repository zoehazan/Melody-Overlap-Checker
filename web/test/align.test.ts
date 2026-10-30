import { describe, expect, it } from "vitest";
import { align, classify, weight, type Alignment } from "../src/align";
import { encode, seqFromText } from "../src/fingerprint";
import { pickMelody, skyline } from "../src/melody";
import { parseMidi, type Note } from "../src/midi";
import { writeMidi } from "./midi-writer";

// Public domain (Beethoven, 1824).
const ODE = seqFromText(
  "E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:0.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:0.5 C4:2",
);
// Original filler with wide, irregular leaps, unlike Ode to Joy.
const FILLER = seqFromText("G3:0.5 D5 A3:1.5 F5:0.5 B3 E5:2 C4:0.5 A5 F3:0.75 C#5:0.25");

const transform = (notes: Note[], shift: number, scale: number, offset = 0): Note[] =>
  notes.map((n) => ({ pitch: n.pitch + shift, start: n.start * scale + offset, dur: n.dur * scale }));

/** Concatenate melodies in time, each starting where the previous ended. */
function concat(...parts: Note[][]): Note[] {
  const out: Note[] = [];
  let t = 0;
  for (const p of parts) {
    const t0 = p[0].start;
    for (const n of p) out.push({ ...n, start: n.start - t0 + t });
    const last = out[out.length - 1];
    t = last.start + last.dur;
  }
  return out;
}

describe("align", () => {
  it("matches a melody with itself completely", () => {
    const fp = encode(ODE);
    const r = align(fp, fp)!;
    expect(r).toMatchObject({ uStart: 0, uEnd: ODE.length - 1, rStart: 0, rEnd: ODE.length - 1, identity: 1, rhythm: 1 });
    expect(r.exact).toBe(ODE.length - 1);
  });

  it("matches a transposed, tempo-scaled copy at 100% interval identity", () => {
    const ref = encode(ODE);
    for (const [shift, scale] of [[5, 1.5], [-3, 0.5], [7, 2], [-12, 0.75]]) {
      const r = align(encode(transform(ODE, shift, scale)), ref)!;
      expect(r.identity).toBe(1);
      expect(r.rhythm).toBe(1);
      expect(r.exact).toBe(ODE.length - 1);
      expect(classify(r).level).toBe(2);
    }
  });

  it("matches a transposed, tempo-scaled copy at 100% after a full MIDI round trip", () => {
    // Up a fourth, notes stretched to 1.5x as many beats, a different file resolution and BPM,
    // and a chordal accompaniment track the melody picker has to skip.
    const melody = transform(ODE, 5, 1.5);
    const chords = melody.filter((_, k) => k % 4 === 0).flatMap((n) => [48, 52, 55].map((p) => ({ pitch: p, start: n.start, dur: 6 })));
    const file = writeMidi({
      ppq: 96, tempo: 400_000,
      tracks: [{ name: "Piano", notes: chords }, { name: "Track 2", notes: melody, channel: 1, runningStatus: true }],
    });
    const parsed = parseMidi(file);
    const idx = pickMelody(parsed);
    expect(parsed.tracks[idx].name).toBe("Track 2");
    const r = align(encode(skyline(parsed.tracks[idx].notes)), encode(ODE))!;
    expect(r.identity).toBe(1);
    expect(r.exact).toBe(ODE.length - 1);
    expect(classify(r).level).toBe(2);
  });

  it("finds a borrowed passage embedded inside unrelated material", () => {
    const borrowed = transform(ODE.slice(0, 13), 2, 1.25);
    const query = concat(FILLER, borrowed, transform(FILLER, 3, 1));
    const r = align(encode(query), encode(ODE))!;
    expect(r.uStart).toBe(FILLER.length);
    expect(r.uEnd).toBe(FILLER.length + 12);
    expect(r.rStart).toBe(0);
    expect(r.identity).toBe(1);
    expect(classify(r).level).toBe(2);
  });

  it("still flags a copy with one note changed, at lower identity", () => {
    const changed = ODE.map((n, k) => (k === 8 ? { ...n, pitch: n.pitch + 5 } : n));
    const r = align(encode(changed), encode(ODE))!;
    expect(r.identity).toBeLessThan(1);
    expect(r.exact).toBeGreaterThanOrEqual(8);
    expect(classify(r).level).toBeGreaterThanOrEqual(1);
  });

  it("finds nothing notable between unrelated melodies", () => {
    const r = align(encode(FILLER), encode(ODE));
    expect(r === null || classify(r).level === 0).toBe(true);
  });

  it("returns null when either melody has fewer than two notes", () => {
    expect(align(encode(ODE.slice(0, 1)), encode(ODE))).toBeNull();
  });

  it("rewards leaps above steps above repeated notes", () => {
    expect([weight(0), weight(1), weight(-2), weight(3), weight(-7)]).toEqual([1, 1.5, 1.5, 3, 3]);
  });
});

describe("classify", () => {
  const base: Alignment = { score: 20, uStart: 0, uEnd: 10, rStart: 0, rEnd: 10, cols: 10, exact: 10, identity: 1, rhythm: 1, leaps: 2 };
  const at = (o: Partial<Alignment>) => classify({ ...base, ...o });

  it("Close match: 8+ exact intervals, 85%+ identity, rhythm at least half the same", () => {
    expect(at({ exact: 8, identity: 0.85, rhythm: 0.5 })).toEqual({ level: 2, stepwise: false });
  });

  it("Worth a listen: rhythm differs, or the run is shorter or looser", () => {
    expect(at({ rhythm: 0.4 }).level).toBe(1);
    expect(at({ exact: 6 }).level).toBe(1);
    expect(at({ identity: 0.8 }).level).toBe(1);
  });

  it("Passing resemblance below those thresholds", () => {
    expect(at({ exact: 5 }).level).toBe(0);
    expect(at({ identity: 0.7 }).level).toBe(0);
  });

  it("drops one level for short runs with no leaps", () => {
    expect(at({ exact: 9, leaps: 0 })).toEqual({ level: 1, stepwise: true });
    expect(at({ exact: 6, leaps: 0 })).toEqual({ level: 0, stepwise: true });
    // Long stepwise runs (10+) are kept: that much shared detail is notable even without leaps.
    expect(at({ exact: 10, leaps: 0 })).toEqual({ level: 2, stepwise: false });
  });
});
