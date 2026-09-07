#!/usr/bin/env python3
import pathlib
import re
import sys

root = pathlib.Path(__file__).resolve().parent.parent
skill = (root / "SKILL.md").read_text(encoding="utf-8")
match = re.match(r"^---\n(.*?)\n---\n", skill, re.S)
if not match:
    sys.exit("SKILL.md 缺少 YAML frontmatter")

frontmatter = match.group(1)
name = re.search(r"^name:\s*(.+)$", frontmatter, re.M)
description = re.search(r"^description:\s*(.+)$", frontmatter, re.M)
if not name or not re.fullmatch(r"[a-z0-9-]+", name.group(1).strip()):
    sys.exit("name 必须使用小写字母、数字和连字符")
if not description or not description.group(1).strip():
    sys.exit("description 不能为空")

required = [
    "README.md",
    "LICENSE",
    "agents/openai.yaml",
    "assets/example.html",
    "assets/inject-assets.mjs",
    "scripts/check-env.mjs",
    "scripts/validate-editor.mjs",
]
missing = [path for path in required if not (root / path).exists()]
if missing:
    sys.exit("缺少必要文件：" + ", ".join(missing))

public_files = [
    path for path in root.rglob("*")
    if path.is_file() and "projects" not in path.parts and path.name != "quick-validate.py"
]
blocked = ["xieluoli", "~/.claude/skills/proto-gen/assets", "~/.myagents/skills/proto-gen/assets"]
hits = []
for path in public_files:
    if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".ds_store"}:
        continue
    text = path.read_text(encoding="utf-8", errors="ignore")
    for token in blocked:
        if token in text:
            hits.append(f"{path.relative_to(root)}: {token}")
if hits:
    sys.exit("发现公开包残留：\n" + "\n".join(hits))

print("✓ Skill 元数据、必要文件和公开内容检查通过")
