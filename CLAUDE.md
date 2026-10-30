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
3. **Private index.** This is for Zoe's personal use. MIDI files and the Lakh-derived index must never end up in the repo or be published. Add both to `.gitignore` so they cannot be committed by accident. The public demo ships only the public domain library.
4. **Honest framing.** Results say "worth a listen", never "infringement" or "safe". Keep the note that the tool is not a legal opinion.
5. **Zoe handles all git and GitHub work.** Do not run `git commit`, `git push`, `git merge`, `git rebase`, `git checkout -b` or any other command that changes git history or branches. Do not create pull requests, issues, releases, GitHub Actions workflows, GitHub Pages settings, or use the `gh` CLI. Only edit files in the working folder. Read-only commands such as `git status` and `git diff` are fine. When a phase is done, tell Zoe it is ready for her to review and commit, and suggest a commit message she can use or change.
6. **Teach as you go.** After each phase, add a short plain-language section to `LEARNING.md` explaining what was built, why, and the main tradeoffs, so Zoe can explain it in an interview. Ask her to make small changes herself where practical.

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
/indexer        Python scripts that build the public domain library and the Lakh fingerprint index
LICENSES.md     terms and credits for every public domain source
/eval           test harness and results
/data           gitignored: raw downloads, built index
LEARNING.md
README.md
```

## Phases

### Phase 1: Project setup
- Create the repo structure above, port the prototype into TypeScript modules with identical results.
- Unit tests (Vitest) for the MIDI parser, fingerprinting and alignment. Test that a transposed and tempo-scaled copy of a melody still matches at 100% interval identity.
- Make the app build into a static folder (public domain library only) that Zoe can deploy herself wherever she chooses. Do not set up the deployment.

### Phase 2: Public domain library
- Expand the built-in library from 13 melodies to thousands, using only sources that publish their data for reuse. Candidates, in this order:
  - The Session (Irish and folk tunes, ABC notation, data published for reuse)
  - Essen Folksong Collection (about 8,000 European folk melodies, Humdrum/kern format)
  - Nottingham Folk Music Database (about 1,000 folk tunes, ABC notation)
  - Mutopia Project (public domain classical scores, many with MIDI)
- Before using each source, read its license or terms and record them in `LICENSES.md`. Skip any source whose terms do not clearly allow this use, and tell Zoe why.
- Only include works that are public domain in the US (published in 1930 or earlier, or traditional). Skip modern arrangements or editions that carry their own copyright.
- Write converters in `/indexer` that turn ABC, kern and MIDI into the same fingerprint format the web app uses, with title, composer or "Traditional", year where known, and source for each melody.
- Ship the result as `web/public/pd-library.json` (or split into a few files if large), committed to the repo. Unlike the Lakh index, this library is public and is what the deployed demo uses.
- Show the library's size and sources in the app, with credit to each source as its terms require.
- Run the download and conversion with one command in Zoe's cloud environment, documented in the README.

### Phase 3: Lakh reference index
- Source: the LMD-matched subset of the Lakh MIDI Dataset (about 45,000 songs matched to the Million Song Dataset, with title and artist from the matching metadata). Dataset page: https://colinraffel.com/projects/lmd/ (CC-BY 4.0 for the compilation; the underlying songs are copyrighted, hence the ground rules).
- The download and indexing should run in a cloud environment that Zoe sets up herself (for example GitHub Codespaces), so nothing large lands on her computer. Write the indexer so it runs with one command there, and document that command in the README.
- Python indexer using `pretty_midi`: for each song, choose the melody track with the same scoring logic as the web app, skyline it, fingerprint it. Where a song has several MIDI versions, keep the best-scoring one.
- Output a compact binary or gzipped JSON index plus a song metadata table. Target under 40 MB compressed.
- Delete raw MIDI once the index is built.

### Phase 4: Fast search at scale
- Build an inverted index of interval n-grams (6 intervals) when the index loads, ideally in a Web Worker.
- Prefilter: score songs by shared n-grams, weighting rare n-grams higher (IDF), keep the top 200, then run full alignment only on those.
- Target: a 3-minute melody checked against 45,000 songs in under 5 seconds in the browser.
- The app loads the private index through a "Load reference index" file picker, so it is never hosted publicly. The public domain library from Phase 2 also uses this fast search.

### Phase 5: Evaluation
- Run the published evaluation on the public domain library only, so the results and test files in the repo involve no copyrighted material. Repeat it privately on the Lakh index and report only the numbers.
- Build the test set without writing copyrighted melodies: take indexed songs and generate altered queries (transposed, tempo-changed, embedded inside unrelated melodies, with a few notes changed). Measure how often the source song ranks first and in the top 5.
- Measure false positives: run Zoe's own original melodies and random melodies through it and report how many "Close match" flags appear.
- Tune thresholds and weights based on this. Write results to `eval/RESULTS.md` with real numbers.

### Phase 6: Polish for the portfolio
- README with a clear explanation, a screenshot, how it works (with a simple diagram), evaluation numbers, limitations, and the legal and ethical choices above, including why the public demo uses only public domain music.
- Optional extras if time allows: hummed or sung audio input with Spotify's Basic Pitch; exporting a PDF-style report.

## Known limitations to keep visible
- The public domain library covers folk, traditional and pre-1931 music, not modern pop.
- Lakh MIDI is mostly pre-2015, fan-made and of uneven quality, so recent songs are not covered.
- Melody track detection is a heuristic and can pick the wrong track.
- Short or stepwise overlaps are common across music and mean little on their own.
- For a release with real stakes, a forensic musicologist or entertainment lawyer is the right next step.
