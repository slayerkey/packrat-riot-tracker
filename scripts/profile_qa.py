#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / "com.packrat.valorant-tracker.sdPlugin"
manifest = json.loads((PLUGIN / "manifest.json").read_text(encoding="utf-8"))
action_uuids = {action["UUID"] for action in manifest.get("Actions", [])}
errors: list[str] = []

for path in sorted((ROOT / "profiles").glob("*.json")):
    data = json.loads(path.read_text(encoding="utf-8"))
    grid = data.get("grid", {})
    columns = grid.get("columns")
    rows = grid.get("rows")
    keys = data.get("keys", [])
    if not isinstance(columns, int) or not isinstance(rows, int) or columns <= 0 or rows <= 0:
        errors.append(f"{path.name}: invalid grid")
        continue
    seen: set[tuple[int, int]] = set()
    for key in keys:
        position = (key.get("row"), key.get("column"))
        if not all(isinstance(value, int) for value in position):
            errors.append(f"{path.name}: invalid key position {position}")
            continue
        row, column = position
        if not (0 <= row < rows and 0 <= column < columns):
            errors.append(f"{path.name}: out-of-grid key {position}")
        if position in seen:
            errors.append(f"{path.name}: duplicate key {position}")
        seen.add(position)
        if key.get("action") not in action_uuids:
            errors.append(f"{path.name}: unknown action {key.get('action')}")
        settings = key.get("settings", {})
        if isinstance(settings, dict):
            forbidden = {"apiKey", "riotId", "region"}.intersection(settings)
            if forbidden:
                errors.append(f"{path.name}: duplicates global account fields {sorted(forbidden)}")
            slot = settings.get("slot")
            if slot is not None and slot not in {1, 2, 3, 4, 5}:
                errors.append(f"{path.name}: unsupported slot {slot}")
    if len(keys) > columns * rows:
        errors.append(f"{path.name}: too many keys for grid")
    print(f"PROFILE QA {path.name}: {len(keys)} keys in {columns}x{rows}")

if errors:
    for error in errors:
        print(f"PROFILE QA FAIL: {error}", file=sys.stderr)
    sys.exit(1)
print("PROFILE QA PASS")
