#!/usr/bin/env node
/**
 * Extract a subset of OpenAPI operations by tag or operationId.
 * Usage:
 *   node tools/extract-openapi-operation.mjs --tag Auth
 *   node tools/extract-openapi-operation.mjs --operationId login
 *   node tools/extract-openapi-operation.mjs --tag Auth --out /tmp/auth.yaml
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const ROOT = resolve(import.meta.dirname, "..");
const OPENAPI_PATH = resolve(ROOT, "backend_doc/contracts/openapi.yaml");

function parseArgs(argv) {
  const args = { tag: null, operationId: null, out: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--tag") args.tag = argv[++i];
    else if (argv[i] === "--operationId") args.operationId = argv[++i];
    else if (argv[i] === "--out") args.out = argv[++i];
    else if (argv[i] === "--help" || argv[i] === "-h") args.help = true;
  }
  return args;
}

function collectRefs(obj, refs = new Set()) {
  if (obj === null || typeof obj !== "object") return refs;
  if (Array.isArray(obj)) {
    for (const item of obj) collectRefs(item, refs);
    return refs;
  }
  if ("$ref" in obj && typeof obj.$ref === "string") {
    refs.add(obj.$ref);
  }
  for (const value of Object.values(obj)) collectRefs(value, refs);
  return refs;
}

function resolveComponentRefs(spec, refs) {
  const resolved = new Set();
  const queue = [...refs];
  while (queue.length > 0) {
    const ref = queue.pop();
    if (!ref?.startsWith("#/components/") || resolved.has(ref)) continue;
    resolved.add(ref);
    const pathParts = ref.slice(2).split("/");
    let node = spec;
    for (const part of pathParts) node = node?.[part];
    if (node) {
      for (const nested of collectRefs(node)) {
        if (nested.startsWith("#/components/") && !resolved.has(nested)) queue.push(nested);
      }
    }
  }
  return resolved;
}

function extractByTag(spec, tag) {
  const paths = {};
  for (const [pathKey, pathItem] of Object.entries(spec.paths ?? {})) {
    const filteredMethods = {};
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!operation || typeof operation !== "object" || !("tags" in operation)) continue;
      if (operation.tags?.includes(tag)) filteredMethods[method] = operation;
    }
    if (Object.keys(filteredMethods).length > 0) paths[pathKey] = filteredMethods;
  }
  return paths;
}

function extractByOperationId(spec, operationId) {
  const paths = {};
  for (const [pathKey, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (operation?.operationId === operationId) {
        paths[pathKey] = { [method]: operation };
        return paths;
      }
    }
  }
  return paths;
}

function buildSlice(spec, paths) {
  const slice = {
    openapi: spec.openapi,
    info: spec.info,
    servers: spec.servers,
    paths,
    tags: spec.tags?.filter((t) => {
      const name = typeof t === "string" ? t : t.name;
      return Object.values(paths).some((pi) =>
        Object.values(pi).some((op) => op.tags?.includes(name))
      );
    })
  };

  const refs = collectRefs(slice);
  const componentRefs = resolveComponentRefs(spec, refs);
  const components = {};
  for (const ref of componentRefs) {
    const [, , section, name] = ref.split("/");
    components[section] ??= {};
    components[section][name] = spec.components?.[section]?.[name];
  }
  if (Object.keys(components).length > 0) slice.components = components;
  return slice;
}

const args = parseArgs(process.argv);
if (args.help || (!args.tag && !args.operationId)) {
  console.log(`Usage: node tools/extract-openapi-operation.mjs --tag <Tag> [--out file]
       node tools/extract-openapi-operation.mjs --operationId <id> [--out file]`);
  process.exit(args.help ? 0 : 1);
}

const spec = parseYaml(readFileSync(OPENAPI_PATH, "utf8"));
const paths = args.tag ? extractByTag(spec, args.tag) : extractByOperationId(spec, args.operationId);

if (Object.keys(paths).length === 0) {
  console.error(`No operations found for ${args.tag ? `tag=${args.tag}` : `operationId=${args.operationId}`}`);
  process.exit(1);
}

const slice = buildSlice(spec, paths);
const output = stringifyYaml(slice);

if (args.out) {
  writeFileSync(args.out, output, "utf8");
  console.error(`Wrote ${Object.keys(paths).length} path(s) to ${args.out}`);
} else {
  process.stdout.write(output);
}
