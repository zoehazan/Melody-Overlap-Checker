/* The search engine: owns the reference library and its n-gram index, and answers searches.
 *
 * It runs inside a Web Worker (see search-worker.ts), so loading a 30 MB index, building the
 * n-gram index and searching never freeze the page. It has no DOM code, so tests can use it
 * directly in Node.
 *
 * The page never receives the library's fingerprints: only titles and credits (EntryInfo) and,
 * for each hit, the few reference intervals needed to draw the comparison piano roll.
 */
import type { Alignment, Level } from "./align";
import type { Fingerprint } from "./fingerprint";
import { loadPdLibrary, readIndexFile, type LibraryEntry, type LibraryManifest, type Origin } from "./library";
import { NgramIndex } from "./ngram";
import { searchIndexed, TOP_K } from "./search";

/** What the page knows about a library entry. */
export interface EntryInfo {
  id: number;
  title: string;
  credit: string;
  origin: Origin;
  attribution?: { text: string; url?: string };
}

export interface EngineHit {
  lib: EntryInfo;
  r: Alignment;
  level: Level;
  stepwise: boolean;
  /** Reference intervals from r.rStart, enough to redraw the matched passage. */
  refIv: number[];
}

export interface SearchReply {
  hits: EngineHit[];
  /** Melodies searched in total, and how many got full alignment. */
  searched: number;
  aligned: number;
  ms: number;
}

export interface IndexStats {
  songs: number;
  grams: number;
  mb: number;
  ms: number;
}

type Entry = LibraryEntry & { id: number };

export class SearchEngine {
  private nextId = 0;
  private pd: Entry[] = [];
  private priv: Entry[] = [];
  private added: Entry[] = [];
  /** pd + priv, in the order the n-gram index was built from. */
  private indexed: Entry[] = [];
  private index: NgramIndex | null = null;

  private tag(entries: LibraryEntry[]): Entry[] {
    return entries.map((e) => ({ ...e, id: this.nextId++ }));
  }

  private info(e: Entry): EntryInfo {
    return { id: e.id, title: e.title, credit: e.credit, origin: e.origin, attribution: e.attribution };
  }

  /** Rebuild the n-gram index over the public domain library and any private index. */
  private reindex(): IndexStats {
    const t0 = performance.now();
    this.indexed = this.pd.concat(this.priv);
    this.index = NgramIndex.build(this.indexed.map((e) => e.fp));
    return { songs: this.indexed.length, grams: this.index.grams, mb: this.index.bytes / 1e6, ms: performance.now() - t0 };
  }

  async loadPd(base: string): Promise<{ manifest: LibraryManifest; index: IndexStats }> {
    const { manifest, entries } = await loadPdLibrary(base);
    this.pd = this.tag(entries);
    return { manifest, index: this.reindex() };
  }

  /** Load (or replace) the private index from a file the user picked. */
  async loadPrivate(file: Blob): Promise<{ name: string; credit: string; count: number; index: IndexStats }> {
    const { name, credit, entries } = await readIndexFile(file);
    this.priv = this.tag(entries);
    return { name, credit, count: this.priv.length, index: this.reindex() };
  }

  /** Reference files the user added. They are always fully aligned, never prefiltered. */
  addRefs(refs: { title: string; fp: Fingerprint }[]): EntryInfo[] {
    const tagged = this.tag(refs.map((r) => ({ title: r.title, credit: "Added by you", origin: "added" as const, fp: r.fp })));
    this.added.push(...tagged);
    return tagged.map((e) => this.info(e));
  }

  get size(): number {
    return this.pd.length + this.priv.length + this.added.length;
  }

  search(query: Fingerprint, k = TOP_K): SearchReply {
    const t0 = performance.now();
    const res = searchIndexed(query, this.indexed, this.index, this.added, k);
    const hits = res.hits.map((h) => {
      const e = h.lib as Entry;
      return { lib: this.info(e), r: h.r, level: h.level, stepwise: h.stepwise, refIv: Array.prototype.slice.call(e.fp.iv, h.r.rStart, h.r.rEnd) as number[] };
    });
    return { hits, searched: this.size, aligned: res.aligned, ms: performance.now() - t0 };
  }
}
