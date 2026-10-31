# indexer/

Python scripts that build reference libraries in the same fingerprint format as the web app.
Standard library only: nothing to install.

```
build_pd_library.py   one command: builds web/public/pd-library.json + pd-library/*.json
melodyfp/             port of web/src/midi.ts, melody.ts, fingerprint.ts (must stay identical)
  jsmath.py             JavaScript rounding and trimming, where Python behaves differently
sources/
  seed.py               the prototype's 13 public domain melodies
  mutopia.py            Mutopia Project: listing, public domain rules, fingerprinting
  http.py               polite downloads (User-Agent, retries)
tests/                  python3 -m unittest discover -s tests -t .   (run from indexer/)
  test_parity.py        Python vs TypeScript, using fixtures/parity.json made by the web app
  test_mutopia.py       date parsing, public domain rules, license grouping
```

**Keeping Python and TypeScript identical.** If you change `web/src/midi.ts`, `melody.ts` or
`fingerprint.ts`, port the change to `melodyfp/`, then regenerate the fixture
(`cd web && npm run build:py-parity-fixture`) and run both test suites.

**Phase 3** will add the private Lakh MIDI index builder here. Its output goes to `data/`, which
is gitignored.
