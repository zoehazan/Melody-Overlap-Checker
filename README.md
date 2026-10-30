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

If you edit the seed melodies in `web/scripts/seed-melodies.ts`, regenerate the library with
`npm run build:seed-library`.

## Layout

```
web/        Vite + TypeScript app
  src/        midi, melody, fingerprint, align, search modules, ui/ rendering
  public/     pd-library.json: public domain fingerprints (committed)
  scripts/    builds pd-library.json
  test/       Vitest unit tests
indexer/    Python library and index builders (later phases)
eval/       evaluation harness and results (later phases)
data/       private downloads and indexes, never committed
prototype.html   the original single-file prototype
```

Reference data rules, sources and credits: see `LICENSES.md`.
