"""The library file format written by build_pd_library.py."""
import json
import tempfile
import unittest
from pathlib import Path

import build_pd_library as build


class LibraryFiles(unittest.TestCase):
    def test_compact_packs_fingerprints_and_drops_empty_fields(self):
        e = {"title": "T", "composer": "Traditional", "year": None, "source": "seed", "iv": [0, 2, -12], "rh": [0, 1, -3]}
        self.assertEqual(build.compact(e), {"title": "T", "composer": "Traditional", "iv": "MOA", "rh": "340"})

    def test_one_file_per_source_and_a_manifest(self):
        entries = [
            {"title": "A", "composer": "Traditional", "year": None, "source": "seed", "iv": [2, 2, 1, 2, 2], "rh": [0] * 5},
            {"title": "B", "composer": "J. S. Bach", "year": 1722, "source": "mutopia-cc-by", "license": "CC BY 4.0",
             "typesetter": "Someone", "url": "https://www.mutopiaproject.org/x", "iv": [5] * 5, "rh": [0] * 5},
        ]
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            manifest = build.write_library(entries, out)
            self.assertEqual(manifest["total"], 2)
            self.assertEqual([s["id"] for s in manifest["sources"]], ["seed", "mutopia-cc-by"])
            on_disk = json.loads((out / "pd-library.json").read_text())
            self.assertEqual(on_disk, manifest)
            by = json.loads((out / "pd-library" / "mutopia-cc-by.json").read_text())
            self.assertEqual(by["melodies"][0]["typesetter"], "Someone")
            self.assertIn("Typeset by Someone. CC BY 4.0.", (out / "pd-library" / "CREDITS.txt").read_text())


if __name__ == "__main__":
    unittest.main()
