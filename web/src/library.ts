/* The reference library: fingerprints plus credits. Never notes or playable MIDI.
 *
 * The public domain library is built by indexer/build_pd_library.py as a small manifest
 * (pd-library.json) listing one file per source. Each file carries a single license, and each
 * melody's fingerprint is packed as text, one character per interval (see decodeIv/decodeRh).
 */
import type { Fingerprint } from "./fingerprint";

/** Where an entry came from: the shipped public domain library, a private index file loaded
 * in this tab (e.g. Lakh), or a MIDI file added in this tab. */
export type Origin = "pd" | "private" | "added";

export interface LibraryEntry {
  title: string;
  /** Composer and year, "Traditional", or the artist, shown under the title. */
  credit: string;
  origin: Origin;
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
    origin: "pd" as const,
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

/* ---------- Private index files (e.g. the Lakh index from indexer/build_lakh_index.py) ---------- */

/** Shape of a melody index file such as data/index/lakh-index.json.gz. */
export interface MelodyIndexFile {
  version: 1;
  kind: "melody-index";
  name: string;
  private: boolean;
  credit: string;
  melodies: { title: string; artist: string; iv: string; rh: string }[];
}

export interface PrivateIndex {
  name: string;
  credit: string;
  entries: LibraryEntry[];
}

/**
 * Read a melody index file chosen by the user. It is read locally in this tab and never
 * uploaded. Gzipped files (starting with the bytes 1f 8b) are unpacked with the browser's
 * built-in DecompressionStream.
 */
export async function readIndexFile(file: Blob): Promise<PrivateIndex> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  const gz = head[0] === 0x1f && head[1] === 0x8b;
  const stream = gz ? file.stream().pipeThrough(new DecompressionStream("gzip")) : file.stream();
  let data: MelodyIndexFile;
  try {
    data = await new Response(stream).json();
  } catch {
    throw new Error("This file is not a readable melody index (expected .json or .json.gz).");
  }
  if (data?.kind !== "melody-index" || data.version !== 1 || !Array.isArray(data.melodies))
    throw new Error("This file is not a melody index built by indexer/build_lakh_index.py.");
  return {
    name: data.name,
    credit: data.credit,
    entries: data.melodies.map((m) => ({
      title: m.title, credit: m.artist, origin: "private", fp: { iv: decodeIv(m.iv), rh: decodeRh(m.rh) },
      attribution: { text: `From your private index: ${data.name}` },
    })),
  };
}
