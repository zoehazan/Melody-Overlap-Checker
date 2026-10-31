/* web/public is copied into the deployed site, so it must never hold MIDI or private indexes. */
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PRIVATE_FILE, privateFiles } from "../vite.config";

describe("deploy guard", () => {
  it("web/public holds nothing private right now", () => {
    expect(privateFiles(fileURLToPath(new URL("../public", import.meta.url)))).toEqual([]);
  });

  it("recognises MIDI files and private indexes", () => {
    for (const f of ["song.mid", "x/Song.MIDI", "lakh-index.json.gz", "lmd_matched.tar.gz", "lakh-songs.tsv", "my-index.json"])
      expect(PRIVATE_FILE.test(f), f).toBe(true);
  });

  it("lets the public domain library through", () => {
    for (const f of ["pd-library.json", "pd-library/mutopia-pd.json", "pd-library/CREDITS.txt", "pd-library/seed.json"])
      expect(PRIVATE_FILE.test(f), f).toBe(false);
  });
});
