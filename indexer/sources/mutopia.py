"""Mutopia Project (https://www.mutopiaproject.org): free editions of public domain classical music.

Terms (https://www.mutopiaproject.org/legal.html, read 2026-10-30): every piece is under a Public
Domain dedication, CC BY or CC BY-SA, and "may be freely downloaded, printed, copied,
distributed, modified, performed and recorded". CC BY needs credit to the typesetter; CC BY-SA
also needs derived data shared under the same license. So pieces are grouped by license family
and each group goes into its own library file carrying that license.

Those licenses cover the typeset *edition*. The *composition* must also be US public domain,
which this module checks with `us_public_domain()` before downloading any MIDI.

How it works:
  1. one GitHub API call lists every piece folder in the MutopiaProject repository
  2. each piece's .rdf metadata file (title, composer, date, license, typesetter) is fetched
  3. pieces that pass the public domain rules have their MIDI downloaded *into memory*,
     fingerprinted and discarded; MIDI is never written to disk
Metadata and fingerprints are cached in data/cache/mutopia/ so a rerun only fetches what's new.
"""
from __future__ import annotations

import html
import io
import json
import posixpath
import re
import xml.etree.ElementTree as ET
import zipfile
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

from melodyfp.melody import pick_melody, skyline
from melodyfp.midi import parse_midi

from .http import fetch

SITE = "https://www.mutopiaproject.org"
TREE_URL = "https://api.github.com/repos/MutopiaProject/MutopiaProject/git/trees/master?recursive=1"
LEGAL_URL = f"{SITE}/legal.html"
NS = {"mp": "http://www.mutopiaproject.org/piece-data/0.1/"}

PD_CUTOFF = 1930  # US public domain: published in 1930 or earlier (as of 2026)
UNDATED_DEATH_CUTOFF = 1900  # undated pieces: composer must have died by this year
MIN_NOTES = 6  # same as the web app


# ---------- Public domain rules ----------

_YEAR = re.compile(r"(?<!\d)(1[0-9]{3}|20[0-9]{2})(s?)(?!\d)")
_CENTURY = re.compile(r"(\d{1,2})(?:st|nd|rd|th)\s+cent", re.I)
_CIRCA = re.compile(r"\b(c\.|ca\.?|circa|approx)", re.I)


def latest_year(date: str) -> int | None:
    """The latest year a free-text date like '1862', 'c. 1720', '1720s' or 'late 18th Century'
    could mean, or None when it names no year. Circa dates get 10 years of slack."""
    years = []
    for y, decade in _YEAR.findall(date):
        years.append(int(y) + (9 if decade else 0))
    for c in _CENTURY.findall(date):
        years.append(int(c) * 100)  # "18th century" ends in 1800
    if not years:
        return None
    return max(years) + (10 if _CIRCA.search(date) else 0)


def exact_year(date: str) -> int | None:
    """A year to display, only when the date is one plain year such as '1862'."""
    m = re.fullmatch(r"\s*(1[0-9]{3})\s*", date)
    return int(m[1]) if m else None


def us_public_domain(composer_code: str, date: str, arranger: str, death: int | None) -> tuple[bool, str]:
    """(include?, reason). Conservative: when in doubt, leave it out."""
    if arranger.strip():
        return False, "arrangement (may carry its own copyright)"
    latest = latest_year(date)
    if latest is not None:
        return (True, "dated") if latest <= PD_CUTOFF else (False, f"dated after {PD_CUTOFF}")
    if composer_code == "Traditional":
        return True, "traditional"
    if death is not None and death <= UNDATED_DEATH_CUTOFF:
        return True, f"undated, composer died by {UNDATED_DEATH_CUTOFF}"
    return False, "undated"


def license_family(licence: str) -> str | None:
    """Group Mutopia's license strings: 'pd', 'cc-by' or 'cc-by-sa'. None if unrecognised."""
    s = licence.lower()
    if "public domain" in s:
        return "pd"
    if "sharealike" in s or "share-alike" in s or "by-sa" in s:
        return "cc-by-sa"
    if "attribution" in s or "cc by" in s:
        return "cc-by"
    return None


