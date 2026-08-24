#!/usr/bin/env python3
"""Generate deterministic single-page .streamDeckProfile archives for bundled dashboards.

Elgato officially supports bundling exported .streamDeckProfile files in plugins. The archive
layout itself is not an official public API, so this generator intentionally uses the simple
V1 single-page form that continues to import on current Stream Deck releases. Final import on
real Stream Deck software remains the release boundary.
"""
from __future__ import annotations

import json
import uuid
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / "com.packrat.valorant-tracker.sdPlugin"
OUT = PLUGIN / "profiles"

PROFILE_IDS = {
    "standard": "1F2B5574-6D88-4C75-9A3C-635A6E8E6A01",
    "xl": "C62F62E0-23A8-4BC5-92E4-91C29D5D7E02",
    "neo": "7A1E8BA8-8DE7-4C4A-BEA1-6D4D46F8D903",
}

DEVICE_MODELS = {
    "standard": "20GAA9901",
    "xl": "20GAT9901",
    # Neo model identifiers vary by generation; the plugin manifest's DeviceType=9 targets it.
    "neo": None,
}

OUTPUT_NAMES = {
    "standard": "Valorant Tracker Standard",
    "xl": "Valorant Tracker XL",
    "neo": "Valorant Tracker Neo",
}


def action_object(action_uuid: str, settings: dict, action_id: str) -> dict:
    return {
        "ActionID": action_id,
        "LinkedTitle": True,
        "Name": action_uuid.rsplit(".", 1)[-1],
        "UUID": action_uuid,
        "Settings": settings or {},
        "State": 0,
        "States": [
            {
                "FFamily": "",
                "FSize": "",
                "FStyle": "",
                "FUnderline": "off",
                "Image": "",
                "Title": "",
                "TitleAlignment": "middle",
                "TitleColor": "",
                "TitleShow": "hide",
            }
        ],
    }


def build_one(slug: str) -> Path:
    definition_path = ROOT / "profiles" / f"{slug}.json"
    definition = json.loads(definition_path.read_text(encoding="utf-8"))
    actions: dict[str, dict] = {}
    namespace = uuid.UUID(PROFILE_IDS[slug])
    for key in definition["keys"]:
        coordinate = f"{key['column']},{key['row']}"
        action_id = str(uuid.uuid5(namespace, coordinate)).upper()
        actions[coordinate] = action_object(key["action"], key.get("settings", {}), action_id)

    manifest = {
        "Actions": actions,
        "Name": OUTPUT_NAMES[slug],
        "Version": "1.0",
    }
    device_model = DEVICE_MODELS[slug]
    if device_model:
        manifest["DeviceModel"] = device_model

    OUT.mkdir(parents=True, exist_ok=True)
    destination = OUT / f"{OUTPUT_NAMES[slug]}.streamDeckProfile"
    root_folder = f"{PROFILE_IDS[slug]}.sdProfile"
    payload = json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n"
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        info = zipfile.ZipInfo(f"{root_folder}/manifest.json")
        # Fixed timestamp keeps the archive byte-stable across CI runs.
        info.date_time = (2026, 1, 1, 0, 0, 0)
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, payload.encode("utf-8"), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)

    validate_archive(destination, definition)
    return destination


def validate_archive(path: Path, definition: dict) -> None:
    with zipfile.ZipFile(path, "r") as archive:
        names = archive.namelist()
        manifests = [name for name in names if name.endswith(".sdProfile/manifest.json")]
        if len(manifests) != 1:
            raise RuntimeError(f"{path.name}: expected one profile manifest, found {len(manifests)}")
        manifest = json.loads(archive.read(manifests[0]).decode("utf-8"))
    if manifest.get("Version") != "1.0":
        raise RuntimeError(f"{path.name}: unexpected profile version")
    expected_positions = {f"{key['column']},{key['row']}" for key in definition["keys"]}
    if set(manifest.get("Actions", {})) != expected_positions:
        raise RuntimeError(f"{path.name}: action coordinates differ from source definition")
    for key in definition["keys"]:
        coordinate = f"{key['column']},{key['row']}"
        action = manifest["Actions"][coordinate]
        if action.get("UUID") != key["action"]:
            raise RuntimeError(f"{path.name}: {coordinate} action UUID mismatch")
        if action.get("Settings", {}) != key.get("settings", {}):
            raise RuntimeError(f"{path.name}: {coordinate} settings mismatch")


def main() -> None:
    built = [build_one(slug) for slug in ("standard", "xl", "neo")]
    for path in built:
        print(f"PROFILE BUILT {path.relative_to(ROOT)} {path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
