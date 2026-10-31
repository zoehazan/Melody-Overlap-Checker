/* The reference library: fingerprints plus credits. Never notes or playable MIDI.
 *
 * The public domain library is built by indexer/build_pd_library.py as a small manifest
 * (pd-library.json) listing one file per source. Each file carries a single license, and each
 * melody's fingerprint is packed as text, one character per interval (see decodeIv/decodeRh).
 */
import type { Fingerprint } from "./fingerprint";

export interface LibraryEntry {
  title: string;
  /** Composer and year, or "Traditional", shown under the title. */
  credit: string;
  /** True for the shipped public domain library, false for files the user added in this tab. */
  builtin: boolean;
  fp: Fingerprint;
  /** Credit the source's license asks for, e.g. the typesetter of a CC BY edition. */
  attribution?: { text: string; url?: string };
}

/** One source as listed in the manifest. */
export interface LibrarySource {
  id: string;
  name: string;
  /** Who publishes the editions, for attribution lines ("Mutopia Project"). */
  publisher: string | null;
  description: string;
  url: string | null;
  license: string;
  licenseUrl: string | null;
  credit: string | null;
  file: string;
  count: number;
}

/** Shape of web/public/pd-library.json. */
export interface LibraryManifest {
  version: 2;
  description: string;
  total: number;
  credits: string;
  sources: LibrarySource[];
}

/** Shape of each web/public/pd-library/<source>.json. */
export interface LibraryFile {
  source: string;
  license: string;
  melodies: {
    title: string;
    composer: string;
    year?: number;
    /** Per-melody license, typesetter and link, for sources that need attribution. */
    license?: string;
    typesetter?: string;
    url?: string;
    iv: string;
    rh: string;
  }[];
}

/* Packed text: intervals -12..12 are letters A..Y (M = repeated note), rhythm -3..3 digits 0..6.
 * Must match pack_iv/pack_rh in indexer/melodyfp/fingerprint.py. */
export function decodeIv(s: string): Int8Array {
  const out = new Int8Array(s.length);
  for (let k = 0; k < s.length; k++) out[k] = s.charCodeAt(k) - 65 - 12;
  return out;
}
export function decodeRh(s: string): Int8Array {
  const out = new Int8Array(s.length);
  for (let k = 0; k < s.length; k++) out[k] = s.charCodeAt(k) - 48 - 3;
  return out;
}

export function entriesFromFile(file: LibraryFile, source?: LibrarySource): LibraryEntry[] {
  if (!Array.isArray(file.melodies)) throw new Error("Unrecognised library file.");
  return file.melodies.map((m) => ({
    title: m.title,
    credit: m.year ? `${m.composer}, ${m.year}` : m.composer,
    builtin: true,
    fp: { iv: decodeIv(m.iv), rh: decodeRh(m.rh) },
    attribution: m.typesetter
      ? { text: `${source?.publisher ?? source?.name ?? file.source} edition typeset by ${m.typesetter}, ${m.license}`, url: m.url }
      : undefined,
  }));
}

export interface PdLibrary {
  manifest: LibraryManifest;
  entries: LibraryEntry[];
}

/** Load the manifest, then every source file in parallel. `base` is the folder holding pd-library.json. */
export async function loadPdLibrary(base: string): Promise<PdLibrary> {
  const get = async (path: string) => {
    const res = await fetch(base + path);
    if (!res.ok) throw new Error(`Could not load the built-in library (HTTP ${res.status}).`);
    return res.json();
  };
  const manifest = (await get("pd-library.json")) as LibraryManifest;
  if (manifest.version !== 2) throw new Error("Unrecognised library manifest.");
  const files = await Promise.all(manifest.sources.map((s) => get(s.file) as Promise<LibraryFile>));
  return { manifest, entries: files.flatMap((f, i) => entriesFromFile(f, manifest.sources[i])) };
}
