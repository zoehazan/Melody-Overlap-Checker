/* Guards on the shipped public domain library (web/public/pd-library.json and pd-library/*.json),
 * built by indexer/build_pd_library.py. These run on the real files, so a bad build fails here. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { decodeIv, decodeRh, loadPdLibrary, type LibraryFile, type LibraryManifest } from "../src/library";

const PUBLIC = fileURLToPath(new URL("../public/", import.meta.url));
const read = (path: string) => JSON.parse(readFileSync(PUBLIC + path, "utf8"));
const manifest = read("pd-library.json") as LibraryManifest;
const files = manifest.sources.map((s) => ({ source: s, file: read(s.file) as LibraryFile }));

const ALLOWED_KEYS = new Set(["title", "composer", "year", "license", "typesetter", "url", "iv", "rh"]);

describe("pd-library", () => {
  it("has a manifest whose counts match its files", () => {
    expect(manifest.version).toBe(2);
    for (const { source, file } of files) {
      expect(file.source).toBe(source.id);
      expect(file.melodies).toHaveLength(source.count);
    }
    expect(manifest.total).toBe(files.reduce((a, f) => a + f.file.melodies.length, 0));
  });

  it("stores fingerprints and credits only, never notes", () => {
    for (const { file } of files) {
      for (const m of file.melodies) {
        for (const k of Object.keys(m)) expect(ALLOWED_KEYS.has(k), `unexpected field "${k}" in ${m.title}`).toBe(true);
        expect(m.iv).toMatch(/^[A-Y]+$/);
        expect(m.rh).toMatch(/^[0-6]+$/);
        expect(m.rh.length).toBe(m.iv.length);
        expect(m.iv.length).toBeGreaterThanOrEqual(5); // at least 6 notes, as the app requires
      }
    }
  });

  it("only includes works dated 1930 or earlier", () => {
    for (const { file } of files) for (const m of file.melodies) if (m.year) expect(m.year).toBeLessThanOrEqual(1930);
  });

  it("credits every melody from a source that requires attribution", () => {
    for (const { source, file } of files) {
      if (!source.id.startsWith("mutopia-")) continue;
      for (const m of file.melodies) {
        expect(m.typesetter, m.title).toBeTruthy();
        expect(m.license, m.title).toBeTruthy();
        expect(m.url, m.title).toMatch(/^https:\/\/www\.mutopiaproject\.org\//);
      }
    }
    expect(readFileSync(PUBLIC + manifest.credits, "utf8")).toContain("Typeset by");
  });
});

describe("packed fingerprints", () => {
  it("decode the same way the Python indexer packs them", () => {
    // Same strings as indexer/tests/test_parity.py checks on the Python side.
    expect(Array.from(decodeIv("ABCDEFGHIJKLMNOPQRSTUVWXY"))).toEqual(Array.from({ length: 25 }, (_, k) => k - 12));
    expect(Array.from(decodeRh("0123456"))).toEqual([-3, -2, -1, 0, 1, 2, 3]);
  });
});

describe("loadPdLibrary", () => {
  it("loads every source file and credits each Mutopia melody", async () => {
    const fetch = vi.fn(async (url: string) => new Response(readFileSync(PUBLIC + url.replace(/^\.\//, ""))));
    vi.stubGlobal("fetch", fetch);
    const { entries } = await loadPdLibrary("./");
    vi.unstubAllGlobals();
    expect(entries).toHaveLength(manifest.total);
    expect(fetch).toHaveBeenCalledTimes(1 + manifest.sources.length);
    const ode = entries.find((e) => e.title === "Ode to Joy")!;
    expect(ode.credit).toBe("Beethoven, 1824");
    expect(ode.attribution).toBeUndefined();
    const fromMutopia = entries.find((e) => e.attribution)!;
    expect(fromMutopia.attribution!.text).toMatch(/^Mutopia Project edition typeset by .+, (Public Domain|CC BY)/);
  });
});
