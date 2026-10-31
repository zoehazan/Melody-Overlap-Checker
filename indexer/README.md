# indexer/

Python scripts that build reference libraries in the same fingerprint format as the web app.
Standard library only: nothing to install.

```
build_pd_library.py   one command: builds web/public/pd-library.json + pd-library/*.json
build_lakh_index.py   one command: builds the PRIVATE Lakh index into data/index/ (never committed)
melodyfp/             port of web/src/midi.ts, melody.ts, fingerprint.ts (must stay identical)
  jsmath.py             JavaScript rounding and trimming, where Python behaves differently
sources/
  seed.py               the prototype's 13 public domain melodies
  mutopia.py            Mutopia Project: listing, public domain rules, fingerprinting
  lakh.py               Lakh MIDI: files -> tracks -> songs, best version per song
  http.py               polite downloads (User-Agent, retries)
tests/                  python3 -m unittest discover -s tests -t .   (run from indexer/)
  test_parity.py        Python vs TypeScript, using fixtures/parity.json made by the web app
  test_mutopia.py       date parsing, public domain rules, license grouping
  test_lakh.py          Lakh indexer on a synthetic miniature dataset (no real Lakh data)
  test_build.py         public domain library file format
```

**Keeping Python and TypeScript identical.** If you change `web/src/midi.ts`, `melody.ts` or
`fingerprint.ts`, port the change to `melodyfp/`, then regenerate the fixture
(`cd web && npm run build:py-parity-fixture`) and run both test suites.

**The Lakh index is private.** `build_lakh_index.py` only writes inside `data/`, and checks that
git ignores the output before writing. Its tests use a synthetic miniature of the dataset made
from public domain tunes, so no copyrighted material is needed to develop or test it.
