"""MIDI parsing: Standard MIDI File bytes -> tracks of notes measured in beats.

Line-for-line port of web/src/midi.ts. See the comments there for how the format works.
Tempo events are ignored on purpose: timings stay in beats, so tempo never affects matching.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .jsmath import js_trim


@dataclass
class Note:
    pitch: int  # MIDI note number, 60 = middle C
    start: float  # onset in beats from the start of the file
    dur: float  # length in beats
    ch: int | None = None  # MIDI channel 0-15, when the note came from a file


@dataclass
class Track:
    name: str
    notes: list[Note]  # sorted by start, then highest pitch first
    drums: bool  # every note on channel 10 (index 9), the General MIDI drum channel


@dataclass
class ParsedMidi:
    tracks: list[Track] = field(default_factory=list)  # non-drum tracks with at least one note
    beats_per_bar: float = 4


class MidiError(ValueError):
    pass


def parse_midi(buf: bytes) -> ParsedMidi:
    d = buf
    p = 0

    def u8(i: int) -> int:
        if i >= len(d):
            raise MidiError("This file seems to be damaged or cut off.")
        return d[i]

    def read_str(n: int) -> str:
        nonlocal p
        s = "".join(chr(u8(p + k)) for k in range(n))
        p += n
        return s

    def u32() -> int:
        nonlocal p
        v = (u8(p) << 24) | (u8(p + 1) << 16) | (u8(p + 2) << 8) | u8(p + 3)
        p += 4
        return v

    def u16() -> int:
        nonlocal p
        v = (u8(p) << 8) | u8(p + 1)
        p += 2
        return v

    if read_str(4) != "MThd":
        raise MidiError("This file is not a standard MIDI file.")
    hlen = u32()
    u16()  # format (0 or 1); both are handled the same way
    ntrk = u16()
    div = u16()  # ticks per quarter note
    p += hlen - 6
    if div & 0x8000:
        raise MidiError("This MIDI uses SMPTE timing, which is not supported yet.")

    ts_num, ts_den = 4, 4
    tracks: list[Track] = []
    t = 0
    while t < ntrk and p < len(d) - 8:
        chunk_id, length = read_str(4), u32()
        end = p + length
        if chunk_id != "MTrk":
            p = end
            t += 1
            continue
        tick, status, name = 0, 0, ""
        open_notes: dict[int, list[int]] = {}  # channel*128+pitch -> start ticks of sounding notes
        notes: list[Note] = []
        chans: set[int] = set()

        def vlq() -> int:
            nonlocal p
            v = 0
            while True:
                b = u8(p)
                p += 1
                v = (v << 7) | (b & 0x7F)
                if not b & 0x80:
                    return v

        while p < end:
            tick += vlq()
            b = u8(p)
            if b & 0x80:  # otherwise running status: reuse the previous status byte
                status = b
                p += 1
            if status == 0xFF:  # meta event: type, length, data
                mtype = u8(p)
                p += 1
                ln = vlq()
                if mtype == 0x03:
                    name = "".join(chr(u8(p + k)) for k in range(ln))
                if mtype == 0x58 and ln >= 2:
                    ts_num, ts_den = u8(p), 2 ** u8(p + 1)
                p += ln
            elif status in (0xF0, 0xF7):  # SysEx: skip
                p += vlq()
            else:
                hi, ch = status & 0xF0, status & 0x0F
                a = u8(p)
                p += 1
                two = hi not in (0xC0, 0xD0)  # program change and channel pressure have one data byte
                v = 0
                if two:
                    v = u8(p)
                    p += 1
                key = ch * 128 + a
                if hi == 0x90 and v > 0:
                    open_notes.setdefault(key, []).append(tick)
                    chans.add(ch)
                elif hi == 0x80 or (hi == 0x90 and v == 0):
                    pending = open_notes.get(key)
                    if pending:
                        st = pending.pop(0)
                        notes.append(Note(a, st / div, max(0.01, (tick - st) / div), ch))
        p = end
        if notes:
            tracks.append(Track(
                name=js_trim(name) or f"Track {t + 1}",
                notes=sorted(notes, key=lambda n: (n.start, -n.pitch)),
                drums=9 in chans and len(chans) == 1,
            ))
        t += 1
    return ParsedMidi([tr for tr in tracks if not tr.drums], ts_num * (4 / ts_den))
