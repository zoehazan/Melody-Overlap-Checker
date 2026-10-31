# Learning notes

Plain-language notes on what was built in each phase, why, and the tradeoffs, written so you can
explain every part in an interview. Each phase ends with a few small changes to try yourself.

---

## Phase 1: Project setup

### What was built

The single-file prototype became a Vite + TypeScript project in `web/`, with the same behaviour,
the same results and the same look. The code is split into modules that follow the path a melody
takes through the app:

```
 .mid file
    │  midi.ts         bytes → tracks of notes (pitch, start beat, length in beats)
    ▼
 tracks
    │  melody.ts       pick the likeliest melody track, keep the top note at each moment
    ▼
 one melodic line
    │  fingerprint.ts  notes → intervals (key-free) + rhythm ratios (tempo-free)
    ▼
 fingerprint ───────────────┐
    │  search.ts             │  library.ts: pd-library.json + files added in the tab
    │  align.ts              ◄┘  (fingerprints only)
    ▼  Smith-Waterman per song, then classify into 3 levels
 hits
    │  ui/panels.ts, ui/roll.ts
    ▼
 summary pills, piano rolls, result cards
```

`main.ts` holds the app state and connects the file inputs to this pipeline.

### The modules, one by one

**`midi.ts`: reading MIDI.** A MIDI file is a header plus tracks. Each track is a list of
events ("note 64 on", "note 64 off", "track name is Vocals"), each preceded by how many *ticks*
have passed since the previous event. The parser walks the bytes, keeps a running tick count, and
pairs every note-on with its note-off to get a note. Ticks are divided by the file's
ticks-per-quarter-note, so everything is measured in **beats**. Three details worth knowing:
- *Variable-length quantities:* delta times use 7 bits per byte, with the top bit meaning "more
  bytes follow". Small numbers take one byte; large ones take more.
- *Running status:* to save space, a file can leave out the status byte when it repeats
  ("note on, channel 1" again). If the next byte's top bit is clear, it is data, and the previous
  status applies.
- *Tempo is ignored on purpose.* Working in beats means a song at 90 BPM and the same song at
  120 BPM produce the same notes.

**`melody.ts`: finding the tune.** A full arrangement has chords, bass and drums. Two heuristics:
1. *Track scoring:* names like "vocal" or "lead" score up, "bass" or "pad" score down. A track that
   is mostly one note at a time scores up, as does a mean pitch in singing range (A3 to C6). Very
   short tracks score down. Drum-channel tracks were already dropped by the parser.
2. *Skyline:* inside the chosen track, notes starting within 0.06 beats of each other count as a
   chord, and only the highest is kept, because the melody usually sits on top. Each note is then
   cut short where the next one starts.

**`fingerprint.ts`: removing key and tempo.** Two sequences describe each pair of neighbouring notes:
- **Interval** = next pitch − this pitch, in semitones. Transposing adds the same number to every
  pitch, so the differences don't change. Leaps wider than an octave fold back into one octave.
- **Rhythm** = log₂(this gap ÷ previous gap), rounded and clamped to −3..3. Playing faster scales
  every gap by the same factor, so the ratios don't change. 0 means "same length as before",
  +1 "twice as long", −1 "half as long". The log makes doubling and halving symmetric (+1/−1),
  and the rounding means small timing slop in a human performance doesn't break a match.

This is also the privacy design: the reference library stores only these two sequences plus a
title and credit, never notes or MIDI.

**`align.ts`: finding a shared passage.** This is **Smith-Waterman local alignment**, the algorithm
biologists use to find a shared stretch in two DNA sequences. Picture a grid with your intervals
down the side and the reference's intervals across the top. Each cell holds the best score of any
matching run that ends exactly there, built from the cell diagonally above-left (match or
mismatch), from above or from the left (skip a note, −2), or **0, which starts fresh**. That last
option is the key idea: unrelated music before and after a shared passage costs nothing, so the
algorithm finds a borrowed 4 bars in the middle of a 3-minute song. The highest cell anywhere
marks the end of the best passage, and following the "where did this score come from" pointers
backwards finds its start.

