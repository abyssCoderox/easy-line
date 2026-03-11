#!/usr/bin/env python3
"""Find candidate source docs for the demo vibecoding spec generator skill."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

HEADING_RE = re.compile(r"^(#{1,4})\s+(.+?)\s*$")

DOC_TYPES = {
    "requirement": ["需求", "requirement", "prd", "spec"],
    "architecture": ["架构", "architecture", "系统设计", "设计文档"],
    "database": ["数据库", "database", "db", "data"],
    "api": ["api", "接口"],
    "security": ["安全", "security"],
    "plan": ["计划", "milestone", "roadmap"],
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Discover candidate input docs for spec generation."
    )
    parser.add_argument(
        "--project-root",
        default=".",
        help="Project root to scan. Defaults to current directory.",
    )
    parser.add_argument(
        "--format",
        choices=("json", "markdown"),
        default="markdown",
        help="Output format.",
    )
    return parser.parse_args()


def read_text(path: Path) -> str:
    for encoding in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return path.read_text(encoding=encoding)
        except UnicodeDecodeError:
            continue
    raise UnicodeDecodeError("unknown", b"", 0, 1, f"Cannot decode {path}")


def extract_headings(text: str) -> list[str]:
    headings: list[str] = []
    for line in text.splitlines():
        match = HEADING_RE.match(line.strip())
        if match:
            headings.append(match.group(2).strip())
    return headings


def match_doc_type(path: Path) -> tuple[str, list[str]]:
    haystack = str(path).lower()
    matched_types: list[str] = []
    for doc_type, keywords in DOC_TYPES.items():
        if any(keyword.lower() in haystack for keyword in keywords):
            matched_types.append(doc_type)
    if not matched_types:
        return "other", []
    return matched_types[0], matched_types


def discover(project_root: Path) -> dict:
    docs_dir = project_root / "docs"
    candidates = []
    if docs_dir.exists():
        for path in sorted(docs_dir.rglob("*.md")):
            doc_type, tags = match_doc_type(path)
            if doc_type == "other":
                continue
            text = read_text(path)
            headings = extract_headings(text)
            candidates.append(
                {
                    "type": doc_type,
                    "path": path.relative_to(project_root).as_posix(),
                    "matched_tags": tags,
                    "heading_count": len(headings),
                    "sample_headings": headings[:8],
                }
            )

    type_counts: dict[str, int] = {}
    for item in candidates:
        type_counts[item["type"]] = type_counts.get(item["type"], 0) + 1

    ambiguous_types = sorted(doc_type for doc_type, count in type_counts.items() if count > 1)

    return {
        "project_root": str(project_root.resolve()),
        "root_has_agents": (project_root / "AGENTS.md").exists(),
        "ambiguous_types": ambiguous_types,
        "candidates": candidates,
    }


def render_markdown(data: dict) -> str:
    lines = [
        "# Candidate Source Docs",
        "",
        f"- Project Root: `{data['project_root']}`",
        f"- Root AGENTS.md: {'present' if data['root_has_agents'] else 'missing'}",
        f"- Ambiguous Types: {', '.join(data['ambiguous_types']) if data['ambiguous_types'] else 'none'}",
        "",
        "| Type | Path | Headings |",
        "| --- | --- | --- |",
    ]
    for item in data["candidates"]:
        lines.append(f"| {item['type']} | `{item['path']}` | {item['heading_count']} |")
    return "\n".join(lines)


def main() -> None:
    args = parse_args()
    data = discover(Path(args.project_root).resolve())
    if args.format == "json":
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        print(render_markdown(data))


if __name__ == "__main__":
    main()
