# Headroom setup for this project

Headroom is a local AI-context compression layer for this frontend project.
It is not a UI library. Use it to reduce token usage while building the sales
application with Cursor, Codex CLI, or future backend AI features.

## Recommended setup on this machine

Current environment checked:

- Python 3.12 is available.
- Node.js and npm are available.
- Docker is not installed.
- Rust/Cargo are installed.
- Visual Studio Build Tools 2022 with C++ tools is installed.
- Headroom is installed in `.venv-headroom`.

If you ever need to reinstall on a clean Windows machine, Headroom may build
native Rust/C++ pieces. Install these prerequisites first:

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools
winget install Rustlang.Rustup
```

In Visual Studio Build Tools, select:

- Desktop development with C++
- MSVC build tools
- Windows SDK

Then open a fresh PowerShell and run:

```powershell
rustup default stable-x86_64-pc-windows-msvc
```

## Install Headroom CLI/proxy

From the project root:

```powershell
.\scripts\headroom\setup-headroom.ps1
```

This creates `.venv-headroom`, installs `headroom-ai[proxy,code,memory]`, and
writes `.cursor/mcp.json` for Cursor MCP integration.

Current installed package:

```text
headroom-ai 0.27.0
```

## Cursor subscription workflow (recommended)

If you use **Cursor subscription** (no BYOK API key), Agent/Composer traffic
does **not** route through the Headroom proxy. Use this workflow instead:

### Daily workflow

1. Start Headroom for Cursor (each work session):

```powershell
.\scripts\headroom\run-cursor-through-headroom.ps1
```

This starts a **balanced** proxy (`agent-50`), enables memory and live learning,
and injects token-optimized instructions into the project.

2. Restart Cursor and verify MCP:

- Settings → MCP → server `headroom` connected with 3 tools:
  `headroom_compress`, `headroom_retrieve`, `headroom_stats`

3. Use Cursor Agent normally. The agent rule at
   `.cursor/rules/headroom-compression.mdc` prompts compression of large
   outputs via MCP.

4. For heavy agent tasks, use Codex CLI with shared memory:

```powershell
.\scripts\headroom\run-codex-through-headroom.ps1 -- "implement feature X"
```

### What works with Cursor subscription

| Feature | How | Profile |
|---------|-----|---------|
| MCP on-demand compression | `.cursor/mcp.json` + agent rule | local, no BYOK |
| Memory + learn | `run-cursor-through-headroom.ps1` | balanced |
| Codex CLI full proxy | `run-codex-through-headroom.ps1` | max-savings |
| Dashboard / stats | `headroom dashboard` | both |

### What does NOT work with Cursor subscription

- Override Base URL / BYOK for Agent mode (Agent uses Cursor backend)
- Composer, inline edit (Ctrl+K), tab autocomplete through Headroom
- Sub-agents routing through Headroom proxy

Do **not** configure Override Base URL unless you switch to BYOK later.

Re-install MCP config only (regenerates machine-specific `.cursor/mcp.json`):

```powershell
.\scripts\headroom\install-headroom-mcp-cursor.ps1
```

Proxy only (balanced, background):

```powershell
.\scripts\headroom\start-headroom-for-cursor.ps1
```

Health check:

```powershell
Invoke-RestMethod http://localhost:8787/health
```

Dashboard:

```powershell
.\.venv-headroom\Scripts\Activate.ps1
headroom dashboard
```

## Codex CLI workflow (max-savings)

For Codex CLI, all traffic routes through the proxy automatically:

```powershell
.\scripts\headroom\run-codex-through-headroom.ps1
```

With an initial prompt:

```powershell
.\scripts\headroom\run-codex-through-headroom.ps1 -- "create the frontend from frontend_doc spec"
```

Proxy only (max-savings):

```powershell
.\scripts\headroom\start-headroom-proxy.ps1
```

The max-savings profile uses:

- `agent-90` savings profile
- `token` mode
- code-aware compression
- memory enabled
- output shaping enabled
- local telemetry disabled

## Profiles

Two profiles are defined in `scripts/headroom/headroom-env.ps1`:

| Profile | Use case | Savings target | Mode |
|---------|----------|----------------|------|
| `balanced` | Cursor MCP + learn | ~55% | cache |
| `max-savings` | Codex CLI | ~90% | token |

Both use `HEADROOM_ACCURACY_GUARD=strict`.

## Stop the proxy

```powershell
.\scripts\headroom\stop-headroom-proxy.ps1
```

## BYOK (optional, later)

If you later add an OpenAI or Anthropic API key to Cursor:

```text
Settings > Models > OpenAI API Key > Advanced > Override Base URL
http://127.0.0.1:8787/v1
```

Start the balanced proxy first:

```powershell
.\scripts\headroom\start-headroom-for-cursor.ps1
```

Note: Agent mode with BYOK still has known Cursor limitations (Responses API
format, sub-agents not inheriting base URL). MCP + hybrid Codex remain the
most reliable path.

For Anthropic-compatible tools (Claude Code):

```text
ANTHROPIC_BASE_URL=http://127.0.0.1:8787
```

Chain a custom upstream through Headroom:

```powershell
$env:OPENAI_TARGET_API_URL = "https://your-provider.example/v1"
.\scripts\headroom\start-headroom-for-cursor.ps1
```

## Node/TypeScript app integration

Only do this after the project has a real `package.json`:

```powershell
npm install headroom-ai openai
```

Example:

```ts
import OpenAI from "openai";
import { withHeadroom } from "headroom-ai/openai";

const client = withHeadroom(new OpenAI(), {
  baseUrl: "http://localhost:8787",
});
```

The proxy must be running before the TypeScript SDK can compress messages.

## Verification checklist

1. `Invoke-RestMethod http://localhost:8787/health` → healthy
2. Cursor Settings → MCP → `headroom` connected (3 tools)
3. Prompt test: ask Agent to analyze a large file → should call `headroom_compress`
4. `headroom dashboard` → compression events visible
5. Codex via `run-codex-through-headroom.ps1` → shared memory at `.headroom/`

## Expected savings

- Cursor Agent via MCP: roughly 20–40% on sessions with large tool outputs
- Codex CLI via proxy: up to ~90% with `agent-90` profile
- `--learn` writes patterns to `.cursor/rules/` — review before committing
