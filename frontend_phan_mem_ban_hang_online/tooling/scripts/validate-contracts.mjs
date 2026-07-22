import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const frontendRoot = fileURLToPath(new URL("../..", import.meta.url));

function readYaml(path) {
  return YAML.parse(readFileSync(path, "utf8"));
}

let failed = false;

function check(condition, message) {
  if (!condition) {
    console.error(`✗ ${message}`);
    failed = true;
  } else {
    console.log(`✓ ${message}`);
  }
}

const tenantApi = readYaml(`${frontendRoot}/contracts/openapi/tenant-api.yaml`);
check(typeof tenantApi.paths === "object" && Object.keys(tenantApi.paths).length > 0, "tenant-api.yaml has a non-empty paths object");

const opsApi = readYaml(`${frontendRoot}/contracts/openapi/ops-api.yaml`);
check(typeof opsApi.paths === "object" && Object.keys(opsApi.paths).length > 0, "ops-api.yaml has a non-empty paths object");

const tenantEvents = readYaml(`${frontendRoot}/contracts/asyncapi/tenant-events.yaml`);
check(typeof tenantEvents.channels === "object", "tenant-events.yaml has a channels object");

const permissionMatrix = readYaml(`${frontendRoot}/contracts/permissions/permission-matrix.yaml`);
check(Array.isArray(permissionMatrix.permissions) && permissionMatrix.permissions.length > 0, "permission-matrix.yaml has a non-empty permissions array");

const errorCatalog = readYaml(`${frontendRoot}/contracts/errors/error-catalog.yaml`);
check(Array.isArray(errorCatalog.errors) && errorCatalog.errors.length > 0, "error-catalog.yaml has a non-empty errors array");

if (failed) {
  console.error("\ncontracts:validate FAILED");
  process.exit(1);
}
console.log("\ncontracts:validate passed");