Scoring choices that make it musical:
- A matching **leap** (3+ semitones) earns 3, a **step** 1.5, a **repeated note** 1. Distinctive
  leaps are what make a melody recognisable, while steps and repeats are everywhere.
- Matching rhythm on top of a matching interval earns +1.
- An interval off by one semitone costs only −0.5, so a slightly altered note does not end the run.

`classify` then turns the passage into a level:
- **Close match:** at least 8 identical intervals, at least 85% of the passage identical, and at
  least half of the matched intervals with the same rhythm.
- **Worth a listen:** at least 6 identical, at least 75% identical.
- **Passing resemblance:** anything else that still shares 4+ intervals.
- Then, if the run has **no leaps** and fewer than 10 matching intervals, it drops one level.
  Scales and repeated notes are in thousands of songs, so they mean little on their own.

**`search.ts`: running the comparison.** For now, align against every song, keep those with at
least 4 exact intervals, and sort by level, then score. That's instant for 13 songs. At 45,000
songs it would take minutes, which is why Phase 4 adds a fast prefilter here.

**`library.ts` and `public/pd-library.json`: the reference library.** The 13 public domain
melodies used to be note text inside the code. They now live in `web/scripts/seed-melodies.ts`,
and `npm run build:seed-library` turns them into `pd-library.json`, which holds fingerprints only.
The app fetches that file when it starts. This is the same format Phase 2 will fill with
thousands of tunes.
*(Since Phase 2: the seed melodies live in `indexer/sources/seed.py`, and the library is built
by `python3 indexer/build_pd_library.py`.)*

**`ui/`: rendering.** `roll.ts` draws a piano roll as SVG (time across, pitch up).
`panels.ts` fills in the library chips, track picker and result cards. Because the library holds
no notes, the outlined reference passage on each card is *rebuilt from its intervals*, starting on
your note and using your timings. So the picture shows exactly what the matcher compared.

### Why it was done this way

- **TypeScript:** types document what each function takes and returns (`Note`, `Fingerprint`,
  `Alignment`), and the compiler catches mismatches while refactoring. That matters more as the
  project grows to Python indexers and Web Workers that must agree on formats.
- **Vite:** a fast dev server, and `npm run build` produces a plain static folder (`web/dist/`)
  you can upload to any host. `base: "./"` makes the build work from any URL path, so it doesn't
  care where you deploy it.
- **No UI framework:** the UI is a few panels redrawn after each analysis. Plain DOM code is
  smaller and keeps the interesting part, the matching, front and centre.
- **Logic separate from the DOM:** `midi`, `melody`, `fingerprint`, `align` and `search` never
  touch the page, so they can be unit-tested in Node and later moved into a Web Worker (Phase 4).

### How the tests work (`web/test/`, run with `npm test`)

- **No MIDI files in the repo.** `midi-writer.ts` is a tiny MIDI *writer* used only by tests. It
  builds file bytes in memory, with options for running status, velocity-0 note-offs, program
  changes, time signatures and tempo, so each parser feature gets a targeted test.
- **The headline requirement:** `align.test.ts` checks that Ode to Joy transposed (by +5, −3, +7
  and −12 semitones) and tempo-scaled (×0.5 to ×2) still matches at **100% interval identity**,
  both directly and after a full round trip: write a two-track MIDI file, parse it, let the picker
  skip the chord track, skyline, encode, align. It also checks that a passage hidden inside
  unrelated material is found at the right position.
- **Parity with the prototype:** `parity.test.ts` pulls the original JavaScript out of
  `prototype.html` and runs old and new code on the example melody, 300 random melodies and 100
  random MIDI files. Every result must be identical. As a check that this test has teeth,
  changing the gap penalty from −2 to −3 makes it fail. Delete it in Phase 5, when changing
  results on purpose is the point.
- **Library guard:** a test fails if `pd-library.json` is out of date with the seed melodies, or
  if any entry has fields other than title, credit, source and the two fingerprint sequences.

### Tradeoffs and limits to be ready to discuss

- **Heuristic melody picking** can choose the wrong track in a busy arrangement. That's why the
  app shows the choice and lets you override it.
- **Coarse rhythm:** rounding log ratios means a dotted note (1.5×) and a doubled note (2×) look
  the same. That's robust to sloppy timing, but blind to some rhythmic differences.
