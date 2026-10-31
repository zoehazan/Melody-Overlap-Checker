"""The Lakh indexer, tested on a synthetic miniature of LMD-matched.

No real Lakh data is used: the "songs" are public domain seed melodies with made-up artists,
written as MIDI in memory and packed into a tar.gz with the same folder layout as the dataset.
"""
import gzip
import io
import json
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path

from melodyfp.fingerprint import encode, pack_iv, seq_from_text
from sources.lakh import SongTable, assign_files, fingerprint_file, midi_members, read_unique_tracks, song_key
from sources.seed import SEED_MELODIES

from .midi_writer import write_midi

ROOT = Path(__file__).resolve().parents[2]
TUNES = {title: notes for title, _, _, notes in SEED_MELODIES}


def notes_of(title):
    return [[n.pitch, n.start, n.dur] for n in seq_from_text(TUNES[title])]


def chords_of(title):
    """The tune harmonised in a chordal track, which scores lower as a melody."""
    return [[p + d, s, dur] for p, s, dur in notes_of(title) for d in (0, -4, -7)]


def tid(c):
    return "TR" + c * 16  # a valid-looking MSD track ID


# md5 -> MIDI file spec
FILES = {
    "a_chords": {"tracks": [{"name": "Piano", "notes": chords_of("Ode to Joy")}]},
    "a_melody": {"tracks": [{"name": "Piano", "notes": chords_of("Ode to Joy")},
                            {"name": "Melody", "notes": notes_of("Ode to Joy"), "channel": 1}]},
    "x_shared": {"tracks": [{"name": "Lead", "notes": notes_of("Greensleeves")}]},
    "d_drums": {"tracks": [{"name": "Drums", "notes": notes_of("Jingle Bells"), "channel": 9}]},
    "n_nometa": {"tracks": [{"name": "Lead", "notes": notes_of("Yankee Doodle")}]},
}
CORRUPT = b"MThd\x00\x00\x00\x06\x00\x01\x00\x01\x01\xe0MTrk\x00\x00\x00\xff\x00\x90"

SCORES = {
    tid("A"): {"a_chords": 0.9, "x_shared": 0.55},  # x_shared also matched here, weakly
    tid("B"): {"a_melody": 0.6},                     # same song as A, listed again as a remaster
    tid("C"): {"x_shared": 0.95, "bad": 0.8},
    tid("D"): {"d_drums": 0.7},
    tid("E"): {"n_nometa": 0.7},                     # no MSD metadata
}
TRACKS = [
    f"{tid('A')}<SEP>SO1<SEP>The Testers<SEP>Ode to Joy",
    f"{tid('B')}<SEP>SO2<SEP>The Testers<SEP>Ode To Joy (Remastered 2009)",
    f"{tid('C')}<SEP>SO3<SEP>Other Band<SEP>Green Sleeves",
    f"{tid('D')}<SEP>SO4<SEP>Drum Corps<SEP>Beat",
]


def make_archive(path: Path) -> None:
    """lmd_matched/<A>/<B>/<C>/<track id>/<md5>.mid, with each file copied into every matched track's folder."""
    blobs = {md5: write_midi(spec) for md5, spec in FILES.items()} | {"bad": CORRUPT}
    with tarfile.open(path, "w:gz") as tar:
        for track, files in SCORES.items():
            for md5 in files:
                info = tarfile.TarInfo(f"lmd_matched/{track[2]}/{track[3]}/{track[4]}/{track}/{md5}.mid")
                info.size = len(blobs[md5])
                tar.addfile(info, io.BytesIO(blobs[md5]))
        info = tarfile.TarInfo("lmd_matched/README.txt")
        info.size = 2
        tar.addfile(info, io.BytesIO(b"hi"))


class Metadata(unittest.TestCase):
    def test_song_key_groups_versions_of_a_song(self):
        self.assertEqual(song_key("The Testers", "Ode to Joy"), song_key("the testers", "Ode To Joy (Remastered 2009)"))
        self.assertEqual(song_key("Beyoncé", "Halo - Live at Wembley"), song_key("Beyonce", "Halo"))
        self.assertNotEqual(song_key("The Testers", "Ode to Joy"), song_key("The Testers", "Ode to Joy Part 2"))

    def test_each_midi_file_goes_to_its_best_match_only(self):
        a = assign_files(SCORES)
        self.assertEqual(a["x_shared"], (tid("C"), 0.95))
        self.assertEqual(a["a_chords"], (tid("A"), 0.9))

    def test_unique_tracks(self):
        self.assertEqual(read_unique_tracks(iter(TRACKS + ["junk line\n"]))[tid("C")], ("Other Band", "Green Sleeves"))


