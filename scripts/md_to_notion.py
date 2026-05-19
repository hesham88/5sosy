"""Convert 5sosy_Notion.md into batched Notion block JSON for the API."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "5sosy_Notion.md"
OUT = ROOT / "scripts" / "notion_batches.json"

HEADING_MAP = {2: "heading_1", 3: "heading_2", 4: "heading_3", 5: "heading_3"}


def rich_text(s: str) -> list[dict]:
    """Tokenize inline markdown into Notion rich_text spans."""
    if not s:
        return []
    # Order matters: bold before italic to avoid stealing **; code is greedy.
    tokens: list[tuple[str, str]] = []
    i = 0
    n = len(s)
    while i < n:
        # inline code
        if s[i] == "`":
            j = s.find("`", i + 1)
            if j != -1:
                tokens.append(("code", s[i + 1 : j]))
                i = j + 1
                continue
        # bold
        if s.startswith("**", i):
            j = s.find("**", i + 2)
            if j != -1:
                tokens.append(("bold", s[i + 2 : j]))
                i = j + 2
                continue
        # italic *...*  (not ** which we already handled)
        if s[i] == "*" and not s.startswith("**", i):
            j = s.find("*", i + 1)
            if j != -1 and not s.startswith("**", j):
                tokens.append(("italic", s[i + 1 : j]))
                i = j + 1
                continue
        # italic _..._  — but only if surrounded by word boundaries (avoid file_paths)
        if s[i] == "_" and (i == 0 or not s[i - 1].isalnum()):
            j = s.find("_", i + 1)
            if j != -1 and (j + 1 == n or not s[j + 1].isalnum()):
                tokens.append(("italic", s[i + 1 : j]))
                i = j + 1
                continue
        # link [text](url)
        if s[i] == "[":
            m = re.match(r"\[([^\]]+)\]\(([^)]+)\)", s[i:])
            if m:
                tokens.append(("link", m.group(1), m.group(2)))
                i += m.end()
                continue
        # plain run
        start = i
        while i < n and s[i] not in "`*_[":
            i += 1
        if i == start:
            # Lone special char, take it literally
            tokens.append(("plain", s[start : start + 1]))
            i = start + 1
        else:
            tokens.append(("plain", s[start:i]))

    out: list[dict] = []
    for tok in tokens:
        kind = tok[0]
        content = tok[1]
        if not content:
            continue
        ann = {"bold": False, "italic": False, "code": False}
        link = None
        if kind == "bold":
            ann["bold"] = True
        elif kind == "italic":
            ann["italic"] = True
        elif kind == "code":
            ann["code"] = True
        elif kind == "link":
            link = {"url": tok[2]}
        out.append(
            {
                "type": "text",
                "text": {"content": content, "link": link},
                "annotations": ann,
            }
        )
    return out


def heading_block(level: int, text: str) -> dict:
    btype = HEADING_MAP.get(level, "heading_3")
    return {
        "object": "block",
        "type": btype,
        btype: {"rich_text": rich_text(text)},
    }


def paragraph_block(text: str) -> dict:
    return {
        "object": "block",
        "type": "paragraph",
        "paragraph": {"rich_text": rich_text(text)},
    }


def quote_block(text: str) -> dict:
    return {
        "object": "block",
        "type": "quote",
        "quote": {"rich_text": rich_text(text)},
    }


def bullet_block(text: str) -> dict:
    return {
        "object": "block",
        "type": "bulleted_list_item",
        "bulleted_list_item": {"rich_text": rich_text(text)},
    }


def todo_block(text: str, checked: bool) -> dict:
    return {
        "object": "block",
        "type": "to_do",
        "to_do": {"rich_text": rich_text(text), "checked": checked},
    }


def divider_block() -> dict:
    return {"object": "block", "type": "divider", "divider": {}}


def code_block(text: str, language: str = "plain text") -> dict:
    lang_map = {
        "": "plain text",
        "ascii": "plain text",
        "mermaid": "mermaid",
        "ts": "typescript",
        "py": "python",
        "json": "json",
        "bash": "bash",
        "sh": "shell",
        "yaml": "yaml",
        "html": "html",
    }
    lang = lang_map.get(language.strip().lower(), language.strip().lower() or "plain text")
    return {
        "object": "block",
        "type": "code",
        "code": {
            "rich_text": [
                {
                    "type": "text",
                    "text": {"content": text, "link": None},
                    "annotations": {"code": False},
                }
            ],
            "language": lang,
        },
    }


def table_block(rows: list[list[str]], has_header: bool) -> dict:
    width = max(len(r) for r in rows) if rows else 1
    norm_rows = []
    for r in rows:
        cells = [rich_text(c.strip()) for c in r]
        while len(cells) < width:
            cells.append([])
        norm_rows.append({"object": "block", "type": "table_row", "table_row": {"cells": cells}})
    return {
        "object": "block",
        "type": "table",
        "table": {
            "table_width": width,
            "has_column_header": has_header,
            "has_row_header": False,
            "children": norm_rows,
        },
    }


def toggle_block(summary: str, children: list[dict]) -> dict:
    return {
        "object": "block",
        "type": "toggle",
        "toggle": {"rich_text": rich_text(summary), "children": children},
    }


# ---------- parser ----------

def parse(lines: list[str]) -> list[dict]:
    blocks: list[dict] = []
    i = 0
    n = len(lines)
    skipped_title = False

    while i < n:
        line = lines[i].rstrip("\n")
        stripped = line.strip()

        # skip first H1 (becomes the page title)
        if not skipped_title and stripped.startswith("# ") and not stripped.startswith("## "):
            skipped_title = True
            i += 1
            continue

        # blank line
        if not stripped:
            i += 1
            continue

        # divider
        if stripped == "---":
            blocks.append(divider_block())
            i += 1
            continue

        # headings (## .. #####)
        m = re.match(r"^(#{2,6})\s+(.*)$", stripped)
        if m:
            level = len(m.group(1))
            blocks.append(heading_block(level, m.group(2).strip()))
            i += 1
            continue

        # <details> ... </details>
        if stripped.startswith("<details>"):
            i += 1
            summary = "Details"
            inner: list[str] = []
            while i < n and lines[i].strip() != "</details>":
                ln = lines[i].rstrip("\n").strip()
                sm = re.match(r"^<summary>(.*)</summary>$", ln)
                if sm:
                    summary = sm.group(1).strip()
                else:
                    inner.append(lines[i].rstrip("\n"))
                i += 1
            if i < n:
                i += 1  # consume </details>
            child_blocks = parse(inner)
            blocks.append(toggle_block(summary, child_blocks))
            continue

        # code fence
        if stripped.startswith("```"):
            lang = stripped[3:].strip()
            i += 1
            buf: list[str] = []
            while i < n and not lines[i].rstrip("\n").strip().startswith("```"):
                buf.append(lines[i].rstrip("\n"))
                i += 1
            if i < n:
                i += 1
            blocks.append(code_block("\n".join(buf), lang))
            continue

        # table: header row followed by separator row
        if stripped.startswith("|") and i + 1 < n and re.match(r"^\s*\|[\s\-:|]+\|\s*$", lines[i + 1]):
            rows = []
            # header
            header_cells = [c.strip() for c in stripped.strip("|").split("|")]
            rows.append(header_cells)
            i += 2  # skip header + separator
            while i < n and lines[i].strip().startswith("|"):
                row_cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                rows.append(row_cells)
                i += 1
            blocks.append(table_block(rows, has_header=True))
            continue

        # blockquote (one or more contiguous > lines)
        if stripped.startswith(">"):
            quote_lines = []
            while i < n and lines[i].lstrip().startswith(">"):
                ln = lines[i].lstrip()
                # strip leading "> " or ">"
                ln = re.sub(r"^>\s?", "", ln).rstrip("\n")
                quote_lines.append(ln)
                i += 1
            blocks.append(quote_block("\n".join(quote_lines).strip()))
            continue

        # to-do
        m = re.match(r"^-\s*\[( |x|X)\]\s+(.*)$", stripped)
        if m:
            checked = m.group(1).lower() == "x"
            blocks.append(todo_block(m.group(2).strip(), checked))
            i += 1
            continue

        # bullet
        if stripped.startswith("- ") or stripped.startswith("* "):
            blocks.append(bullet_block(stripped[2:].strip()))
            i += 1
            continue

        # paragraph: accumulate until blank/new-block
        para_lines = [stripped]
        i += 1
        while i < n:
            nxt = lines[i].rstrip("\n")
            ns = nxt.strip()
            if not ns:
                break
            if ns.startswith(("#", "---", ">", "|", "```", "<details>", "- ", "* ")):
                break
            if re.match(r"^-\s*\[( |x|X)\]", ns):
                break
            para_lines.append(ns)
            i += 1
        blocks.append(paragraph_block(" ".join(para_lines)))

    return blocks


def batch(blocks: list[dict], size: int = 40) -> list[list[dict]]:
    return [blocks[i : i + size] for i in range(0, len(blocks), size)]


def main() -> None:
    text = SRC.read_text(encoding="utf-8")
    lines = text.split("\n")
    blocks = parse(lines)
    batches = batch(blocks)
    OUT.write_text(json.dumps(batches, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"blocks={len(blocks)} batches={len(batches)} sizes={[len(b) for b in batches]}")


if __name__ == "__main__":
    main()
