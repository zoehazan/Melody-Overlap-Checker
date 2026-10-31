import { describe, expect, it } from "vitest";
import { encode } from "../src/fingerprint";
import type { LibraryEntry } from "../src/library";
import { gramKeys, N, NgramIndex, uniqueGrams } from "../src/ngram";
import { searchIndexed, searchLibrary } from "../src/search";
import { randomMelody, rng } from "./random-melody";

const key = (iv: number[]) => iv.reduceRight((k, d) => k * 25 + (d + 12), 0);

describe("n-gram keys", () => {
  it("packs each run of 6 intervals into one integer, sliding one interval at a time", () => {
    const iv = [2, 2, 1, 2, 2, 2, 1, -12, 12, 0];
    const keys = Array.from(gramKeys(iv));
    expect(keys).toHaveLength(iv.length - N + 1);
    keys.forEach((k, j) => expect(k).toBe(key(iv.slice(j, j + N))));
  });

  it("has no n-grams for sequences shorter than one", () => {
    expect(gramKeys([1, 2, 3, 4, 5])).toHaveLength(0);
  });

  it("lists each distinct n-gram once, sorted", () => {
    const g = Array.from(uniqueGrams([0, 0, 0, 0, 0, 0, 0, 0]));
    expect(g).toEqual([key([0, 0, 0, 0, 0, 0])]);
  });
});

/** A library of random melodies, with fingerprints only. */
function library(n: number, seed = 1, len = 80): LibraryEntry[] {
  const rand = rng(seed);
  return Array.from({ length: n }, (_, k) => ({ title: `Song ${k}`, credit: "", origin: "pd" as const, fp: encode(randomMelody(rand, len)) }));
}

describe("NgramIndex", () => {
  const lib = library(1000);
  const index = NgramIndex.build(lib.map((e) => e.fp));

  it("ranks the song a passage was taken from first", () => {
    for (const k of [3, 500, 999]) {
      const iv = Array.from(lib[k].fp.iv).slice(20, 40);
      expect(index.candidates(iv, 5)[0]).toBe(k);
    }
  });

  it("returns at most k distinct songs", () => {
    const top = index.candidates(Array.from(lib[0].fp.iv), 50);
    expect(top.length).toBeLessThanOrEqual(50);
    expect(new Set(top).size).toBe(top.length);
  });

  it("leaves out n-grams found in too many songs (stop-grams)", () => {
    const scales = Array.from({ length: 100 }, () => ({ iv: [2, 2, 1, 2, 2, 2, 1, 2, 2], rh: new Array(9).fill(0) }));
    const idx = NgramIndex.build(scales, { maxDfShare: 0.05, minStopDf: 20 });
    expect(idx.stopGrams).toBe(idx.grams);
    expect(idx.candidates([2, 2, 1, 2, 2, 2, 1], 10)).toEqual([]);
  });

  it("does not list a song twice when an n-gram is in every song of a tiny library", () => {
    const same = Array.from({ length: 3 }, () => ({ iv: [1, 2, 3, 4, 5, 6, 7], rh: new Array(7).fill(0) }));
    expect(NgramIndex.build(same).candidates([1, 2, 3, 4, 5, 6, 7], 10).sort()).toEqual([0, 1, 2]);
  });

  it("switches to 32-bit song ids beyond 65,535 songs", () => {
    const many = Array.from({ length: 70000 }, (_, k) => ({ iv: [k % 25 - 12, 1, 2, 3, 4, 5, (k >> 5) % 25 - 12], rh: new Array(7).fill(0) }));
    const idx = NgramIndex.build(many, { maxDfShare: 1 });
    expect(idx.candidates(many[69999].iv, 10000)).toContain(69999);
  });
});

describe("searchIndexed", () => {
  const lib = library(600, 2);
  const index = NgramIndex.build(lib.map((e) => e.fp));

  it("aligns only the top k candidates, and still finds the source", () => {
    const query = { iv: Array.from(lib[123].fp.iv).slice(10, 40), rh: Array.from(lib[123].fp.rh).slice(10, 40) };
    const res = searchIndexed(query, lib, index, [], 50);
    expect(res.prefiltered).toBe(true);
    expect(res.aligned).toBeGreaterThan(0);
    expect(res.aligned).toBeLessThanOrEqual(50); // fewer if fewer songs share any n-gram
    expect(res.hits[0].lib).toBe(lib[123]);
  });

  it("always aligns files the user added, whatever the prefilter says", () => {
    const mine = library(1, 99)[0];
    const res = searchIndexed(mine.fp, lib, index, [mine], 10);
    expect(res.aligned).toBeLessThanOrEqual(11);
    expect(res.hits[0].lib).toBe(mine);
  });

  it("aligns everything when the library is small or the melody is shorter than one n-gram", () => {
    const small = lib.slice(0, 20);
    expect(searchIndexed(small[0].fp, small, NgramIndex.build(small.map((e) => e.fp)), [], 50))
      .toEqual({ hits: searchLibrary(small[0].fp, small), aligned: 20, prefiltered: false });
    expect(searchIndexed({ iv: [1, 2, 3], rh: [0, 0, 0] }, lib, index).prefiltered).toBe(false);
  });
});
