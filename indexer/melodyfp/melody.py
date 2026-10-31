"""Melody extraction: choose the likeliest melody track, then reduce it to one note at a time.

Line-for-line port of web/src/melody.ts. Both sides must pick tracks the same way, or a
reference song would be fingerprinted from a different part than the app would choose.
"""
from __future__ import annotations

import re
from dataclasses import replace

from .midi import Note, ParsedMidi, Track

CHORD_WINDOW = 0.06  # notes starting within this many beats of each other count as one chord

_MELODY_NAME = re.compile(r"melod|vocal|vox|lead|voice|sing|tune")
_ACCOMP_NAME = re.compile(r"bass|drum|perc|pad|chord|string")


def skyline(notes: list[Note]) -> list[Note]:
    """Keep the top note at each onset and trim overlaps, so chords reduce to a single line."""
    out: list[Note] = []
    for n in notes:
        if out and abs(n.start - out[-1].start) < CHORD_WINDOW:
            if n.pitch > out[-1].pitch:
                out[-1] = replace(n)
            continue
        out.append(replace(n))
    for k in range(len(out) - 1):
        out[k].dur = min(out[k].dur, out[k + 1].start - out[k].start)
    return out


def track_score(t: Track) -> float:
    """Higher is more melody-like."""
    nm = t.name.lower()
    s = 3 if _MELODY_NAME.search(nm) else 0
    if _ACCOMP_NAME.search(nm):
        s -= 2
    sky = skyline(t.notes)
    s += (len(sky) / len(t.notes)) * 2
    mean = sum(n.pitch for n in sky) / len(sky)
    if 57 <= mean <= 84:
        s += 1.5
    if len(sky) < 12:
        s -= 3
    return s


def pick_melody(parsed: ParsedMidi) -> int:
    """Index of the best-scoring track. The first one wins ties."""
    if not parsed.tracks:
        raise ValueError("No notes found in this file.")
    best, bs = 0, -1e9
    for i, t in enumerate(parsed.tracks):
        s = track_score(t)
        if s > bs:
            best, bs = i, s
    return best
