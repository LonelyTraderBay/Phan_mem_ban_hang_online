import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

// Frontend-owned registry (contracts/feature-flags.yaml is hand-maintained, not synced from
// backend — see that file's header comment). This generator emits a typed, per-app flag-key
// union so `apps/super-admin` cannot even reference a flag scoped only to other apps.

const frontendRoot = fileURLToPath(new URL("../..", import.meta.url));
const doc = YAML.parse(readFileSync(`${frontendRoot}/contracts/feature-flags.yaml`, "utf8"));

const flags = doc.flags ?? [];
const appNames = [...new Set(flags.flatMap((flag) => flag.apps ?? []))].sort();

const allKeysUnion = flags.map((f) => `  | "${f.key}"`).join("\n") || "  | never";
const perAppUnions = appNames
  .map((app) => {
    const keysForApp = flags.filter((f) => (f.apps ?? []).includes(app)).map((f) => `  | "${f.key}"`);
    return `export type FeatureFlagKeyFor${capitalize(app)} =\n${keysForApp.join("\n") || "  never"};`;
  })
  .join("\n\n");

function capitalize(value) {
  return value.replace(/(^|-)([a-z])/g, (_match, _sep, char) => char.toUpperCase());
}

const banner =
  "// GENERATED — do not hand-edit. Source: contracts/feature-flags.yaml.\n" +
  "// Run 'node tooling/scripts/generate-feature-flags.mjs' to refresh.\n\n";

const ts = `${banner}export type FeatureFlagKey =\n${allKeysUnion};\n\n${perAppUnions}\n`;

mkdirSync(`${frontendRoot}/packages/feature-flags/src/generated`, { recursive: true });
writeFileSync(`${frontendRoot}/packages/feature-flags/src/generated/featureFlagKeys.ts`, ts, "utf8");
console.log(`wrote ${frontendRoot}/packages/feature-flags/src/generated/featureFlagKeys.ts`);
