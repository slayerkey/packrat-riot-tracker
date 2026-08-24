#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import zipfile
from pathlib import Path

from build_profiles import OUTPUT_NAMES, profile_folder_id

ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / "com.packrat.valorant-tracker.sdPlugin"
manifest = json.loads((PLUGIN / "manifest.json").read_text(encoding="utf-8"))
action_uuids = {action["UUID"] for action in manifest.get("Actions", [])}
errors: list[str] = []

EXPECTED = {
    "standard": {"device_type": 0, "columns": 5, "rows": 3},
    "xl": {"device_type": 2, "columns": 8, "rows": 4},
    "neo": {"device_type": 9, "columns": 4, "rows": 2},
}


def fail(message: str) -> None:
    errors.append(message)


def check(condition: bool, message: str) -> None:
    if not condition:
        fail(message)


def load_definition(slug: str) -> dict:
    path = ROOT / "profiles" / f"{slug}.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        fail(f"{path.name}: invalid JSON: {exc}")
        return {}


def validate_definition(slug: str, data: dict) -> dict[str, dict]:
    grid = data.get("grid", {})
    columns = grid.get("columns")
    rows = grid.get("rows")
    expected = EXPECTED[slug]
    check(columns == expected["columns"] and rows == expected["rows"], f"{slug}: expected {expected['columns']}x{expected['rows']} grid")

    keys = data.get("keys", [])
    if not isinstance(keys, list):
        fail(f"{slug}: keys must be an array")
        return {}

    seen: set[tuple[int, int]] = set()
    expected_actions: dict[str, dict] = {}
    for key in keys:
        if not isinstance(key, dict):
            fail(f"{slug}: profile contains non-object key")
            continue
        row = key.get("row")
        column = key.get("column")
        if not isinstance(row, int) or not isinstance(column, int):
            fail(f"{slug}: invalid key position {(row, column)}")
            continue
        check(0 <= row < expected["rows"] and 0 <= column < expected["columns"], f"{slug}: out-of-grid key {(row, column)}")
        check((row, column) not in seen, f"{slug}: duplicate key {(row, column)}")
        seen.add((row, column))

        action_uuid = key.get("action")
        check(action_uuid in action_uuids, f"{slug}: unknown action {action_uuid}")
        settings = key.get("settings", {})
        if not isinstance(settings, dict):
            fail(f"{slug}: settings must be an object")
            settings = {}
        forbidden = {"apiKey", "riotId", "region"}.intersection(settings)
        check(not forbidden, f"{slug}: duplicates global account fields {sorted(forbidden)}")
        slot = settings.get("slot")
        check(slot is None or slot in {1, 2, 3, 4, 5}, f"{slug}: unsupported slot {slot}")
        expected_actions[f"{column},{row}"] = {"UUID": action_uuid, "Settings": settings}

    check(len(keys) <= expected["columns"] * expected["rows"], f"{slug}: too many keys for grid")
    if slug == "standard":
        check(len(keys) == 15, "standard: must fill exactly 15 keys")
    if slug == "neo":
        check(len(keys) == 8, "neo: must fill exactly 8 keys")
    return expected_actions


def validate_archive(slug: str, expected_actions: dict[str, dict]) -> None:
    path = PLUGIN / "profiles" / f"{OUTPUT_NAMES[slug]}.streamDeckProfile"
    if not path.is_file():
        fail(f"{slug}: generated archive missing: {path.relative_to(ROOT)}")
        return
    try:
        with zipfile.ZipFile(path, "r") as archive:
            bad = archive.testzip()
            check(bad is None, f"{slug}: ZIP CRC failure in {bad}")
            names = archive.namelist()
            root_manifests = [name for name in names if name.count("/") == 1 and name.endswith("/manifest.json")]
            page_manifests = [name for name in names if "/Profiles/" in name and name.endswith("/manifest.json")]
            check(len(root_manifests) == 1, f"{slug}: expected one bundle manifest")
            check(len(page_manifests) == 1, f"{slug}: expected one page manifest")
            if len(root_manifests) != 1 or len(page_manifests) != 1:
                return
            bundle = json.loads(archive.read(root_manifests[0]).decode("utf-8"))
            page = json.loads(archive.read(page_manifests[0]).decode("utf-8"))
    except Exception as exc:
        fail(f"{slug}: unreadable archive: {exc}")
        return

    check(bundle.get("Version") == "2.0", f"{slug}: archive must use current V2 profile layout")
    check(bundle.get("Name") == OUTPUT_NAMES[slug], f"{slug}: archive display name mismatch")
    pages = bundle.get("Pages", {})
    page_uuid = pages.get("Current")
    check(isinstance(page_uuid, str) and bool(page_uuid), f"{slug}: missing current page UUID")
    check(pages.get("Pages") == [page_uuid], f"{slug}: expected exactly one page")
    if isinstance(page_uuid, str) and page_uuid:
        expected_folder = profile_folder_id(page_uuid)
        check(f"/Profiles/{expected_folder}/manifest.json" in page_manifests[0], f"{slug}: page folder encoding mismatch")

    controllers = page.get("Controllers", [])
    check(isinstance(controllers, list) and len(controllers) == 1, f"{slug}: expected one controller")
    if not isinstance(controllers, list) or len(controllers) != 1:
        return
    controller = controllers[0]
    check(controller.get("Type") == "Keypad", f"{slug}: controller must be Keypad")
    actions = controller.get("Actions", {})
    check(set(actions) == set(expected_actions), f"{slug}: archive coordinates differ from source definition")
    for coordinate, expected in expected_actions.items():
        actual = actions.get(coordinate, {})
        check(actual.get("UUID") == expected["UUID"], f"{slug}: {coordinate} action UUID mismatch")
        check(actual.get("Settings", {}) == expected["Settings"], f"{slug}: {coordinate} settings mismatch")
        check(isinstance(actual.get("ActionID"), str) and bool(actual.get("ActionID")), f"{slug}: {coordinate} missing ActionID")


def validate_manifest_registration() -> None:
    entries = manifest.get("Profiles", [])
    check(isinstance(entries, list) and len(entries) == 3, "plugin manifest must register exactly three bundled profiles")
    if not isinstance(entries, list):
        return
    expected_by_name = {
        f"profiles/{OUTPUT_NAMES[slug]}": EXPECTED[slug]["device_type"] for slug in EXPECTED
    }
    actual_by_name = {entry.get("Name"): entry.get("DeviceType") for entry in entries if isinstance(entry, dict)}
    check(actual_by_name == expected_by_name, "plugin manifest profile paths/device types do not match generated profiles")
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        check(entry.get("AutoInstall") is True, f"{entry.get('Name')}: profile should auto-install")
        check(entry.get("DontAutoSwitchWhenInstalled") is True, f"{entry.get('Name')}: install must not hijack the active deck")
        check(entry.get("Readonly") is False, f"{entry.get('Name')}: users should be able to customize the profile")


validate_manifest_registration()
for slug in EXPECTED:
    definition = load_definition(slug)
    expected_actions = validate_definition(slug, definition)
    validate_archive(slug, expected_actions)
    print(f"PROFILE QA {slug}: {len(expected_actions)} actions")

if errors:
    for error in errors:
        print(f"PROFILE QA FAIL: {error}", file=sys.stderr)
    sys.exit(1)
print("PROFILE QA PASS")
