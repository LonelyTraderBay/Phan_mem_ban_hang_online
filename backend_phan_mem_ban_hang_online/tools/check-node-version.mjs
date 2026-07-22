import { readFileSync } from "node:fs";

const expected = readFileSync(new URL("../.nvmrc", import.meta.url), "utf8").trim();
const actual = process.version.replace(/^v/, "");

if (actual !== expected) {
  console.error(`Node version mismatch: expected ${expected}, got ${actual}`);
  process.exit(1);
}

console.log(`Node version ok: ${actual}`);
