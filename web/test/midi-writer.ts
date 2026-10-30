/* Test helper: builds Standard MIDI File bytes in memory, so the tests need no .mid files on disk. */
import type { Note } from "../src/midi";

export interface TrackSpec {
  name?: string;
  notes: Note[];
  channel?: number;
  /** Omit repeated status bytes, as many DAWs do. */
  runningStatus?: boolean;
  /** Write note-offs as note-on with velocity 0. */
  zeroVelocityOff?: boolean;
  /** Put a program change at the start (a message with one data byte). */
  programChange?: number;
}

export interface FileSpec {
  format?: 0 | 1;
  ppq?: number;
  timeSig?: [num: number, den: number];
  /** Microseconds per quarter note. The parser should ignore it. */
  tempo?: number;
  tracks: TrackSpec[];
}

function vlq(n: number): number[] {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
}
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n: number) => [(n >>> 8) & 255, n & 255];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

function trackBytes(t: TrackSpec, ppq: number, meta: number[][]): number[] {
  const ch = t.channel ?? 0;
  type Ev = { tick: number; order: number; bytes: number[] };
  const evs: Ev[] = meta.map((bytes) => ({ tick: 0, order: -2, bytes }));
  if (t.name !== undefined) evs.push({ tick: 0, order: -2, bytes: [0xff, 0x03, ...vlq(t.name.length), ...ascii(t.name)] });
  if (t.programChange !== undefined) evs.push({ tick: 0, order: -1, bytes: [0xc0 | ch, t.programChange] });
  for (const n of t.notes) {
    const on = Math.round(n.start * ppq), off = Math.round((n.start + n.dur) * ppq);
    evs.push({ tick: on, order: 1, bytes: [0x90 | ch, n.pitch, 100] });
    // Note-offs sort before note-ons at the same tick, so repeated pitches pair up correctly.
    evs.push({ tick: off, order: 0, bytes: t.zeroVelocityOff ? [0x90 | ch, n.pitch, 0] : [0x80 | ch, n.pitch, 64] });
  }
  evs.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const out: number[] = [];
  let last = 0, status = -1;
  for (const e of evs) {
    out.push(...vlq(e.tick - last));
    last = e.tick;
    const isChannel = e.bytes[0] < 0xf0;
    if (t.runningStatus && isChannel && e.bytes[0] === status) out.push(...e.bytes.slice(1));
    else out.push(...e.bytes);
    status = isChannel ? e.bytes[0] : -1; // meta events cancel running status
  }
  out.push(0, 0xff, 0x2f, 0x00); // end of track
  return [...ascii("MTrk"), ...u32(out.length), ...out];
}

export function writeMidi(spec: FileSpec): ArrayBuffer {
  const ppq = spec.ppq ?? 480;
  const format = spec.format ?? (spec.tracks.length > 1 ? 1 : 0);
  const meta: number[][] = [];
  if (spec.timeSig) meta.push([0xff, 0x58, 4, spec.timeSig[0], Math.log2(spec.timeSig[1]), 24, 8]);
  if (spec.tempo) meta.push([0xff, 0x51, 3, (spec.tempo >> 16) & 255, (spec.tempo >> 8) & 255, spec.tempo & 255]);
  const bytes = [...ascii("MThd"), ...u32(6), ...u16(format), ...u16(spec.tracks.length), ...u16(ppq)];
  spec.tracks.forEach((t, i) => bytes.push(...trackBytes(t, ppq, i === 0 ? meta : [])));
  return new Uint8Array(bytes).buffer;
}