def short_license(licence: str) -> str:
    """'Creative Commons Attribution-ShareAlike 3.0' -> 'CC BY-SA 3.0'."""
    fam = license_family(licence)
    if fam == "pd":
        return "Public Domain"
    ver = re.search(r"\d\.\d", licence)
    return {"cc-by": "CC BY", "cc-by-sa": "CC BY-SA"}.get(fam or "", licence) + (f" {ver[0]}" if ver else "")


# ---------- Listing pieces and composers ----------

def piece_folders(tree: dict) -> list[str]:
    """Piece folders (paths under ftp/) from the repository tree.

    A piece folder holds either <piece>.ly or a <piece>-lys/ folder of several .ly files.
    """
    pieces = set()
    for t in tree["tree"]:
        p = t["path"]
        if t["type"] != "blob" or not p.startswith("ftp/") or not p.endswith(".ly"):
            continue
        parts = p.split("/")
        lys = next((i for i, part in enumerate(parts) if part.endswith("-lys")), None)
        if lys is not None:
            pieces.add("/".join(parts[:lys]))
        elif posixpath.basename(posixpath.dirname(p)) == parts[-1][:-3]:
            pieces.add(posixpath.dirname(p))
    return sorted(pieces)


_COMPOSER_ROW = re.compile(r"Composer=([A-Za-z0-9_]+)'>(.*?)</a>")
_LIFE = re.compile(r"^(.*?)\s*\((\d{4})?\s*[–-]\s*(\d{4})?\)\s*$")


def parse_composers(page: str) -> dict[str, dict]:
    """Composer code -> {"name", "born", "died"} from the 'Browse by composer' page."""
    out = {}
    for code, label in _COMPOSER_ROW.findall(page):
        label = html.unescape(label).strip()
        m = _LIFE.match(label)
        if m:
            out[code] = {"name": m[1], "born": int(m[2]) if m[2] else None, "died": int(m[3]) if m[3] else None}
        else:
            out[code] = {"name": label, "born": None, "died": None}
    return out


@dataclass
class PieceMeta:
    folder: str  # ftp/<Composer>/<Opus>/<piece>
    title: str
    composer: str  # Mutopia composer code, e.g. BeethovenLv
    date: str
    arranger: str
    licence: str
    maintainer: str
    mid_file: str
    mutopia_id: str

    @property
    def url(self) -> str:
        return f"{SITE}/cgibin/piece-info.cgi?id={self.mutopia_id}" if self.mutopia_id else f"{SITE}/{self.folder}/"


def parse_rdf(folder: str, xml_text: str) -> PieceMeta:
    root = ET.fromstring(xml_text)
    desc = root.find("rdf:Description", {"rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#"})
    if desc is None:
        raise ValueError("no rdf:Description")

    def get(tag: str) -> str:
        e = desc.find(f"mp:{tag}", NS)
        return html.unescape((e.text or "").strip()) if e is not None else ""

    return PieceMeta(
        folder=folder, title=get("title"), composer=get("composer"), date=get("date"),
        arranger=get("arranger"), licence=get("licence"), maintainer=get("maintainer"),
        mid_file=get("midFile"), mutopia_id=get("id").rsplit("-", 1)[-1] if get("id") else "",
    )


# ---------- Fingerprinting ----------

def midi_files(name: str, data: bytes) -> list[tuple[str, bytes]]:
    """(name, bytes) for a .mid file, or for each .mid inside a -mids.zip of movements."""
    if not name.lower().endswith(".zip"):
        return [(name, data)]
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        return [(posixpath.basename(n), z.read(n)) for n in sorted(z.namelist()) if n.lower().endswith((".mid", ".midi"))]


def fingerprint_midi(data: bytes) -> list | None:
    """Skylined melody notes of the likeliest melody track, or None if there is no usable melody."""
    try:
        parsed = parse_midi(data)
        notes = skyline(parsed.tracks[pick_melody(parsed)].notes)
    except (ValueError, IndexError):
        return None
    return notes if len(notes) >= MIN_NOTES else None


# ---------- The whole source ----------

