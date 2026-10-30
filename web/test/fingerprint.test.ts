import { describe, expect, it } from "vitest";
import { encode, pitchOf, seqFromText } from "../src/fingerprint";
import type { Note } from "../src/midi";

describe("note text", () => {
  it("reads pitch names with octave numbers (C4 = middle C = 60)", () => {
    expect(pitchOf("C4")).toBe(60);
    expect(pitchOf("A4")).toBe(69);
    expect(pitchOf("F#4")).toBe(66);
    expect(pitchOf("Bb3")).toBe(58);
    expect(pitchOf("C-1")).toBe(0);
    expect(() => pitchOf("H2")).toThrow();
  });

  it("lays notes end to end with default length 1 beat", () => {
    expect(seqFromText("C4 D4:0.5 E4:2")).toEqual([
      { pitch: 60, start: 0, dur: 1 }, { pitch: 62, start: 1, dur: 0.5 }, { pitch: 64, start: 1.5, dur: 2 },
    ]);
  });
});

describe("encode", () => {
  it("records semitone intervals and log2 rhythm ratios", () => {
    // Gaps: 1, 1, 0.5, 2 beats. Ratios to previous gap: -, 1, 0.5, 4 -> log2: 0, 0, -1, 2
    const fp = encode(seqFromText("C4 E4 G4:0.5 C5:2 B4"));
    expect(fp.iv).toEqual([4, 3, 5, -1]);
    expect(fp.rh).toEqual([0, 0, -1, 2]);
  });

  it("has one entry per pair of notes, and nothing for a single note", () => {
    expect(encode(seqFromText("C4"))).toEqual({ iv: [], rh: [] });
  });

  it("folds leaps wider than an octave back into one octave", () => {
    expect(encode(seqFromText("C4 D5 C4 C6")).iv).toEqual([2, -2, 12]);
  });

  it("clamps rhythm ratios to the range -3..3", () => {
    expect(encode(seqFromText("C4:0.125 D4:16 E4:0.125 F4")).rh).toEqual([0, 3, -3]);
  });

  it("is the same in any key and at any tempo", () => {
    const tune = seqFromText("A4:0.5 C5 D5:0.5 E5:0.75 F5:0.25 E5:0.5 D5 B4:0.5 G4:0.75 A4:0.25 B4:0.5 C5 A4:0.5");
    for (const shift of [-7, -1, 3, 12]) {
      for (const scale of [0.5, 0.75, 1.5, 3]) {
        const moved: Note[] = tune.map((n) => ({ pitch: n.pitch + shift, start: n.start * scale + 10, dur: n.dur * scale }));
        expect(encode(moved)).toEqual(encode(tune));
      }
    }
  });
});
