#!/usr/bin/env node
/**
 * W4: emit inventory/data_dictionary_coverage.csv from data-dictionary.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dictPath = path.join(root, "docs/data/data-dictionary.md");
const outPath = path.join(
  root,
  "docs/enterprise-freeze/inventory/data_dictionary_coverage.csv",
);

const text = fs.readFileSync(dictPath, "utf8");
const rows = [];
for (const line of text.split(/\r?\n/)) {
  const m = line.match(/^\| `([a-z_]+)` \| ([^|]+) \| ([^|]+) \|/);
  if (!m) continue;
  const table = m[1];
  const klass = m[2].trim().replace(/\*\*/g, "");
  const status = m[3].trim();
  const needs = /Needs confirmation/i.test(klass) ? "yes" : "no";
  const rls =
    status.startsWith("**Done") || status.startsWith("Done")
      ? "done"
      : "not_started";
  rows.push({
    table,
    class: klass.replaceAll(",", ";"),
    rls_status: rls,
    needs_confirmation: needs,
    freeze_status: "frozen",
  });
}

const header =
  "table,class,rls_status,needs_confirmation,freeze_status";
const body = rows
  .map((r) =>
    [r.table, r.class, r.rls_status, r.needs_confirmation, r.freeze_status].join(
      ",",
    ),
  )
  .join("\n");
fs.writeFileSync(outPath, `${header}\n${body}\n`);

const needs = rows.filter((r) => r.needs_confirmation === "yes").length;
const done = rows.filter((r) => r.rls_status === "done").length;
console.log(
  JSON.stringify(
    { tables: rows.length, needs_confirmation: needs, rls_done: done, outPath },
    null,
    2,
  ),
);
if (needs !== 0) process.exit(1);