- **One passage per song:** alignment reports the single best passage per reference. If your
  song borrows two separate phrases from the same tune, only the stronger one is shown.
- **Octave folding:** a leap of 14 semitones matches a step of 2. That's usually what you want
  (octave displacement), but it occasionally creates a false match.
- **O(n·m) alignment** is fine for a small library but too slow for 45,000 songs. That's Phase 4.
- **Prototype quirks kept on purpose for parity:** a damaged or cut-off file shows a technical
  error ("Offset is outside the bounds of the DataView"), and meta events don't reset running
  status as the MIDI spec says (harmless for valid files).

### Try it yourself

1. **Friendlier error for damaged files.** In `web/src/midi.ts`, make a cut-off file throw
   "This file seems to be damaged or cut off." instead of the DataView error. (Hint: wrap the
   parsing in `try/catch` and check `e instanceof RangeError`.) Add a test in `midi.test.ts`
   that slices the last 10 bytes off a file from `writeMidi` and expects your message.
2. **Rhythm matters.** Add a test to `align.test.ts`: the same intervals as Ode to Joy but with a
   very different rhythm should be "Worth a listen" (level 1), not "Close match". Which line in
   `classify` makes that happen?
3. **Feel the weights.** Run `npm run test:watch`, change the leap weight in `weight()` from 3 to
   1.5, and see which tests fail. Then change it back.

---

## Phase 2: Public domain library

### What was built

The built-in library grew from 13 hand-entered melodies to **4,170**: the 13 seed tunes plus 4,157 movements from
1,806 Mutopia pieces. It is built by one command:

```
python3 indexer/build_pd_library.py
```

```
 GitHub API ──► list of ~2,100 Mutopia piece folders (one request)
                   │
 mutopiaproject.org ──► <piece>.rdf  title, composer, date, license, typesetter, arranger
                   │
                   ▼  public domain rules (dated ≤ 1930, or traditional, or composer died ≤ 1900;
                   │                       no arrangements)
 mutopiaproject.org ──► <piece>.mid / -mids.zip   downloaded into memory, never saved
                   │
                   ▼  melodyfp: parse → pick melody track → skyline → encode   (Python port)
                   │
 web/public/pd-library.json          manifest: sources, licenses, counts
 web/public/pd-library/<source>.json  fingerprints, one file per license
 web/public/pd-library/CREDITS.txt    every piece, its typesetter, license and link
```

### Choosing sources: three of four candidates were skipped

The brief listed four candidate sources and said to read each one's terms first. That turned
out to be the most important step of the phase:

| Source | Terms | Decision |
|---|---|---|
| The Session | ODbL plus a clause forbidding processing "in any way with Large Language Models" | Skipped: this project is built with an AI assistant |
| Essen Folksong Collection | CCARH: personal, single-user, academic research only | Skipped: a public demo is redistribution |
| Nottingham Folk Music Database | No license from its makers; one sub-collection's rights explicitly reserved; a third party's GPL label | Skipped: no clear permission |
| Mutopia Project | Public Domain, CC BY or CC BY-SA, explicitly allowing redistribution and modification | Used |

Things worth saying in an interview:
- **"Free to download" is not the same as "licensed for reuse".** Two of these collections are
  freely downloadable but don't allow republishing.
- **The edition and the composition are separate rights.** Mutopia licenses its *typeset
  editions* freely, but that says nothing about whether the *music* is out of copyright. So the
  indexer applies its own US public domain test (published in 1930 or earlier) using each
  piece's date and the composer's death year. Where the evidence is unclear, the piece is left out.
- **Attribution is part of the license.** CC BY means credit the typesetter; CC BY-SA also means
  sharing derived data under the same license. So the library is split into one file per
  license family, each file states its license, every result card credits the edition's
  typesetter with a link, and a credits file lists all of them.

### Why Python, and how it stays identical to the web app

The indexer is Python because Phase 3 (the Lakh index) is a long batch job that suits Python
better than a browser. But a reference melody must be fingerprinted *exactly* the way the
browser fingerprints your melody, or matches are silently missed. So `indexer/melodyfp/` is a
line-for-line port of `midi.ts`, `melody.ts` and `fingerprint.ts`, and a cross-language test
proves they agree:

