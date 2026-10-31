"""Lakh MIDI Dataset (LMD-matched) -> private melody fingerprint index.

Dataset: https://colinraffel.com/projects/lmd/ (CC BY 4.0 for the compilation; the songs
themselves are copyrighted, so the index is private and never committed or published).

What LMD-matched looks like:
  lmd_matched.tar.gz   lmd_matched/R/R/U/TRRRUFD12903CD7092/<md5>.mid
                       one folder per Million Song Dataset (MSD) track; the same MIDI file
                       (same md5) appears in the folder of every track it was matched to
  match_scores.json    {msd_track_id: {md5: match confidence}}
  unique_tracks.txt    MSD metadata: track_id<SEP>song_id<SEP>artist<SEP>title

Matches go both ways: a track can have several MIDI versions, and one MIDI file can be matched
to several tracks (often wrongly, e.g. one house track to dozens of remixes). So:
  1. each MIDI file is assigned to the single track it matches best
  2. tracks are grouped into songs by normalised artist + title (MSD lists many songs more
     than once: album, compilation, remaster…)
  3. per song, the MIDI version whose melody track scores highest (the web app's own
     track_score) is kept; match confidence breaks ties
"""
from __future__ import annotations

import re
import tarfile
import unicodedata
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import IO, Iterator

from melodyfp.fingerprint import encode, pack_iv, pack_rh
from melodyfp.melody import pick_melody, skyline, track_score
from melodyfp.midi import parse_midi

MIN_NOTES = 6  # same as the web app

_TRACK_ID = re.compile(r"^TR[A-Z0-9]{16}$")


# ---------- Metadata ----------

def read_unique_tracks(lines: Iterator[str]) -> dict[str, tuple[str, str]]:
    """MSD unique_tracks.txt -> {track_id: (artist, title)}."""
    out = {}
    for line in lines:
        parts = line.rstrip("\n").split("<SEP>")
        if len(parts) == 4:
            out[parts[0]] = (parts[2], parts[3])
    return out


def song_key(artist: str, title: str) -> str:
    """Normalise so "Yesterday (Remastered 2009)" and "yesterday" by the same artist group together."""
    def norm(s: str) -> str:
        s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().casefold()
        s = re.sub(r"[(\[].*?[)\]]", " ", s)  # drop bracketed version notes
        s = re.sub(r"\s+-\s+.*$", " ", s)  # and " - Live at …" suffixes
        return " ".join(re.sub(r"[^a-z0-9]+", " ", s).split())
    return f"{norm(artist)}|{norm(title)}"


def assign_files(scores: dict[str, dict[str, float]]) -> dict[str, tuple[str, float]]:
    """{md5: (track_id, match score)}, giving each MIDI file only to the track it matches best."""
    best: dict[str, tuple[str, float]] = {}
    for track, files in sorted(scores.items()):
        for md5, s in files.items():
            if md5 not in best or s > best[md5][1]:
                best[md5] = (track, s)
    return best


# ---------- Fingerprinting one MIDI file ----------

@dataclass
class Fingerprinted:
    md5: str
    track_score: float  # how melody-like the chosen track is (web app's scoring)
    notes: int
    iv: str  # packed, as in the public domain library
    rh: str


def fingerprint_file(item: tuple[str, bytes]) -> Fingerprinted | None:
    """Parse, pick the melody track, skyline, encode. None for corrupt or melody-less files.

    Runs in worker processes, so it takes and returns plain picklable values.
    """
    md5, data = item
    try:
        parsed = parse_midi(data)
        idx = pick_melody(parsed)
        notes = skyline(parsed.tracks[idx].notes)
        score = track_score(parsed.tracks[idx])
    except (ValueError, IndexError, ZeroDivisionError, RecursionError):
        return None
    if len(notes) < MIN_NOTES:
        return None
    iv, rh = encode(notes)
    return Fingerprinted(md5, score, len(notes), pack_iv(iv), pack_rh(rh))


def midi_members(archive: IO[bytes]) -> Iterator[tuple[str, str, bytes]]:
    """(track_id, md5, bytes) for each MIDI file in an LMD tar.gz, read straight from the archive.

    Files are never extracted to disk. Streaming mode ("r|gz") reads the archive front to back once.
    """
    with tarfile.open(fileobj=archive, mode="r|gz") as tar:
        for m in tar:
            if not m.isfile() or not m.name.lower().endswith((".mid", ".midi")):
                continue
            p = PurePosixPath(m.name)
            if not _TRACK_ID.match(p.parent.name):
                continue
            f = tar.extractfile(m)
            if f is not None:
                yield p.parent.name, p.stem, f.read()


# ---------- Choosing one version per song ----------

@dataclass
class Song:
    key: str
    artist: str
    title: str
    track_id: str
    best: Fingerprinted | None = None
    match_score: float = 0.0
    versions: int = 0  # MIDI versions considered

    def offer(self, fp: Fingerprinted, match_score: float, track_id: str) -> None:
        """Keep fp if it beats the current best: higher melody score, then higher match confidence."""
        self.versions += 1
        rank = (fp.track_score, match_score, fp.md5)
        if self.best is None or rank > (self.best.track_score, self.match_score, self.best.md5):
            self.best, self.match_score, self.track_id = fp, match_score, track_id


class SongTable:
    """Maps MIDI files to songs and keeps the best version of each song as files stream in."""

    def __init__(self, scores: dict[str, dict[str, float]], tracks: dict[str, tuple[str, str]]):
        self.assigned = assign_files(scores)
        self.songs: dict[str, Song] = {}
        self.song_of_track: dict[str, str] = {}
        self.missing_metadata = 0
        for track in sorted(scores):
            meta = tracks.get(track)
            if meta is None or not meta[1].strip():
                self.missing_metadata += 1
                continue
            key = song_key(*meta)
            self.song_of_track[track] = key
            self.songs.setdefault(key, Song(key, meta[0], meta[1], track))

    def wanted(self, md5: str) -> bool:
        a = self.assigned.get(md5)
        return a is not None and a[0] in self.song_of_track

    def add(self, fp: Fingerprinted) -> None:
        track, match = self.assigned[fp.md5]
        self.songs[self.song_of_track[track]].offer(fp, match, track)

    def indexed(self) -> list[Song]:
        return sorted((s for s in self.songs.values() if s.best), key=lambda s: (s.artist.casefold(), s.title.casefold()))
