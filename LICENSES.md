# Licenses and credits

This file records the terms for every source of reference melodies that ships with the app.
Only works that are public domain in the US (published in 1930 or earlier, or traditional) are
included, and only as interval and rhythm fingerprints, never as playable notes or MIDI.

The private Lakh MIDI reference index (Phase 3) is not distributed and is not covered here.

## Built-in seed library (13 melodies, from the prototype)

Source: hand-entered simple versions of each tune's main melody, written for the prototype, not
copied from any modern edition or arrangement. Stored in `web/public/pd-library/seed.json` as
fingerprints only, generated from `indexer/sources/seed.py`.

| Melody | Credit | Basis for public domain status |
|---|---|---|
| Twinkle, Twinkle, Little Star | Traditional | French tune "Ah ! vous dirai-je, maman", published 1761 |
| Ode to Joy | Ludwig van Beethoven | Symphony No. 9, 1824 |
| Frère Jacques | Traditional | French round, 18th century |
| Mary Had a Little Lamb | Traditional | Words 1830; tune 19th-century American |
| Amazing Grace | Traditional | Tune "New Britain", published 1829–1835 |
| Jingle Bells | James Lord Pierpont | Published 1857 |
| Yankee Doodle | Traditional | 18th century |
| Brahms' Lullaby | Johannes Brahms | "Wiegenlied", Op. 49 No. 4, 1868 |
| Auld Lang Syne | Traditional | Scottish, published 1799 |
| Oh! Susanna | Stephen Foster | Published 1848 |
| When the Saints Go Marching In | Traditional | Spiritual, in print by 1896. Later arrangements can carry their own copyright; this is the plain traditional tune. |
| Greensleeves | Traditional | English, 16th century |
| Happy Birthday to You | Mildred J. Hill and Patty Hill | Melody from "Good Morning to All", 1893. A 2015 US federal court ruling (*Marya v. Warner/Chappell*) and the 2016 settlement confirmed that the song is public domain. |

## Mutopia Project: included

4,157 melodies from 1,806 pieces (build of 2026-10-31). 307 pieces were left out by the rules
below, and 5 had broken download links on the Mutopia site.

- **Site:** https://www.mutopiaproject.org (piece list from https://github.com/MutopiaProject/MutopiaProject)
- **Terms read:** https://www.mutopiaproject.org/legal.html, on 2026-10-30. Every piece is under
  a Public Domain dedication, CC BY (2.5, 3.0 or 4.0) or CC BY-SA (1.0 to 4.0), and "may be
  freely downloaded, printed, copied, distributed, modified, performed and recorded". CC BY
  requires credit to the original author (the typesetter). CC BY-SA additionally requires that
  adapted material is shared under the same license. robots.txt allows all crawling.
- **How we comply:**
  - Pieces are split by license into `mutopia-pd.json`, `mutopia-cc-by.json` and
    `mutopia-cc-by-sa.json`. The CC BY-SA file is shared under CC BY-SA 4.0 (the CC BY-SA
    licenses allow adaptations to use a later version).
  - Every Mutopia melody stores its typesetter, license and a link to the edition. The app shows
    them on each match and links to `web/public/pd-library/CREDITS.txt`, which lists all of them.
- **Composition must also be US public domain.** Mutopia's licenses cover the typeset edition,
  so `indexer/sources/mutopia.py` also checks the work itself:
  - a dated piece is included only if the latest year its date could mean is 1930 or earlier
    ("c. 1925" counts as possibly 1935 and is skipped)
  - an undated piece is included only if it is traditional, or its composer died by 1900
  - anything with an arranger is skipped, because an arrangement can carry its own copyright
- **Raw data:** MIDI is downloaded into memory, fingerprinted and discarded. It is never written
  to disk or committed.

## The Session: skipped

- **Site:** https://thesession.org (data dump: https://github.com/adactio/TheSession-data)
- **Terms read:** `LICENSE.md` in the data repository, on 2026-10-30. Alongside the ODbL, it
  contains a "Prohibition on LLM Use": the material may not be used, adapted or processed "in any
  way with Large Language Models", including "utilizing LLM tools", except for accessibility.
- **Why skipped:** this library was built with an AI coding assistant (Claude Code), which is an
  LLM tool, so using the data here would break the license. The tune data was not downloaded.
  Separately, many tunes on The Session are recent compositions with no composer or date field,
  so they could not be checked as public domain anyway.

## Essen Folksong Collection: skipped

- **Source:** https://github.com/ccarh/essen-folksong-collection (CCARH, Stanford, kern format)
- **Terms read:** `license.txt` and `README.txt` in that repository, on 2026-10-30. The files are
  "for personal use (single-user) only" and "only for the purpose of academic research", and
  CCARH claims copyright on its data files and compilations. music21's copy notes that "the legal
  status of the Essen folksong database is unclear" and that it has permission only for
  non-commercial use within music21. The EsAC site (esac-data.org) did not respond.
- **Why skipped:** publishing fingerprints of the collection in a public repository and demo is
  not allowed by those terms. Written permission from CCARH or the Schaffrath Laboratory would
  be needed.

## Nottingham Folk Music Database: skipped

- **Sources:** http://abc.sourceforge.net/NMD/ (James Allwright's ABC version of Eric Foxley's
  database), https://ifdo.ca/~seymour/nottingham/nottingham.html (Seymour Shlien's edited
  version), https://github.com/jukedeck/nottingham-dataset (a cleaned copy).
- **Terms read:** all three pages, on 2026-10-30. The original database pages give no license.
  The sourceforge page states that "the IPR associated with the original NMD format collection"
  of the Ashover tunes "reside with Mick Peat". The jukedeck copy is labelled GPLv3, but that
  label was added by a third party that republished the files, and it is not clear they had the
  right to license the underlying transcriptions.
- **Why skipped:** no terms from the people who made the collection clearly allow
  redistribution. Written permission from the maintainers would be needed.

## Third-party assets in the app

- Fonts: Bricolage Grotesque, Atkinson Hyperlegible and JetBrains Mono, loaded from Google Fonts
  under the SIL Open Font License 1.1.
