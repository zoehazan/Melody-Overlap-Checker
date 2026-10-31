/* Writes indexer/tests/fixtures/parity.json. Run with: npm run build:py-parity-fixture */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildPyParityFixture } from "../test/py-parity-fixture";

const out = fileURLToPath(new URL("../../indexer/tests/fixtures/parity.json", import.meta.url));
writeFileSync(out, JSON.stringify(buildPyParityFixture()) + "\n");
console.log(`Wrote ${out}`);
