import { describe, expect, it } from "vitest";
import { seqFromText } from "../src/fingerprint";
import { pickMelody, skyline, trackScore } from "../src/melody";
import type { Note, Track } from "../src/midi";

describe("skyline", () => {
  it("keeps the top note of each chord", () => {
    const notes: Note[] = [
      { pitch: 72, start: 0, dur: 1 }, { pitch: 64, start: 0, dur: 1 },
      { pitch: 74, start: 1, dur: 1 }, { pitch: 65, start: 1.03, dur: 1 }, // slightly late chord note
    ];
    expect(skyline(notes).map((n) => n.pitch)).toEqual([72, 74]);
  });

  it("trims each note so it ends where the next begins", () => {
    const notes: Note[] = [{ pitch: 60, start: 0, dur: 3 }, { pitch: 62, start: 1, dur: 1 }];
    expect(skyline(notes).map((n) => n.dur)).toEqual([1, 1]);
  });

  it("does not modify its input", () => {
    const notes: Note[] = [{ pitch: 60, start: 0, dur: 3 }, { pitch: 62, start: 1, dur: 1 }];
    skyline(notes);
    expect(notes[0].dur).toBe(3);
  });
});

describe("pickMelody", () => {
  const tune = seqFromText("E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:0.5 D4:2");
  const chords = tune.flatMap((n) => [n, { ...n, pitch: n.pitch - 4 }, { ...n, pitch: n.pitch - 7 }]);
  const bass = tune.map((n) => ({ ...n, pitch: n.pitch - 24 }));
  const track = (name: string, notes: Note[]): Track => ({ name, notes, drums: false });

  it("prefers a single-line track in singing range", () => {
    const parsed = { beatsPerBar: 4, tracks: [track("Piano", chords), track("Track 2", bass), track("Track 3", tune)] };
    expect(pickMelody(parsed)).toBe(2);
  });

  it("uses track names as a strong hint", () => {
    expect(trackScore(track("Lead Vocal", tune))).toBeGreaterThan(trackScore(track("Track 3", tune)));
    expect(trackScore(track("Strings", tune))).toBeLessThan(trackScore(track("Track 3", tune)));
  });

  it("throws when there are no tracks", () => {
    expect(() => pickMelody({ beatsPerBar: 4, tracks: [] })).toThrow(/No notes/);
  });
});