class Mutopia:
    id = "mutopia"

    def __init__(self, cache_dir: Path, workers: int = 4, limit: int | None = None, log=print):
        self.cache = cache_dir / "mutopia"
        self.cache.mkdir(parents=True, exist_ok=True)
        self.workers, self.limit, self.log = workers, limit, log
        self.skipped: dict[str, int] = {}

    def _cached(self, name: str, url: str) -> str:
        path = self.cache / name
        if path.exists():
            return path.read_text(encoding="utf-8")
        text = fetch(url).decode("utf-8", errors="replace")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return text

    def _skip(self, reason: str) -> None:
        self.skipped[reason] = self.skipped.get(reason, 0) + 1

    def _meta(self, folder: str) -> PieceMeta | None:
        piece = posixpath.basename(folder)
        try:
            rdf = self._cached(f"rdf/{folder}.rdf", f"{SITE}/{folder}/{piece}.rdf")
            return parse_rdf(folder, rdf)
        except Exception as e:  # noqa: BLE001 - one bad piece must not stop the build
            self.log(f"  skip {folder}: metadata unreadable ({e})")
            return None

    def _fingerprints(self, meta: PieceMeta) -> list[dict]:
        """One entry per MIDI file in the piece. Results are cached; MIDI is never saved."""
        from melodyfp.fingerprint import encode  # local import keeps module import light

        cache = self.cache / "fp" / f"{meta.folder}.json"
        if cache.exists():
            return json.loads(cache.read_text())
        data = fetch(f"{SITE}/{meta.folder}/{meta.mid_file}")
        out = []
        for name, mid in midi_files(meta.mid_file, data):
            notes = fingerprint_midi(mid)
            if notes is None:
                continue
            iv, rh = encode(notes)
            out.append({"file": name, "iv": iv, "rh": rh})
        del data  # the MIDI bytes are dropped here and never written anywhere
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(out))
        return out

    def entries(self) -> list[dict]:
        composers = parse_composers(self._cached("composers.html", f"{SITE}/browse.html"))
        tree = json.loads(self._cached("tree.json", TREE_URL))
        folders = piece_folders(tree)
        if self.limit:
            folders = folders[: self.limit]
        self.log(f"Mutopia: {len(folders)} pieces listed, reading metadata…")
        with ThreadPoolExecutor(self.workers) as pool:
            metas = [m for m in pool.map(self._meta, folders) if m]

        chosen = []
        for m in metas:
            c = composers.get(m.composer, {})
            ok, reason = us_public_domain(m.composer, m.date, m.arranger, c.get("died"))
            fam = license_family(m.licence)
            if not ok:
                self._skip(reason)
            elif fam is None:
                self._skip(f"unrecognised license: {m.licence}")
            elif not m.mid_file:
                self._skip("no MIDI file")
            else:
                chosen.append(m)
        self.log(f"Mutopia: {len(chosen)} of {len(metas)} pieces pass the public domain rules, fingerprinting…")

        def work(m: PieceMeta):
            try:
                return m, self._fingerprints(m)
            except Exception as e:  # noqa: BLE001
                self.log(f"  skip {m.folder}: {e}")
                return m, None

        entries = []
        with ThreadPoolExecutor(self.workers) as pool:
            for k, (m, fps) in enumerate(pool.map(work, chosen), 1):
                if k % 200 == 0:
                    self.log(f"  {k}/{len(chosen)}")
                if fps is None:
                    self._skip("download failed")
                    continue
                if not fps:
                    self._skip("no usable melody in MIDI")
                    continue
                c = composers.get(m.composer, {})
                # A zip can hold a full score plus separate parts that give the same melody; keep one.
                unique, seen = [], set()
                for fp in fps:
                    key = (tuple(fp["iv"]), tuple(fp["rh"]))
                    if key not in seen:
                        seen.add(key)
                        unique.append(fp)
                if len(unique) < len(fps):
                    self._skip("duplicate movement file (same melody as another file in the piece)")
                fps = unique
                for fp in fps:
                    title = m.title if len(fps) == 1 else f"{m.title} ({Path(fp['file']).stem})"
                    entries.append({
                        "title": title,
                        "composer": c.get("name") or m.composer,
                        "year": exact_year(m.date),
                        "source": f"mutopia-{license_family(m.licence)}",
                        "license": short_license(m.licence),
                        "typesetter": m.maintainer or "Mutopia Project contributor",
                        "url": m.url,
                        "iv": fp["iv"],
                        "rh": fp["rh"],
                    })
        return entries
