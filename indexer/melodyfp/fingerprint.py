"""Fingerprint encoding. Line-for-line port of web/src/fingerprint.ts.

  iv: semitones from each note to the next (key-independent), folded into -12..12
  rh: round(log2(this gap / previous gap)), clamped to -3..3 (tempo-independent)

Also the compact text form used in the library files: one character per interval.
"""
from __future__ import annotations

import math
import re

from .jsmath import js_round
from .midi import Note


def encode(notes: list[Note]) -> tuple[list[int], list[int]]:
    iv: list[int] = []
    rh: list[int] = []
    for k in range(len(notes) - 1):
        d = notes[k + 1].pitch - notes[k].pitch
        while d > 12:
            d -= 12
        while d < -12:
            d += 12
        iv.append(d)
        ioi = max(1e-3, notes[k + 1].start - notes[k].start)
        if k == 0:
            rh.append(0)
        else:
            prev = max(1e-3, notes[k].start - notes[k - 1].start)
            rh.append(max(-3, min(3, js_round(math.log2(ioi / prev)))))
    return iv, rh


# ---------- Compact text form (must match decodeSeq in web/src/library.ts) ----------
# Intervals -12..12 become letters A..Y (M = repeated note); rhythm -3..3 becomes digits 0..6
# (3 = same gap). About 2 bytes per note instead of ~6 as JSON number arrays, and gzip-friendly.

def pack_iv(iv: list[int]) -> str:
    return "".join(chr(65 + d + 12) for d in iv)


def pack_rh(rh: list[int]) -> str:
    return "".join(chr(48 + r + 3) for r in rh)


def unpack_iv(s: str) -> list[int]:
    return [ord(c) - 65 - 12 for c in s]


def unpack_rh(s: str) -> list[int]:
    return [ord(c) - 48 - 3 for c in s]


# ---------- Note text: "C4 D4:0.5 F#4:2" = pitch name + octave, optional ":beats" (default 1) ----------

_NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
_NOTE = re.compile(r"^([A-G])([#b]?)(-?\d)$")


def pitch_of(s: str) -> int:
    m = _NOTE.match(s)
    if not m:
        raise ValueError(f"Not a note name: {s}")
    p = _NAMES[m[1]] + (1 if m[2] == "#" else -1 if m[2] == "b" else 0)
    return p + (int(m[3]) + 1) * 12


def seq_from_text(txt: str) -> list[Note]:
    """Notes played back to back, starting at beat 0."""
    t = 0.0
    notes: list[Note] = []
    for tok in txt.split():
        n, _, d = tok.partition(":")
        dur = float(d) if d else 1.0
        notes.append(Note(pitch_of(n), t, dur))
        t += dur
    return notes
