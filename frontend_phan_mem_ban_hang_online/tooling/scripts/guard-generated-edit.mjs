#!/usr/bin/env node
// PreToolUse hook (Edit|Write) — blocks hand-edits to generated code and to the subset of
// contracts/ that's synced from backend (see docs/ARTEFACT_STATUS.md and
// .claude/rules/contracts-codegen.md). Reads the Claude Code hook JSON from stdin and denies via
// hookSpecificOutput.permissionDecision when the target path matches a protected pattern.

import { relative } from "node:path";

const GENERATED_MARKERS = ["/src/generated/", "/src/msw/generated/"];

const SYNCED_CONTRACT_PREFIXES = [
  "contracts/openapi/",
  "contracts/asyncapi/",
  "contracts/permissions/",
  "contracts/errors/",
];

function toPosixRelative(filePath, projectDir) {
  const rel = projectDir ? relative(projectDir, filePath) : filePath;
  return rel.split("\\").join("/");
}

function classify(relPath) {
  if (GENERATED_MARKERS.some((marker) => relPath.includes(marker))) {
    return {
      blocked: true,
      reason:
        `"${relPath}" is generated code — never hand-edit it. Regenerate via ` +
        `'pnpm contracts:sync && pnpm codegen:api' (or the owning package's own 'codegen' ` +
        `script) and commit the diff. See .claude/rules/contracts-codegen.md.`,
    };
  }
  if (SYNCED_CONTRACT_PREFIXES.some((prefix) => relPath.startsWith(prefix))) {
    return {
      blocked: true,
      reason:
        `"${relPath}" is synced from the backend contract (see docs/ARTEFACT_STATUS.md) — ` +
        `hand-editing it will just be overwritten/inconsistent on the next sync. Run ` +
        `'pnpm contracts:sync' instead. (contracts/feature-flags.yaml is the one frontend-owned, ` +
        `hand-maintained exception under contracts/.)`,
    };
  }
  return { blocked: false };
}

let input = "";
process.stdin.on("data", (chunk) => {
  input += chunk;
});

process.stdin.on("end", () => {
  try {
    const hook = JSON.parse(input || "{}");

    if (!["Edit", "Write"].includes(hook.tool_name)) {
      process.exit(0);
    }

    const filePath = hook.tool_input?.file_path;
    if (!filePath) {
      process.exit(0);
    }

    const relPath = toPosixRelative(filePath, hook.cwd || process.env.CLAUDE_PROJECT_DIR);
    const result = classify(relPath);

    if (result.blocked) {
      console.log(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: result.reason,
          },
        }),
      );
    }

    process.exit(0);
  } catch (err) {
    // Fail open: a hook bug should never be able to block all edits repo-wide.
    console.error(`guard-generated-edit hook error (allowing edit): ${err.message}`);
    process.exit(0);
  }
});
