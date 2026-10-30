import { describe, expect, it } from "vitest";
import { seqFromText } from "../src/fingerprint";
import { parseMidi } from "../src/midi";
import { writeMidi } from "./midi-writer";

const SCALE = seqFromText("C4 D4 E4:0.5 F4:0.5 G4:2");
const pitches = (ns: { pitch: number }[]) => ns.map((n) => n.pitch);

describe("parseMidi", () => {
  it("reads a format 0 file into notes measured in beats", () => {
    const { tracks, beatsPerBar } = parseMidi(writeMidi({ format: 0, tracks: [{ notes: SCALE }] }));
    expect(tracks).toHaveLength(1);
    expect(beatsPerBar).toBe(4); // default 4/4
    expect(tracks[0].notes.map(({ pitch, start, dur }) => ({ pitch, start, dur }))).toEqual(SCALE);
  });

  it("gives the same beats whatever the ticks-per-quarter resolution", () => {
    for (const ppq of [96, 480, 960]) {
      const { tracks } = parseMidi(writeMidi({ ppq, tracks: [{ notes: SCALE }] }));
      expect(tracks[0].notes.map((n) => n.start)).toEqual([0, 1, 2, 2.5, 3]);
    }
  });

  it("ignores tempo, so the same notes at 60 or 180 BPM parse identically", () => {
    const slow = parseMidi(writeMidi({ tempo: 1_000_000, tracks: [{ notes: SCALE }] }));
    const fast = parseMidi(writeMidi({ tempo: 333_333, tracks: [{ notes: SCALE }] }));
    expect(fast).toEqual(slow);
  });

  it("reads format 1 track names and keeps tracks separate", () => {
    const { tracks } = parseMidi(writeMidi({
      format: 1,
      tracks: [{ name: "Lead Vocal", notes: SCALE }, { name: "Bass", notes: seqFromText("C2:4"), channel: 1 }],
    }));
    expect(tracks.map((t) => t.name)).toEqual(["Lead Vocal", "Bass"]);
    expect(pitches(tracks[1].notes)).toEqual([36]);
  });

  it("names unnamed tracks by position", () => {
    const { tracks } = parseMidi(writeMidi({ tracks: [{ notes: SCALE }, { notes: SCALE }] }));
    expect(tracks.map((t) => t.name)).toEqual(["Track 1", "Track 2"]);
  });

  it("handles running status and note-on with velocity 0 as note-off", () => {
    const plain = parseMidi(writeMidi({ tracks: [{ notes: SCALE }] }));
    const compact = parseMidi(writeMidi({ tracks: [{ notes: SCALE, runningStatus: true, zeroVelocityOff: true }] }));
    expect(compact.tracks[0].notes).toEqual(plain.tracks[0].notes);
  });

  it("reads one-data-byte messages such as program change without losing its place", () => {
    const { tracks } = parseMidi(writeMidi({ tracks: [{ notes: SCALE, programChange: 40, runningStatus: true }] }));
    expect(pitches(tracks[0].notes)).toEqual(pitches(SCALE));
  });

  it("pairs repeated notes of the same pitch in order", () => {
    const { tracks } = parseMidi(writeMidi({ tracks: [{ notes: seqFromText("A4:0.5 A4:0.5 A4") }] }));
    expect(tracks[0].notes.map((n) => [n.start, n.dur])).toEqual([[0, 0.5], [0.5, 0.5], [1, 1]]);
  });

  it("sorts simultaneous notes highest first", () => {
    const chord = [{ pitch: 60, start: 0, dur: 1 }, { pitch: 67, start: 0, dur: 1 }, { pitch: 64, start: 0, dur: 1 }];
    const { tracks } = parseMidi(writeMidi({ tracks: [{ notes: chord }] }));
    expect(pitches(tracks[0].notes)).toEqual([67, 64, 60]);
  });

  it("converts the time signature into beats per bar", () => {
    expect(parseMidi(writeMidi({ timeSig: [3, 4], tracks: [{ notes: SCALE }] })).beatsPerBar).toBe(3);
    expect(parseMidi(writeMidi({ timeSig: [6, 8], tracks: [{ notes: SCALE }] })).beatsPerBar).toBe(3);
  });

  it("drops drum-only tracks (channel 10)", () => {
    const { tracks } = parseMidi(writeMidi({
      tracks: [{ name: "Drums", notes: seqFromText("C2 D2 C2 D2"), channel: 9 }, { name: "Lead", notes: SCALE }],
    }));
    expect(tracks.map((t) => t.name)).toEqual(["Lead"]);
  });

  it("rejects files that are not MIDI", () => {
    expect(() => parseMidi(new TextEncoder().encode("RIFF....WAVEfmt ").buffer)).toThrow(/not a standard MIDI file/);
  });

  it("rejects SMPTE timing", () => {
    const buf = new Uint8Array(writeMidi({ tracks: [{ notes: SCALE }] }));
    buf[12] = 0xe7; // division high byte with the SMPTE bit set
    expect(() => parseMidi(buf.buffer)).toThrow(/SMPTE/);
  });
});
