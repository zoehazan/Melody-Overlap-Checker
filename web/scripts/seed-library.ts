import { encode, seqFromText } from "../src/fingerprint";
import type { LibraryFile } from "../src/library";
import { SEED_MELODIES, SEED_SOURCE } from "./seed-melodies";

export function buildSeedLibrary(): LibraryFile {
  return {
    version: 1,
    description: "Public domain reference melodies, stored as interval and rhythm fingerprints only.",
    melodies: SEED_MELODIES.map(([title, credit, txt]) => ({ title, credit, source: SEED_SOURCE, ...encode(seqFromText(txt)) })),
  };
}
