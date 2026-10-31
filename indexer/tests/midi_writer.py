"""Test helper: builds Standard MIDI File bytes in memory. Port of web/test/midi-writer.ts.

It must produce byte-identical files to the TypeScript writer; the parity fixture stores a
SHA-256 of each file to prove that it does.
"""
from __future__ import annotations

import math

from melodyfp.jsmath import js_round


def _vlq(n: int) -> list[int]:
    out = [n & 0x7F]
    n >>= 7
    while n:
        out.insert(0, (n & 0x7F) | 0x80)
        n >>= 7
    return out


def _u32(n: int) -> list[int]:
    return [(n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255]


def _u16(n: int) -> list[int]:
    return [(n >> 8) & 255, n & 255]


def _ascii(s: str) -> list[int]:
    return [ord(c) for c in s]


def _track_bytes(t: dict, ppq: int, meta: list[list[int]]) -> list[int]:
    ch = t.get("channel") or 0
    evs = [(0, -2, i, m) for i, m in enumerate(meta)]  # (tick, order, insertion index, bytes)
    seq = len(evs)

    def add(tick: int, order: int, b: list[int]) -> None:
        nonlocal seq
        evs.append((tick, order, seq, b))
        seq += 1

    if t.get("name") is not None:
        add(0, -2, [0xFF, 0x03, *_vlq(len(t["name"])), *_ascii(t["name"])])
    if t.get("programChange") is not None:
        add(0, -1, [0xC0 | ch, t["programChange"]])
    for pitch, start, dur in t["notes"]:
        on, off = js_round(start * ppq), js_round((start + dur) * ppq)
        add(on, 1, [0x90 | ch, pitch, 100])
        add(off, 0, [0x90 | ch, pitch, 0] if t.get("zeroVelocityOff") else [0x80 | ch, pitch, 64])
    evs.sort(key=lambda e: (e[0], e[1], e[2]))  # stable, like Array.prototype.sort
    out: list[int] = []
    last, status = 0, -1
    for tick, _, _, b in evs:
        out += _vlq(tick - last)
        last = tick
        is_channel = b[0] < 0xF0
        out += b[1:] if t.get("runningStatus") and is_channel and b[0] == status else b
        status = b[0] if is_channel else -1
    out += [0, 0xFF, 0x2F, 0x00]
    return [*_ascii("MTrk"), *_u32(len(out)), *out]


def write_midi(spec: dict) -> bytes:
    ppq = spec.get("ppq") or 480
    tracks = spec["tracks"]
    fmt = spec.get("format", 1 if len(tracks) > 1 else 0)
    meta: list[list[int]] = []
    if spec.get("timeSig"):
        num, den = spec["timeSig"]
        meta.append([0xFF, 0x58, 4, num, int(math.log2(den)), 24, 8])
    if spec.get("tempo"):
        tp = spec["tempo"]
        meta.append([0xFF, 0x51, 3, (tp >> 16) & 255, (tp >> 8) & 255, tp & 255])
    out = [*_ascii("MThd"), *_u32(6), *_u16(fmt), *_u16(len(tracks)), *_u16(ppq)]
    for i, t in enumerate(tracks):
        out += _track_bytes(t, ppq, meta if i == 0 else [])
    return bytes(out)
