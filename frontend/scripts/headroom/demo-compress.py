"""Demo headroom_compress on large content (same logic as MCP tool)."""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path

from headroom.ccr.mcp_server import HeadroomMCPServer


def compress_and_report(label: str, content: str, out_dir: Path) -> dict:
    server = HeadroomMCPServer(check_proxy=False)
    result = server._compress_content(content)
    payload = {
        "demo_type": label,
        "original_chars": len(content),
        "original_tokens": result["original_tokens"],
        "compressed_chars": len(result["compressed"]),
        "compressed_tokens": result["compressed_tokens"],
        "tokens_saved": result["tokens_saved"],
        "savings_percent": result["savings_percent"],
        "hash": result["hash"],
        "transforms": result["transforms"],
        "compressed_preview": result["compressed"][:4000],
    }
    safe_label = label.replace("/", "-").replace("\\", "-")
    out_path = out_dir / f"compress-demo-{safe_label}.json"
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n=== {label} ===")
    print(f"original_tokens:  {result['original_tokens']:,}")
    print(f"compressed_tokens:{result['compressed_tokens']:,}")
    print(f"tokens_saved:     {result['tokens_saved']:,}")
    print(f"savings_percent:  {result['savings_percent']}%")
    print(f"hash:             {result['hash']}")
    print(f"transforms:       {result['transforms']}")
    print(f"written:          {out_path}")
    return payload


def main() -> None:
    out_dir = Path(__file__).resolve().parent / "logs"
    out_dir.mkdir(parents=True, exist_ok=True)

    # 1) Real large spec file (prose markdown — often noop)
    spec_path = Path(__file__).resolve().parents[2] / "frontend_doc" / "00_FRONTEND_IMPLEMENTATION_SPEC_ENTERPRISE_GRADE_v2.0.md"
    if spec_path.exists():
        compress_and_report("frontend_spec_md", spec_path.read_text(encoding="utf-8"), out_dir)

    # 2) Simulated grep/search output (typical tool output — compresses well)
    lines: list[str] = []
    for i in range(1, 2501):
        lines.append(f"{i}:42:import {{ useState, useEffect, useCallback }} from 'react'")
        lines.append(f"{i+1}:88:export function Handler{i}() {{")
        lines.append(f"{i+2}:12:  const [data, setData] = useState(null)")
        lines.append(f"{i+3}:55:  useEffect(() => {{ fetch('/api/items/{i}') }}, [])")
        lines.append(f"{i+4}:99:  return <div className='container'>{{data?.name}}</div>")
    grep_content = "\n".join(lines)
    grep_result = compress_and_report("simulated_grep_output", grep_content, out_dir)

    # Return hash for retrieve demo
    print("\nRETRIEVE_HASH", grep_result["hash"], file=sys.stderr)


if __name__ == "__main__":
    main()
