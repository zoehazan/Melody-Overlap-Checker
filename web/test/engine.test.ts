import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SearchEngine } from "../src/engine";
import { encode, seqFromText } from "../src/fingerprint";
import { readIndexFile, type MelodyIndexFile } from "../src/library";
import { EXAMPLE } from "../src/example";

const PUBLIC = fileURLToPath(new URL("../public/", import.meta.url));
const pack = (iv: number[]) => iv.map((d) => String.fromCharCode(65 + d + 12)).join("");
const packRh = (rh: number[]) => rh.map((r) => String.fromCharCode(48 + r + 3)).join("");

// A tiny "private index" made from public domain tunes under made-up names.
function indexFile(): MelodyIndexFile {
  const tunes = [["Tune A", "E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:0.5 D4:2"], ["Tune B", "C4 G4 E4 A4 D4 B4 F4 C5 A4 E5 C5 G5 E5 A5"]];
  return {
    version: 1, kind: "melody-index", name: "Test index", private: true, credit: "test",
    melodies: tunes.map(([title, notes]) => { const fp = encode(seqFromText(notes)); return { title, artist: "Nobody", iv: pack(fp.iv), rh: packRh(fp.rh) }; }),
  };
}

describe("readIndexFile", () => {
  it("reads gzipped and plain index files", async () => {
    const json = JSON.stringify(indexFile());
    for (const blob of [new Blob([gzipSync(json)]), new Blob([json])]) {
      const idx = await readIndexFile(blob);
      expect(idx.name).toBe("Test index");
      expect(idx.entries.map((e) => [e.title, e.credit, e.origin])).toEqual([["Tune A", "Nobody", "private"], ["Tune B", "Nobody", "private"]]);
    }
  });

  it("rejects files that are not melody indexes", async () => {
    await expect(readIndexFile(new Blob(["not json"]))).rejects.toThrow(/not a readable melody index/);
    await expect(readIndexFile(new Blob([JSON.stringify({ kind: "something else" })]))).rejects.toThrow(/not a melody index/);
  });
});

describe("SearchEngine", () => {
  const engine = new SearchEngine();
  beforeAll(async () => {
    vi.stubGlobal("fetch", async (url: string) => new Response(readFileSync(PUBLIC + url.replace(/^\.\//, ""))));
    await engine.loadPd("./");
  });
  afterAll(() => vi.unstubAllGlobals());

  it("finds Ode to Joy in the example, with the intervals to redraw it", () => {
    const reply = engine.search(encode(EXAMPLE));
    expect(reply.aligned).toBeLessThan(reply.searched); // the prefilter was used
    const top = reply.hits[0];
    expect(top.lib.title).toBe("Ode to Joy");
    expect(top.level).toBe(2);
    expect(top.refIv).toHaveLength(top.r.rEnd - top.r.rStart);
    expect(top.refIv.slice(0, 4)).toEqual([0, 1, 2, 0]); // E E F G G: Ode to Joy's opening
  });

  it("adds, replaces and searches a private index", async () => {
    const before = engine.size;
    const res = await engine.loadPrivate(new Blob([gzipSync(JSON.stringify(indexFile()))]));
    expect(res.count).toBe(2);
    expect(engine.size).toBe(before + 2);
    await engine.loadPrivate(new Blob([JSON.stringify(indexFile())])); // replacing, not adding
    expect(engine.size).toBe(before + 2);
    const hits = engine.search(encode(seqFromText("D4 A4 F#4 B4 E4 C#5 G4 D5 B4 F#5 D5 A5 F#5 B5"))).hits; // Tune B, up a tone
    expect(hits[0].lib).toMatchObject({ title: "Tune B", credit: "Nobody", origin: "private" });
  });

  it("always checks files the user added", () => {
    const [info] = engine.addRefs([{ title: "my reference", fp: encode(seqFromText("C5 B4 G4 E4 C4 E4 G4 B4 C5 D5 C5 A4")) }]);
    expect(info.origin).toBe("added");
    expect(engine.search(encode(seqFromText("D5 C#5 A4 F#4 D4 F#4 A4 C#5 D5 E5 D5 B4"))).hits[0].lib.id).toBe(info.id);
  });
});
