import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import YAML from "yaml";

const pairs = [
  ["backend_doc/contracts/openapi.yaml", "packages/contracts-http/openapi.yaml", "openapi", "3.1.1"],
  ["backend_doc/contracts/asyncapi.yaml", "packages/contracts-events/asyncapi.yaml", "asyncapi", "3.1.0"]
];

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

for (const [source, workspaceCopy, versionField, expectedVersion] of pairs) {
  const parsed = YAML.parse(readFileSync(source, "utf8"));
  if (parsed?.[versionField] !== expectedVersion) {
    throw new Error(`${source} must declare ${versionField}: ${expectedVersion}`);
  }

  const sourceHash = sha256(source);
  const copyHash = sha256(workspaceCopy);
  if (sourceHash !== copyHash) {
    throw new Error(`${workspaceCopy} drifted from ${source}`);
  }

  console.log(`${source} ok (${versionField} ${expectedVersion})`);
}
