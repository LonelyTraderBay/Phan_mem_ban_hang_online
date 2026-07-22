import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

/**
 * Generates schema-valid MSW handler descriptors from contracts/openapi/*.yaml (FE-F00-009 step 3:
 * "schema-valid fixtures"). At this stage of the backend contract, ~95% of responses use one of
 * two generic envelope schemas (GenericListResponse / GenericDataResponse) rather than real,
 * per-resource schemas — so fixtures here are honestly generic (empty list / one placeholder
 * resource with only the fields the contract actually guarantees), never invented business data
 * (spec 2.2). Operations this generator cannot honestly stub are skipped and reported, not
 * silently dropped.
 */

const frontendRoot = fileURLToPath(new URL("../..", import.meta.url));

const FIXTURE_RESOURCE = {
  id: "fixture_00000000-0000-0000-0000-000000000000",
  version: 1,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function bodyForSchemaRef(ref) {
  if (ref === "#/components/schemas/GenericListResponse") {
    return { data: [], page_info: { next_cursor: null, has_more: false }, meta: { request_id: "req_fixture" } };
  }
  if (ref === "#/components/schemas/GenericDataResponse") {
    return { data: FIXTURE_RESOURCE, meta: { request_id: "req_fixture" } };
  }
  return undefined;
}

function toMswPath(openApiPath) {
  return openApiPath.replace(/\{([^}]+)\}/g, ":$1");
}

function successStatus(responses) {
  for (const status of ["200", "201"]) {
    if (responses[status]) return { status: Number(status), response: responses[status] };
  }
  if (responses["204"]) return { status: 204, response: responses["204"] };
  return null;
}

function generateForDocument(doc, apiBaseUrl) {
  const descriptors = [];
  const skipped = [];

  for (const [path, pathItem] of Object.entries(doc.paths ?? {})) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      const operation = pathItem[method];
      if (!operation) continue;

      const found = successStatus(operation.responses ?? {});
      if (!found) {
        skipped.push(`${method.toUpperCase()} ${path} (${operation.operationId ?? "unknown"}): no 2xx response`);
        continue;
      }

      if (found.status === 204) {
        descriptors.push({ method, path: toMswPath(path), status: 204, body: null, apiBaseUrl });
        continue;
      }

      const ref = found.response?.content?.["application/json"]?.schema?.$ref;
      const body = ref ? bodyForSchemaRef(ref) : undefined;
      if (body === undefined) {
        skipped.push(
          `${method.toUpperCase()} ${path} (${operation.operationId ?? "unknown"}): unrecognized response schema ${ref ?? "(none)"}`,
        );
        continue;
      }

      descriptors.push({ method, path: toMswPath(path), status: found.status, body, apiBaseUrl });
    }
  }

  return { descriptors, skipped };
}

const tenantDoc = YAML.parse(readFileSync(`${frontendRoot}/contracts/openapi/tenant-api.yaml`, "utf8"));
const opsDoc = YAML.parse(readFileSync(`${frontendRoot}/contracts/openapi/ops-api.yaml`, "utf8"));

const tenant = generateForDocument(tenantDoc, "/api");
const ops = generateForDocument(opsDoc, "/ops-api");

const allDescriptors = [...tenant.descriptors, ...ops.descriptors];
const allSkipped = [...tenant.skipped, ...ops.skipped];

const banner =
  "// GENERATED — do not hand-edit. Source: contracts/openapi/*.yaml (via generate-msw-fixtures.mjs).\n" +
  "// Run 'node tooling/scripts/generate-msw-fixtures.mjs' to refresh.\n\n";

const ts = `${banner}export interface HandlerDescriptor {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  status: number;
  body: unknown;
  apiBaseUrl: string;
}

export const handlerDescriptors: HandlerDescriptor[] = ${JSON.stringify(allDescriptors, null, 2)};
`;

const outDir = `${frontendRoot}/packages/test-utils/src/msw/generated`;
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/handlerDescriptors.ts`, ts, "utf8");

console.log(`Generated ${allDescriptors.length} MSW handler descriptors.`);
if (allSkipped.length > 0) {
  console.log(`Skipped ${allSkipped.length} operations (no honest generic stub available):`);
  for (const line of allSkipped) console.log(`  - ${line}`);
}
