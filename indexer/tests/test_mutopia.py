"""The rules that decide which Mutopia pieces are US public domain and how they are credited."""
import unittest

from sources.mutopia import (exact_year, latest_year, license_family, parse_composers, parse_rdf,
                             piece_folders, short_license, us_public_domain)


class Dates(unittest.TestCase):
    def test_latest_year(self):
        cases = {
            "1862": 1862, "c. 1720": 1730, "ca 1925": 1935, "1720s": 1729, "1810-1815": 1815,
            "late 18th Century": 1800, "19th century": 1900, "Op. 10, 1798": 1798,
            "": None, "unknown": None, "Baroque": None,
        }
        for text, expected in cases.items():
            with self.subTest(text=text):
                self.assertEqual(latest_year(text), expected)

    def test_exact_year_only_for_a_plain_year(self):
        self.assertEqual(exact_year("1862"), 1862)
        self.assertIsNone(exact_year("c. 1720"))
        self.assertIsNone(exact_year("1810-1815"))


class PublicDomainRules(unittest.TestCase):
    def test_dated_pieces(self):
        self.assertEqual(us_public_domain("BeethovenLv", "1798", "", 1827)[0], True)
        self.assertEqual(us_public_domain("SomeoneX", "1930", "", None)[0], True)
        self.assertEqual(us_public_domain("SomeoneX", "1931", "", None)[0], False)
        self.assertEqual(us_public_domain("SomeoneX", "c. 1925", "", None)[0], False)  # could be 1935

    def test_arrangements_are_skipped(self):
        self.assertEqual(us_public_domain("Traditional", "1800", "A. Arranger", None)[0], False)

    def test_undated_pieces(self):
        self.assertEqual(us_public_domain("Traditional", "", "", None)[0], True)
        self.assertEqual(us_public_domain("BachJS", "", "", 1750)[0], True)
        self.assertEqual(us_public_domain("ElgarE", "", "", 1934)[0], False)  # might be published after 1930
        self.assertEqual(us_public_domain("Anonymous", "", "", None)[0], False)
        self.assertEqual(us_public_domain("ZanoniM", "", "", None)[0], False)  # living composer

    def test_traditional_with_a_modern_date_is_skipped(self):
        self.assertEqual(us_public_domain("Traditional", "2004", "", None)[0], False)


class Licenses(unittest.TestCase):
    def test_families(self):
        self.assertEqual(license_family("Public Domain"), "pd")
        self.assertEqual(license_family("Creative Commons Attribution 4.0"), "cc-by")
        self.assertEqual(license_family("Creative Commons Attribution-ShareAlike 3.0"), "cc-by-sa")
        self.assertIsNone(license_family("All rights reserved"))

    def test_short_names(self):
        self.assertEqual(short_license("Creative Commons Attribution-ShareAlike 3.0"), "CC BY-SA 3.0")
        self.assertEqual(short_license("Creative Commons Attribution 2.5"), "CC BY 2.5")
        self.assertEqual(short_license("Public Domain"), "Public Domain")


class Listing(unittest.TestCase):
    def test_piece_folders(self):
        tree = {"tree": [
            {"type": "blob", "path": "ftp/BeethovenLv/O10/LVB_1/LVB_1.ly"},
            {"type": "blob", "path": "ftp/AmendolaA/Ernando/Ernando-lys/1-Rec/BC.ly"},
            {"type": "blob", "path": "ftp/AmendolaA/Ernando/Ernando-lys/2-Aria/BC.ly"},
            {"type": "blob", "path": "ftp/X/Y/include.ly"},  # a helper file, not a piece
            {"type": "tree", "path": "ftp/BeethovenLv"},
        ]}
        self.assertEqual(piece_folders(tree), ["ftp/AmendolaA/Ernando", "ftp/BeethovenLv/O10/LVB_1"])

    def test_composers(self):
        page = ("<a href='make-table.cgi?Composer=AbtF'>F. Abt (1819&ndash;1885)</a> [2]<br />"
                "<a href='make-table.cgi?Composer=ZanoniM'>M. Zanoni (1964&ndash;)</a> [1]<br />"
                "<a href='make-table.cgi?Composer=Traditional'>Traditional</a> [125]<br />")
        self.assertEqual(parse_composers(page), {
            "AbtF": {"name": "F. Abt", "born": 1819, "died": 1885},
            "ZanoniM": {"name": "M. Zanoni", "born": 1964, "died": None},
            "Traditional": {"name": "Traditional", "born": None, "died": None},
        })

    def test_rdf(self):
        rdf = """<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:mp="http://www.mutopiaproject.org/piece-data/0.1/">
<rdf:Description rdf:about=".">
  <mp:title>Sonata No. 5</mp:title><mp:composer>BeethovenLv</mp:composer><mp:date>late 18th Century</mp:date>
  <mp:arranger/><mp:source>Breitkopf &amp;amp; Hartel</mp:source><mp:licence>Public Domain</mp:licence>
  <mp:midFile>LVB_1.mid</mp:midFile><mp:id>Mutopia-2006/06/12-778</mp:id><mp:maintainer>Stelios Samelis</mp:maintainer>
</rdf:Description></rdf:RDF>"""
        m = parse_rdf("ftp/BeethovenLv/O10/LVB_1", rdf)
        self.assertEqual((m.title, m.composer, m.date, m.arranger, m.licence, m.mid_file, m.maintainer),
                         ("Sonata No. 5", "BeethovenLv", "late 18th Century", "", "Public Domain", "LVB_1.mid", "Stelios Samelis"))
        self.assertEqual(m.url, "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=778")


if __name__ == "__main__":
    unittest.main()
