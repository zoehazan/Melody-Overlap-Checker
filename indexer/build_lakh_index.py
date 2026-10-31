"""Build the PRIVATE Lakh MIDI fingerprint index. Run in your own cloud environment (Codespaces).

    python3 indexer/build_lakh_index.py

Downloads (about 1.5 GB, into data/, which git ignores):
  lmd_matched.tar.gz   45,129 MIDI files    deleted again after a successful build
  match_scores.json    MIDI-to-MSD match confidences
  unique_tracks.txt    Million Song Dataset artist and title for every track

Writes, also into data/ (never commit or publish these):
  data/index/lakh-index.json.gz      fingerprints + title + artist, loaded by the web app (Phase 4)
  data/index/lakh-songs.tsv          one row per indexed song: which MIDI version was kept and why
  data/index/lakh-build-report.json  counts and sizes, no song data

MIDI files are read from the archive into memory; none is ever extracted to disk.
Takes roughly 30-60 minutes on a 2-core Codespace. Safe to rerun; downloads resume.
"""
from __future__ import annotations

import argparse
import gzip
import json
import multiprocessing as mp
import subprocess
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))

from sources.http import download  # noqa: E402
from sources.lakh import SongTable, fingerprint_file, midi_members, read_unique_tracks  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
LMD = "http://hog.ee.columbia.edu/craffel/lmd"
MSD_TRACKS = "http://millionsongdataset.com/sites/default/files/AdditionalFiles/unique_tracks.txt"
TARGET_MB = 40

CREDIT = ("Lakh MIDI Dataset v0.1 by Colin Raffel (https://colinraffel.com/projects/lmd/), CC BY 4.0. "
          "C. Raffel, \"Learning-Based Methods for Comparing Sequences, with Applications to "
          "Audio-to-MIDI Alignment and Matching\", PhD thesis, 2016. Titles and artists from the "
          "Million Song Dataset: T. Bertin-Mahieux, D. P. W. Ellis, B. Whitman and P. Lamere, "
          "\"The Million Song Dataset\", ISMIR 2011.")


def must_be_private(path: Path) -> None:
    """Refuse to write private data anywhere it could be committed or published (ground rule 3).

    Two checks, because there are two ways to leak: git (commit) and the web build (deploy).
    Being gitignored is not enough on its own: a file in web/public/ can be ignored by git and
    still be copied into the deployed site. So private files must also live under data/.
    """
    data = (ROOT / "data").resolve()
    if not path.resolve().is_relative_to(data):
        sys.exit(f"Refusing to write {path}: private files must go inside {data}.")
    r = subprocess.run(["git", "check-ignore", "-q", str(path)], cwd=ROOT, capture_output=True)
    if r.returncode != 0:
        sys.exit(f"Refusing to write {path}: git does not ignore it. Private index files must stay out of the repo.")


