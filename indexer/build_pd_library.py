"""Build the public domain reference library that ships with the web app.

    python3 indexer/build_pd_library.py            # full build (about 30-60 minutes the first time)
    python3 indexer/build_pd_library.py --limit 50 # quick trial on the first 50 Mutopia pieces

Writes web/public/pd-library.json (manifest), web/public/pd-library/<source>.json (fingerprints)
and web/public/pd-library/CREDITS.txt. Downloads are cached in data/cache/ (gitignored), so a
rerun only fetches what's new. No MIDI file is ever written to disk.

Sources and why each was included or skipped: see LICENSES.md.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))

from melodyfp.fingerprint import pack_iv, pack_rh  # noqa: E402
from sources import seed  # noqa: E402
from sources.mutopia import LEGAL_URL, SITE, Mutopia  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MUTOPIA_NOTE = ("Melody fingerprints derived from Mutopia Project editions. Each melody lists its "
                "typesetter, license and a link to the edition.")

# One library file per source and license, so every file carries a single, clear license.
SOURCES = {
    "seed": {
        "name": "Well-known tunes",
        "publisher": None,
        "description": "13 well-known public domain melodies, hand-entered for the prototype.",
        "url": None,
        "license": "Public domain",
        "licenseUrl": None,
        "credit": None,
    },
    "mutopia-pd": {
        "publisher": "Mutopia Project",
        "name": "Mutopia, public domain editions",
        "description": "Free editions of public domain classical music, dedicated to the public domain by their typesetters.",
        "url": SITE,
        "license": "Public domain",
        "licenseUrl": LEGAL_URL,
        "credit": "Mutopia Project, mutopiaproject.org",
    },
    "mutopia-cc-by": {
        "publisher": "Mutopia Project",
        "name": "Mutopia, CC BY editions",
        "description": "Free editions of public domain classical music under Creative Commons Attribution (version listed per melody).",
        "url": SITE,
        "license": "CC BY",
        "licenseUrl": LEGAL_URL,
        "credit": "Mutopia Project, mutopiaproject.org. " + MUTOPIA_NOTE,
    },
    "mutopia-cc-by-sa": {
        "publisher": "Mutopia Project",
        "name": "Mutopia, CC BY-SA editions",
        "description": "Free editions of public domain classical music under Creative Commons Attribution-ShareAlike (version listed per melody). This file is shared under CC BY-SA 4.0.",
        "url": SITE,
        "license": "CC BY-SA 4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
        "credit": "Mutopia Project, mutopiaproject.org. " + MUTOPIA_NOTE,
    },
}


def compact(entry: dict) -> dict:
    """Library file form: packed fingerprint strings, no empty fields, no per-entry source."""
    out = {k: v for k, v in entry.items() if k not in ("iv", "rh", "source") and v is not None}
    out["iv"] = pack_iv(entry["iv"])
    out["rh"] = pack_rh(entry["rh"])
    return out


def write_library(entries: list[dict], out_dir: Path) -> dict:
    lib_dir = out_dir / "pd-library"
    lib_dir.mkdir(parents=True, exist_ok=True)
    for old in list(lib_dir.glob("*.json")) + [lib_dir / "CREDITS.txt"]:
        old.unlink(missing_ok=True)

    sources = []
    for sid, info in SOURCES.items():
        group = [e for e in entries if e["source"] == sid]
        if not group:
            continue
        if sid != "seed":
            group.sort(key=lambda e: (e["composer"].lower(), e["title"].lower()))
        doc = {"source": sid, "license": info["license"], "licenseUrl": info["licenseUrl"], "credit": info["credit"],
               "melodies": [compact(e) for e in group]}
        (lib_dir / f"{sid}.json").write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        sources.append({"id": sid, **info, "file": f"pd-library/{sid}.json", "count": len(group)})

    manifest = {
        "version": 2,
        "description": "Public domain reference melodies, stored as interval and rhythm fingerprints only. "
                       "Each source file carries its own license; see credits for attribution.",
        "total": sum(s["count"] for s in sources),
        "credits": "pd-library/CREDITS.txt",
        "sources": sources,
    }
    (out_dir / "pd-library.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    write_credits(entries, lib_dir / "CREDITS.txt")
    return manifest


def write_credits(entries: list[dict], path: Path) -> None:
    lines = [
        "Credits for the public domain reference library",
        "",
        "The library stores melody fingerprints (intervals and rhythm ratios), not scores or audio.",
        "Melodies from the Mutopia Project (https://www.mutopiaproject.org) are derived from the",
        "editions below, credited to their typesetters under each edition's license.",
        "Melodies from CC BY-SA editions are shared under CC BY-SA 4.0",
        "(https://creativecommons.org/licenses/by-sa/4.0/).",
        "",
    ]
    for e in sorted((e for e in entries if e["source"] != "seed"), key=lambda e: (e["composer"].lower(), e["title"].lower())):
        year = f", {e['year']}" if e.get("year") else ""
        lines.append(f"{e['title']} ({e['composer']}{year}). Typeset by {e['typesetter']}. {e['license']}. {e['url']}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limit", type=int, help="only the first N Mutopia pieces (for a quick trial)")
    ap.add_argument("--workers", type=int, default=4, help="parallel downloads (default 4; please keep it small)")
    ap.add_argument("--cache-dir", type=Path, default=ROOT / "data" / "cache")
    ap.add_argument("--out", type=Path, default=ROOT / "web" / "public")
    args = ap.parse_args()

    t0 = time.time()
    entries = seed.entries()
    print(f"Seed: {len(entries)} melodies")
    mutopia = Mutopia(args.cache_dir, workers=args.workers, limit=args.limit)
    entries += mutopia.entries()
    print("Mutopia pieces skipped, by reason:")
    for reason, n in sorted(mutopia.skipped.items(), key=lambda kv: -kv[1]):
        print(f"  {n:5d}  {reason}")

    manifest = write_library(entries, args.out)
    size = sum(f.stat().st_size for f in (args.out / "pd-library").glob("*.json"))
    print(f"\nWrote {manifest['total']} melodies from {len(manifest['sources'])} sources "
          f"({size / 1e6:.1f} MB) to {args.out / 'pd-library.json'} in {time.time() - t0:.0f}s")
    for s in manifest["sources"]:
        print(f"  {s['count']:6d}  {s['name']}")


if __name__ == "__main__":
    main()