1. A TypeScript script (`npm run build:py-parity-fixture`) generates 60 synthetic MIDI files and
   200 note sequences, and saves the recipe for each file, a SHA-256 hash of its bytes, and what the
   TypeScript code makes of it.
2. The Python test rebuilds each file with a Python port of the test MIDI writer, checks the
   hash (so both languages are reading the *same bytes*), and checks that parsing, track
   choice, skyline and fingerprint all come out identical.

Two small differences between the languages had to be handled explicitly (`melodyfp/jsmath.py`):
- **Rounding.** Python's `round(2.5)` is 2 (banker's rounding); JavaScript's `Math.round(2.5)` is 3.
- **Whitespace.** Python's `strip()` removes a few control characters that JavaScript's `trim()`
  keeps, which could change a track name.

The test also caught a weakness in itself. At first, its chord notes all started at exactly the
same moment, so changing the 0.06-beat chord window didn't fail anything. Giving chord notes
humanized timing fixed that. Checking that a test fails when the code is deliberately broken
("mutation testing") is how you find this out.

### The library format

- **Fingerprints as text.** Each interval becomes one letter (A = −12 … M = 0 … Y = +12) and each
  rhythm value one digit (0 = −3 … 3 = same … 6 = +3). That's about 2 bytes per note instead of
  about 6 as JSON number arrays, and it compresses well. The app decodes them into `Int8Array`s
  (1 byte per value; a normal JS array of numbers uses 8).
- **One file per license** plus a small manifest, as explained above. The app loads them in
  parallel.
- **Still no notes.** A test fails if any melody has a field other than title, composer, year,
  license, typesetter, link and the two fingerprint strings.

### Tradeoffs and limits

- **Mostly classical, not folk.** With the folk collections skipped, the library is mostly
  classical and Romantic music (Bach, Mozart, Beethoven, Chopin…), plus Mutopia's traditional
  pieces and the 13 seed tunes. It still says nothing about modern pop.
- **Melody detection on classical scores is rough.** For a piano piece, the skyline takes the
  top note, which is usually but not always the tune. Inner voices and accompaniment figures
  get mixed in.
- **Multi-movement pieces** become one entry per movement file.
- **Search is still brute force:** every melody is aligned against yours. Against 1.3 million
  library intervals that takes about 0.6 s for the 32-note example and about 5 s for a 3-minute
  melody, measured in Node with `npx tsx scripts/bench-search.ts`. The app now shows "Checking…"
  first so the page doesn't look frozen. Phase 4 adds the n-gram prefilter that makes this fast.
- **Too many "worth a listen" flags, the biggest open problem.** The thresholds were designed for
  13 short tunes. Against thousands of long classical pieces, a run of 6-14 matching intervals
  (often a scale) turns up by chance all the time. The example now gets 4 close matches and
  317 "worth a listen", and a *random* 300-note melody gets 1 close and 393 "worth a listen".
  The top results are still right (Ode to Joy first, and Mutopia's own edition of Ode to Joy
  found independently), but the counts would alarm a songwriter. The principled fix is
  statistical: judge a match by how likely it is to happen by chance given the reference's
  length (the idea behind BLAST's "E-value" in bioinformatics), rather than by fixed counts.
  That is threshold tuning, which belongs in Phase 5 with real measurements, so this phase
  deliberately left the thresholds alone.

### Try it yourself

1. **Run a trial build** into a scratch folder:
   `python3 indexer/build_pd_library.py --limit 20 --out /tmp/trial`, then open
   `/tmp/trial/pd-library/CREDITS.txt`. Which pieces were skipped, and why?
2. **Tighten a rule.** In `indexer/sources/mutopia.py`, `UNDATED_DEATH_CUTOFF` is 1900. Change
   it to 1880, add a test for a composer who died in 1890 in `tests/test_mutopia.py`, and run
   the tests. What happens to the library size?
3. **Break parity on purpose.** Change `CHORD_WINDOW` in `melodyfp/melody.py` to 0.05 and run
   `python3 -m unittest discover -s tests -t .` from `indexer/`. Read the failure message, then
   change it back.
