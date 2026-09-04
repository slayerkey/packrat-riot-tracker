#!/usr/bin/env python3
"""Generate deterministic V2 .streamDeckProfile archives for bundled Valorant dashboards.

Elgato officially supports bundling exported .streamDeckProfile files in plugins. Elgato does
not publish the archive internals as a stable API, so this generator mirrors the current V2
page-based layout used by Elgato's own sample profiles: a bundle manifest plus a Controllers
page manifest under Profiles/<encoded page id>/.

The output is deterministic so CI can validate the exact same candidate on every run. A real
Stream Deck import remains the final release boundary because the archive internals are not an
officially versioned SDK contract.
"""
from __future__ import annotations

import json
import uuid
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / "com.packrat.valorant-tracker.sdPlugin"
OUT = PLUGIN / "profiles"

# Stable bundle IDs keep generated archives byte-stable across CI runs.
PROFILE_IDS = {
    "standard": "1F2B5574-6D88-4C75-9A3C-635A6E8E6A01",
    "xl": "C62F62E0-23A8-4BC5-92E4-91C29D5D7E02",
    "neo": "7A1E8BA8-8DE7-4C4A-BEA1-6D4D46F8D903",
}

# Models observed in current Elgato profile exports / samples. Neo is intentionally unbound;
# DeviceType=9 in the plugin manifest already scopes that archive to Neo and avoids guessing a
# hardware model string that may differ between generations.
DEVICE_MODELS = {
    "standard": "20GAA9901",
    "xl": "20GAT9901",
    "neo": None,
}

OUTPUT_NAMES = {
    "standard": "Valorant Tracker Standard",
    "xl": "Valorant Tracker XL",
    "neo": "Valorant Tracker Neo",
}

FIXED_TIME = (2026, 1, 1, 0, 0, 0)


def profile_folder_id(page_uuid: str) -> str:
    """Encode a UUID into the folder alphabet used by current V2 Stream Deck profiles."""
    compact = page_uuid.replace("-", "") + "000"
    groups = [compact[index : index + 5] for index in range(0, len(compact), 5)]
    encoded = "".join(format(int(group, 16), "x") if False else _base32_int(int(group, 16)) for group in groups)
    encoded = encoded[:26].upper().replace("V", "W").replace("U", "V")
    return encoded + "Z"


def _base32_int(value: int) -> str:
    alphabet = "0123456789abcdefghijklmnopqrstuv"
    if value == 0:
        text = "0"
    else:
        parts: list[str] = []
        while value:
            value, remainder = divmod(value, 32)
            parts.append(alphabet[remainder])
        text = "".join(reversed(parts))
    return text.rjust(4, "0")


def action_object(action_uuid: str, settings: dict, action_id: str) -> dict:
    return {
        "ActionID": action_id,
        "LinkedTitle": True,
        "Name": action_uuid.rsplit(".", 1)[-1],
        "Settings": settings or {},
        "State": 0,
        "States": [
            {
                "FontFamily": "",
                "FontSize": 9,
                "FontStyle": "",
                "FontUnderline": False,
                "OutlineThickness": 2,
                "ShowTitle": False,
                "Title": "",
                "TitleAlignment": "middle",
                "TitleColor": "#ffffff",
            }
        ],
        "UUID": action_uuid,
    }


def write_entry(archive: zipfile.ZipFile, name: str, payload: bytes = b"") -> None:
    info = zipfile.ZipInfo(name)
    info.date_time = FIXED_TIME
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = (0o40755 if name.endswith("/") else 0o100644) << 16
    archive.writestr(info, payload, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)


