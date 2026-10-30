# Melody Overlap Checker

## What this is
A browser tool that lets a songwriter check her own original melodies for accidental overlap with existing songs before release. She uploads a MIDI export of her melody (from Logic Pro or Ableton) and the tool flags passages that resemble melodies in a reference library, regardless of key or tempo.

This is Zoe Hazan's portfolio project. She is a CS graduate and singer-songwriter. It will go on her resume, so she needs to understand and be able to explain every part of it.

## Starting point
`prototype.html` is a working single-file prototype. It already has:
- A dependency-free MIDI parser (format 0/1, running status, track names, time signature)
- Melody extraction: picks the likeliest melody track, then keeps the top note at each onset ("skyline")
- Fingerprinting: pitch intervals (key-independent) and log2 ratios between consecutive note gaps (tempo-independent)
- Smith-Waterman local alignment, with leaps weighted above steps and a rhythm bonus
- Three result levels: Close match, Worth a listen, Passing resemblance
- A piano-roll comparison of each flagged passage
- A built-in library of 13 public domain melodies, plus user-added reference MIDI files kept in the browser tab only

Keep its behavior, results framing and visual design. Refactor it into a proper project; do not rewrite from scratch.

## Ground rules (do not break these)
1. **Never write out copyrighted melodies.** Do not hand-encode, transcribe or generate note data for copyrighted songs. Reference data comes only from the Lakh MIDI Dataset, MIDI files Zoe supplies, or public domain melodies.
2. **Fingerprints only.** The reference index stores interval and rhythm sequences plus title and artist. It never stores playable MIDI. Delete raw MIDI after indexing.
3. **Private index.** This is for Zoe's personal use. Never commit MIDI files or the Lakh-derived index to the repo, and never publish them. Add both to `.gitignore`. The public demo ships only the public domain library.
4. **Honest framing.** Results say "worth a listen", never "infringement" or "safe". Keep the note that the tool is not a legal opinion.
5. **Teach as you go.** After each phase, add a short plain-language section to `LEARNING.md` explaining what was built, why, and the main tradeoffs, so Zoe can explain it in an interview. Ask her to make small changes herself where practical.

## Target structure
```
/web            Vite + TypeScript app (no heavy UI framework needed)
  /src/midi.ts        MIDI parsing
  /src/melody.ts      track selection + skyline
  /src/fingerprint.ts encoding
  /src/align.ts       Smith-Waterman + classification
  /src/search.ts      n-gram prefilter + alignment over a large index
  /src/ui/*           rendering
  /public/pd-library.json   public domain melodies (committed)
/indexer        Python scripts that build the Lakh fingerprint index
/eval           test harness and results
/data           gitignored: raw downloads, built index
LEARNING.md
README.md
```

## Phases

### Phase 1: Project setup
- Create the repo structure above, port the prototype into TypeScript modules with identical results.
- Unit tests (Vitest) for the MIDI parser, fingerprinting and alignment. Test that a transposed and tempo-scaled copy of a melody still matches at 100% interval identity.
- Deploy the public demo (public domain library only) to GitHub Pages.

### Phase 2: Lakh reference index
- Source: the LMD-matched subset of the Lakh MIDI Dataset (about 45,000 songs matched to the Million Song Dataset, with title and artist from the matching metadata). Dataset page: https://colinraffel.com/projects/lmd/ (CC-BY 4.0 for the compilation; the underlying songs are copyrighted, hence the ground rules).
- Run the download and indexing in a cloud environment such as GitHub Codespaces, so nothing large lands on Zoe's computer. Some sandboxes block the dataset host; Codespaces has open internet.
- Python indexer using `pretty_midi`: for each song, choose the melody track with the same scoring logic as the web app, skyline it, fingerprint it. Where a song has several MIDI versions, keep the best-scoring one.
- Output a compact binary or gzipped JSON index plus a song metadata table. Target under 40 MB compressed.
- Delete raw MIDI once the index is built.

### Phase 3: Fast search at scale
- Build an inverted index of interval n-grams (6 intervals) when the index loads, ideally in a Web Worker.
- Prefilter: score songs by shared n-grams, weighting rare n-grams higher (IDF), keep the top 200, then run full alignment only on those.
- Target: a 3-minute melody checked against 45,000 songs in under 5 seconds in the browser.
- The app loads the private index through a "Load reference index" file picker, so it is never hosted publicly.

### Phase 4: Evaluation
- Build a test set without writing copyrighted melodies: take indexed songs and generate altered queries (transposed, tempo-changed, embedded inside unrelated melodies, with a few notes changed). Measure how often the source song ranks first and in the top 5.
- Measure false positives: run Zoe's own original melodies and random melodies through it and report how many "Close match" flags appear.
- Tune thresholds and weights based on this. Write results to `eval/RESULTS.md` with real numbers.

### Phase 5: Polish for the portfolio
- README with a clear explanation, a screenshot, how it works (with a simple diagram), evaluation numbers, limitations, and the legal and ethical choices above.
- Optional extras if time allows: hummed or sung audio input with Spotify's Basic Pitch; exporting a PDF-style report.

## Known limitations to keep visible
- Lakh MIDI is mostly pre-2015, fan-made and of uneven quality, so recent songs are not covered.
- Melody track detection is a heuristic and can pick the wrong track.
- Short or stepwise overlaps are common across music and mean little on their own.
- For a release with real stakes, a forensic musicologist or entertainment lawyer is the right next step.
