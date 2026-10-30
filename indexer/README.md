# indexer/

Python scripts that build reference libraries in the same fingerprint format as the web app
(`web/src/fingerprint.ts`):

- **Phase 2:** converters for public domain collections (ABC, kern, MIDI) -> `web/public/pd-library.json`
- **Phase 3:** the private Lakh MIDI fingerprint index -> `data/` (never committed)

Not started yet. In Phase 1 the built-in library is generated from the prototype's 13 melodies
by `web/scripts/build-seed-library.ts`.
