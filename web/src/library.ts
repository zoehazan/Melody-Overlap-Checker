/* The reference library: fingerprints plus credits. Never notes or playable MIDI. */
import type { Fingerprint } from "./fingerprint";

export interface LibraryEntry {
  title: string;
  /** Composer, year or "Traditional", shown under the title. */
  credit: string;
  /** True for the shipped public domain library, false for files the user added in this tab. */
  builtin: boolean;
  fp: Fingerprint;
}

/** Shape of web/public/pd-library.json. */
export interface LibraryFile {
  version: 1;
  description: string;
  melodies: { title: string; credit: string; source: string; iv: number[]; rh: number[] }[];
}

export function entriesFromFile(file: LibraryFile): LibraryEntry[] {
  if (file.version !== 1 || !Array.isArray(file.melodies)) throw new Error("Unrecognised library file.");
  return file.melodies.map((m) => ({ title: m.title, credit: m.credit, builtin: true, fp: { iv: m.iv, rh: m.rh } }));
}

export async function loadPdLibrary(url: string): Promise<LibraryEntry[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load the built-in library (HTTP ${res.status}).`);
  return entriesFromFile(await res.json());
}