class Fingerprinting(unittest.TestCase):
    def test_same_as_the_web_app_pipeline(self):
        fp = fingerprint_file(("a_melody", write_midi(FILES["a_melody"])))
        self.assertEqual(fp.iv, pack_iv(encode(seq_from_text(TUNES["Ode to Joy"]))[0]))

    def test_unusable_files_give_none(self):
        self.assertIsNone(fingerprint_file(("bad", CORRUPT)))
        self.assertIsNone(fingerprint_file(("d", write_midi(FILES["d_drums"]))))  # drums only
        self.assertIsNone(fingerprint_file(("e", b"not a midi file")))

    def test_archive_is_read_without_extracting(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "lmd_matched.tar.gz"
            make_archive(path)
            with open(path, "rb") as f:
                members = [(t, m) for t, m, _ in midi_members(f)]
            self.assertEqual(sorted(p.name for p in Path(tmp).iterdir()), ["lmd_matched.tar.gz"])
        self.assertIn((tid("A"), "x_shared"), members)
        self.assertIn((tid("C"), "x_shared"), members)  # the same file, in both folders
        self.assertEqual(len(members), sum(len(v) for v in SCORES.values()))


class ChoosingVersions(unittest.TestCase):
    def test_best_melody_version_wins_over_best_audio_match(self):
        table = SongTable(SCORES, read_unique_tracks(iter(TRACKS)))
        for md5 in ("a_chords", "a_melody"):
            table.add(fingerprint_file((md5, write_midi(FILES[md5]))))
        song = table.songs[song_key("The Testers", "Ode to Joy")]
        self.assertEqual(song.best.md5, "a_melody")  # named melody track beats a 0.9 audio match on chords
        self.assertEqual(song.versions, 2)
        self.assertEqual(table.missing_metadata, 1)
        self.assertFalse(table.wanted("n_nometa"))


class EndToEnd(unittest.TestCase):
    """Runs the real command on the miniature dataset."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.out = ROOT / "data" / f"test-lakh-{id(self)}"  # must be inside the gitignored data/ folder
        self.archive = self.tmp / "lmd_matched.tar.gz"
        make_archive(self.archive)
        (self.tmp / "scores.json").write_text(json.dumps(SCORES))
        (self.tmp / "tracks.txt").write_text("\n".join(TRACKS) + "\n")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)
        shutil.rmtree(self.out, ignore_errors=True)

    def run_cli(self, out):
        return subprocess.run(
            [sys.executable, str(ROOT / "indexer" / "build_lakh_index.py"), "--workers", "2", "--archive", str(self.archive),
             "--scores", str(self.tmp / "scores.json"), "--tracks", str(self.tmp / "tracks.txt"), "--out", str(out)],
            capture_output=True, text=True, cwd=ROOT,
        )

    def test_builds_index_and_deletes_raw_midi(self):
        r = self.run_cli(self.out)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertFalse(self.archive.exists(), "raw MIDI archive should be deleted")

        index = json.loads(gzip.decompress((self.out / "lakh-index.json.gz").read_bytes()))
        self.assertTrue(index["private"])
        self.assertEqual([(m["artist"], m["title"]) for m in index["melodies"]],
                         [("Other Band", "Green Sleeves"), ("The Testers", "Ode to Joy")])
        for m in index["melodies"]:
            self.assertEqual(set(m), {"title", "artist", "msd", "iv", "rh"})  # fingerprints only, no notes
        report = json.loads((self.out / "lakh-build-report.json").read_text())
        self.assertEqual(report["songs_indexed"], 2)
        self.assertEqual(report["tracks_without_metadata"], 1)
        # x_shared sits in two folders but is read once; n_nometa is skipped (no title or artist).
        self.assertEqual(report["midi_files_fingerprinted"], 5)  # a_chords, a_melody, x_shared, bad, d_drums
        self.assertEqual(report["midi_files_without_usable_melody"], 2)  # bad, d_drums
        rows = (self.out / "lakh-songs.tsv").read_text().splitlines()
        self.assertEqual(rows[0].split("\t")[:4], ["msd_track_id", "artist", "title", "midi_md5"])
        self.assertIn("a_melody", rows[2])

    def test_refuses_to_write_where_it_could_be_committed_or_published(self):
        # web/public: lakh-index.json.gz is gitignored there, but the web build would deploy it.
        # indexer/: tracked by git. Both must be refused before anything is read or deleted.
        for place in (ROOT / "web" / "public", ROOT / "indexer"):
            with self.subTest(place=place):
                before = set(place.iterdir())
                r = self.run_cli(place)
                self.assertNotEqual(r.returncode, 0)
                self.assertIn("Refusing to write", r.stderr)
                self.assertEqual(set(place.iterdir()), before)
                self.assertTrue(self.archive.exists())


if __name__ == "__main__":
    unittest.main()
