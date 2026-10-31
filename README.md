# Melody-Overlap-Checker
Checks my melodies for accidental overlap with existing songs.

Upload a MIDI export of an original melody and the checker flags passages that resemble melodies
in a reference library, in any key or tempo. Results point to passages worth a listen. They are
not a legal opinion.

> Work in progress. A full write-up (screenshots, how it works, evaluation, limitations) comes in
> the final phase. See `LEARNING.md` for notes on each part as it is built.

## Run it

Requires Node.js 22.12 or newer (Codespaces already has it).

```bash
cd web
npm install
npm run dev        # local dev server with live reload, prints the URL to open
npm test           # unit tests (Vitest)
npm run build      # type-check, then build the static site into web/dist/
npm run preview    # serve web/dist/ locally to check the production build
```

`web/dist/` is a plain static folder and can be uploaded to any static host. It contains only the
public domain reference library.

## Rebuild the public domain library

The built-in library (`web/public/pd-library.json` and `web/public/pd-library/`) is committed, so
you only need this to refresh it or after changing the indexer. Run from the repository root in
a Codespace (needs Python 3.10+, no packages to install):

```bash
python3 indexer/build_pd_library.py
```

The first run downloads metadata and MIDI for about 2,100 Mutopia pieces and takes about 10
minutes. Metadata and fingerprints are cached in `data/cache/` (gitignored), so later runs are
quick. MIDI files are processed in memory and never saved. Add `--limit 50` for a quick trial.

Indexer tests (Python, standard library only):

```bash
cd indexer && PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -t .
```

Which sources are used, which were skipped and why, and their credits: see `LICENSES.md`.

## Layout

```
web/        Vite + TypeScript app
  src/        midi, melody, fingerprint, align, search modules, ui/ rendering
  public/     pd-library.json + pd-library/: public domain fingerprints (committed)
  scripts/    test fixture and benchmark helpers
  test/       Vitest unit tests
indexer/    Python: builds the public domain library (Lakh index in a later phase)
eval/       evaluation harness and results (later phases)
data/       private downloads and indexes, never committed
prototype.html   the original single-file prototype
```

Reference data rules, sources and credits: see `LICENSES.md`.