def build_one(slug: str) -> Path:
    definition_path = ROOT / "profiles" / f"{slug}.json"
    definition = json.loads(definition_path.read_text(encoding="utf-8"))

    root_uuid = PROFILE_IDS[slug]
    namespace = uuid.UUID(root_uuid)
    page_uuid = str(uuid.uuid5(namespace, "page-0"))
    page_folder = profile_folder_id(page_uuid)

    actions: dict[str, dict] = {}
    for key in definition["keys"]:
        coordinate = f"{key['column']},{key['row']}"
        action_id = str(uuid.uuid5(namespace, f"action:{coordinate}"))
        actions[coordinate] = action_object(key["action"], key.get("settings", {}), action_id)

    bundle_manifest: dict = {
        "Name": OUTPUT_NAMES[slug],
        "Pages": {
            "Current": page_uuid,
            "Default": page_uuid,
            "Pages": [page_uuid],
        },
        "Version": "2.0",
    }
    device_model = DEVICE_MODELS[slug]
    if device_model:
        bundle_manifest["Device"] = {"Model": device_model, "UUID": ""}

    page_manifest = {
        "Controllers": [
            {
                "Actions": actions,
                "Type": "Keypad",
            }
        ],
        "Icon": "",
        "Name": "",
    }

    OUT.mkdir(parents=True, exist_ok=True)
    destination = OUT / f"{OUTPUT_NAMES[slug]}.streamDeckProfile"
    root_folder = f"{root_uuid}.sdProfile"
    page_root = f"{root_folder}/Profiles/{page_folder}"

    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        write_entry(archive, f"{root_folder}/")
        write_entry(
            archive,
            f"{root_folder}/manifest.json",
            (json.dumps(bundle_manifest, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8"),
        )
        write_entry(archive, f"{root_folder}/Profiles/")
        write_entry(archive, f"{page_root}/")
        write_entry(archive, f"{page_root}/Images/")
        write_entry(
            archive,
            f"{page_root}/manifest.json",
            (json.dumps(page_manifest, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8"),
        )

    validate_archive(destination, definition, slug)
    return destination


def validate_archive(path: Path, definition: dict, slug: str) -> None:
    with zipfile.ZipFile(path, "r") as archive:
        names = archive.namelist()
        root_manifests = [name for name in names if name.count("/") == 1 and name.endswith("/manifest.json")]
        page_manifests = [name for name in names if "/Profiles/" in name and name.endswith("/manifest.json")]
        if len(root_manifests) != 1:
            raise RuntimeError(f"{path.name}: expected one V2 bundle manifest, found {len(root_manifests)}")
        if len(page_manifests) != 1:
            raise RuntimeError(f"{path.name}: expected one V2 page manifest, found {len(page_manifests)}")
        bundle = json.loads(archive.read(root_manifests[0]).decode("utf-8"))
        page = json.loads(archive.read(page_manifests[0]).decode("utf-8"))

    if bundle.get("Version") != "2.0":
        raise RuntimeError(f"{path.name}: unexpected profile version")
    pages = bundle.get("Pages", {})
    if not pages.get("Current") or pages.get("Pages") != [pages.get("Current")]:
        raise RuntimeError(f"{path.name}: invalid single-page navigation")
    expected_folder = profile_folder_id(pages["Current"])
    if f"/Profiles/{expected_folder}/manifest.json" not in page_manifests[0]:
        raise RuntimeError(f"{path.name}: page folder encoding does not match page UUID")

    controllers = page.get("Controllers")
    if not isinstance(controllers, list) or len(controllers) != 1 or controllers[0].get("Type") != "Keypad":
        raise RuntimeError(f"{path.name}: missing Keypad controller")
    actions = controllers[0].get("Actions", {})
    expected_positions = {f"{key['column']},{key['row']}" for key in definition["keys"]}
    if set(actions) != expected_positions:
        raise RuntimeError(f"{path.name}: action coordinates differ from source definition")
    for key in definition["keys"]:
        coordinate = f"{key['column']},{key['row']}"
        action = actions[coordinate]
        if action.get("UUID") != key["action"]:
            raise RuntimeError(f"{path.name}: {coordinate} action UUID mismatch")
        if action.get("Settings", {}) != key.get("settings", {}):
            raise RuntimeError(f"{path.name}: {coordinate} settings mismatch")

    model = DEVICE_MODELS[slug]
    if model and bundle.get("Device") != {"Model": model, "UUID": ""}:
        raise RuntimeError(f"{path.name}: wrong device binding")
    if not model and "Device" in bundle:
        raise RuntimeError(f"{path.name}: device-agnostic profile unexpectedly bound to hardware")


def main() -> None:
    built = [build_one(slug) for slug in ("standard", "xl", "neo")]
    for path in built:
        print(f"PROFILE BUILT {path.relative_to(ROOT)} {path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
