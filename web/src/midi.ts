/* MIDI parsing: Standard MIDI File bytes -> tracks of notes measured in beats.
 *
 * A .mid file is a header chunk ("MThd") followed by track chunks ("MTrk"). Each track is a
 * list of events, each preceded by a delta time (ticks since the previous event) written as a
 * variable-length quantity. We only need note on/off, the track name and the time signature.
 * Tempo events are ignored on purpose: timings stay in beats, so tempo never affects matching.
 */

export interface Note {
  /** MIDI note number, 60 = middle C. */
  pitch: number;
  /** Onset in beats (quarter notes) from the start of the file. */
  start: number;
  /** Length in beats. */
  dur: number;
  /** MIDI channel 0-15, when the note came from a file. */
  ch?: number;
}

export interface Track {
  name: string;
  /** Sorted by start, then highest pitch first. */
  notes: Note[];
  /** True when every note is on channel 10 (index 9), the General MIDI drum channel. */
  drums: boolean;
}

export interface ParsedMidi {
  /** Non-drum tracks that contain at least one note. */
  tracks: Track[];
  /** Bar length in quarter-note beats, from the time signature (4/4 -> 4, 6/8 -> 3). */
  beatsPerBar: number;
}

export function parseMidi(buf: ArrayBuffer): ParsedMidi {
  const d = new DataView(buf);
  let p = 0;
  const str = (n: number) => {
    let s = "";
    for (let k = 0; k < n; k++) s += String.fromCharCode(d.getUint8(p + k));
    p += n;
    return s;
  };
  const u32 = () => { const v = d.getUint32(p); p += 4; return v; };
  const u16 = () => { const v = d.getUint16(p); p += 2; return v; };

  if (str(4) !== "MThd") throw new Error("This file is not a standard MIDI file.");
  const hlen = u32();
  u16(); // format (0 or 1); both are handled the same way
  const ntrk = u16();
  const div = u16(); // ticks per quarter note
  p += hlen - 6;
  if (div & 0x8000) throw new Error("This MIDI uses SMPTE timing, which is not supported yet.");

  let tsNum = 4, tsDen = 4;
  const tracks: Track[] = [];
  for (let t = 0; t < ntrk && p < d.byteLength - 8; t++) {
    const id = str(4), len = u32(), end = p + len;
    if (id !== "MTrk") { p = end; continue; }
    let tick = 0, status = 0, name = "";
    const open: Record<number, number[]> = {}; // channel*128+pitch -> start ticks of sounding notes
    const notes: Note[] = [];
    const chans = new Set<number>();
    // Variable-length quantity: 7 bits per byte, high bit set means "more bytes follow".
    const vlq = () => {
      let v = 0, b;
      do { b = d.getUint8(p++); v = (v << 7) | (b & 0x7f); } while (b & 0x80);
      return v;
    };
    while (p < end) {
      tick += vlq();
      const b = d.getUint8(p);
      // Running status: if the high bit is clear, this event reuses the previous status byte.
      if (b & 0x80) { status = b; p++; }
      if (status === 0xff) {
        // Meta event: type, length, data.
        const type = d.getUint8(p++), l = vlq();
        if (type === 0x03) { name = ""; for (let k = 0; k < l; k++) name += String.fromCharCode(d.getUint8(p + k)); }
        if (type === 0x58 && l >= 2) { tsNum = d.getUint8(p); tsDen = 2 ** d.getUint8(p + 1); }
        p += l;
      } else if (status === 0xf0 || status === 0xf7) {
        p += vlq(); // SysEx: skip
      } else {
        const hi = status & 0xf0, ch = status & 0x0f;
        const a = d.getUint8(p++);
        // Program change (0xC0) and channel pressure (0xD0) carry one data byte; the rest carry two.
        const two = hi !== 0xc0 && hi !== 0xd0;
        const v = two ? d.getUint8(p++) : 0;
        const key = ch * 128 + a;
        if (hi === 0x90 && v > 0) {
          (open[key] ||= []).push(tick);
          chans.add(ch);
        } else if (hi === 0x80 || (hi === 0x90 && v === 0)) {
          // Note off (or note on with velocity 0): pair with the oldest open note of that pitch.
          const st = open[key] && open[key].shift();
          if (st !== undefined) notes.push({ pitch: a, start: st / div, dur: Math.max(0.01, (tick - st) / div), ch });
        }
      }
    }
    p = end;
    if (notes.length) {
      tracks.push({
        name: name.trim() || `Track ${t + 1}`,
        notes: notes.sort((x, y) => x.start - y.start || y.pitch - x.pitch),
        drums: chans.has(9) && chans.size === 1,
      });
    }
  }
  return { tracks: tracks.filter((t) => !t.drums), beatsPerBar: tsNum * (4 / tsDen) };
}
