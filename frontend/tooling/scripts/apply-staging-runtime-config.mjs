#!/usr/bin/env node
/**
 * Copy runtime-config.staging.json → runtime-config.json before a staging build/deploy.
 * Usage: node tooling/scripts/apply-staging-runtime-config.mjs web-admin|super-admin
 */
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = process.argv[2];
if (app !== "web-admin" && app !== "super-admin") {
  console.error("Usage: node tooling/scripts/apply-staging-runtime-config.mjs web-admin|super-admin");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dir = path.join(root, "apps", app, "public");
const src = path.join(dir, "runtime-config.staging.json");
const dest = path.join(dir, "runtime-config.json");
if (!existsSync(src)) {
  console.error(`Missing ${src}`);
  process.exit(1);
}
copyFileSync(src, dest);
console.log(`Applied staging runtime-config → apps/${app}/public/runtime-config.json`);