def build(archive: Path, scores_path: Path, tracks_path: Path, out_dir: Path, workers: int, log=print) -> dict:
    t0 = time.time()
    scores = json.loads(scores_path.read_text())
    with open(tracks_path, encoding="utf-8", errors="replace") as f:
        tracks = read_unique_tracks(f)
    table = SongTable(scores, tracks)
    log(f"{len(scores):,} MSD tracks -> {len(table.songs):,} songs; {len(table.assigned):,} MIDI files to fingerprint")

    seen: set[str] = set()

    def wanted_files():
        with open(archive, "rb") as f:
            for _track, md5, data in midi_members(f):
                if md5 in seen or not table.wanted(md5):
                    continue  # the same file sits in every matched track's folder; read it once
                seen.add(md5)
                yield md5, data

    done = failed = 0
    with mp.get_context("spawn").Pool(workers) as pool:
        for fp in pool.imap_unordered(fingerprint_file, wanted_files(), chunksize=8):
            done += 1
            if fp is None:
                failed += 1
            else:
                table.add(fp)
            if done % 2000 == 0:
                log(f"  {done:,} files fingerprinted ({failed:,} without a usable melody), {time.time() - t0:,.0f}s")

    songs = table.indexed()
    out_dir.mkdir(parents=True, exist_ok=True)
    index = {
        "version": 1,
        "kind": "melody-index",
        "name": "Lakh MIDI Dataset (LMD-matched)",
        "private": True,
        "notice": "PRIVATE: fingerprints of copyrighted songs, for personal use. Do not commit, upload or publish.",
        "credit": CREDIT,
        "built": time.strftime("%Y-%m-%d"),
        "melodies": [{"title": s.title, "artist": s.artist, "msd": s.track_id, "iv": s.best.iv, "rh": s.best.rh} for s in songs],
    }
    index_path = out_dir / "lakh-index.json.gz"
    with gzip.open(index_path, "wt", encoding="utf-8", compresslevel=9) as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))

    with open(out_dir / "lakh-songs.tsv", "w", encoding="utf-8") as f:
        f.write("msd_track_id\tartist\ttitle\tmidi_md5\tmelody_track_score\tmatch_score\tnotes\tversions_considered\n")
        for s in songs:
            clean = [x.replace("\t", " ").replace("\n", " ") for x in (s.artist, s.title)]
            f.write(f"{s.track_id}\t{clean[0]}\t{clean[1]}\t{s.best.md5}\t{s.best.track_score:.3f}\t{s.match_score:.3f}\t{s.best.notes}\t{s.versions}\n")

    mb = index_path.stat().st_size / 1e6
    report = {
        "built": index["built"],
        "msd_tracks": len(scores),
        "tracks_without_metadata": table.missing_metadata,
        "songs": len(table.songs),
        "midi_files_fingerprinted": done,
        "midi_files_without_usable_melody": failed,
        "songs_indexed": len(songs),
        "intervals_total": sum(len(s.best.iv) for s in songs),
        "index_mb_gzipped": round(mb, 1),
        "seconds": round(time.time() - t0),
    }
    (out_dir / "lakh-build-report.json").write_text(json.dumps(report, indent=1) + "\n")
    return report


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--workers", type=int, default=max(1, mp.cpu_count()), help="parallel processes (default: all cores)")
    ap.add_argument("--archive", type=Path, help="use this lmd_matched.tar.gz instead of downloading (deleted after a successful build)")
    ap.add_argument("--scores", type=Path, help="use this match_scores.json instead of downloading")
    ap.add_argument("--tracks", type=Path, help="use this unique_tracks.txt instead of downloading")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "index")
    args = ap.parse_args()

    must_be_private(args.out / "lakh-index.json.gz")
    cache, raw = ROOT / "data" / "cache" / "lakh", ROOT / "data" / "raw"
    scores = args.scores or cache / "match_scores.json"
    tracks = args.tracks or cache / "unique_tracks.txt"
    archive = args.archive or raw / "lmd_matched.tar.gz"
    for p in (cache, raw):
        must_be_private(p / "x")
    print("Downloading (resumes if interrupted)…")
    if not args.scores:
        download(f"{LMD}/match_scores.json", scores)
    if not args.tracks:
        download(MSD_TRACKS, tracks)
    if not args.archive:
        download(f"{LMD}/lmd_matched.tar.gz", archive)

    report = build(archive, scores, tracks, args.out, args.workers)

    archive.unlink()  # ground rule 2: raw MIDI is deleted once the index is built
    print(f"\nDeleted raw MIDI archive {archive}")
    print(json.dumps(report, indent=1))
    print(f"\nIndex: {args.out / 'lakh-index.json.gz'} ({report['index_mb_gzipped']} MB)")
    if report["index_mb_gzipped"] > TARGET_MB:
        print(f"WARNING: index is over the {TARGET_MB} MB target.")
    print("This file is private. Keep it out of the repo; load it in the app with \"Load reference index\" (Phase 4).")


if __name__ == "__main__":
    main()
