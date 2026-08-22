"""Host independent QA for the ChatGPT Web development proof of concept."""
from __future__ import annotations

import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / "com.packrat.riot-tracker.sdPlugin"
MANIFEST_PATH = PLUGIN / "manifest.json"


def resolve_asset(reference: str) -> Path | None:
    candidate = PLUGIN / reference
    if candidate.exists():
        return candidate
    for suffix in (".png", ".svg", ".jpg", ".jpeg"):
        asset = PLUGIN / f"{reference}{suffix}"
        if asset.exists():
            return asset
    return None


def png_size(path: Path) -> tuple[int, int] | None:
    with path.open("rb") as handle:
        header = handle.read(24)
    if len(header) >= 24 and header[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", header[16:24])
    return None


def main() -> None:
    errors: list[str] = []
    checks: list[dict[str, object]] = []
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))

    required = ("Name", "Version", "Author", "Actions", "CodePath", "SDKVersion", "UUID")
    for key in required:
        if key not in manifest:
            errors.append(f"manifest missing required field: {key}")

    code_path = PLUGIN / manifest.get("CodePath", "")
    checks.append({"check": "built code exists", "path": str(code_path.relative_to(ROOT)), "ok": code_path.is_file()})
    if not code_path.is_file():
        errors.append(f"built CodePath missing: {code_path.relative_to(ROOT)}")

    seen_uuids: set[str] = set()
    for action in manifest.get("Actions", []):
        uuid = action.get("UUID")
        if not uuid:
            errors.append(f"action missing UUID: {action.get('Name', '<unnamed>')}")
        elif uuid in seen_uuids:
            errors.append(f"duplicate action UUID: {uuid}")
        else:
            seen_uuids.add(uuid)

        pi = action.get("PropertyInspectorPath")
        if pi:
            pi_path = PLUGIN / pi
            checks.append({"check": "property inspector exists", "path": pi, "ok": pi_path.is_file()})
            if not pi_path.is_file():
                errors.append(f"missing Property Inspector: {pi}")

        for key in ("Icon",):
            ref = action.get(key)
            if ref:
                asset = resolve_asset(ref)
                checks.append({"check": f"action {key}", "reference": ref, "ok": asset is not None})
                if asset is None:
                    errors.append(f"missing action asset: {ref}")

        for state in action.get("States", []):
            ref = state.get("Image")
            if ref:
                asset = resolve_asset(ref)
                checks.append({"check": "state image", "reference": ref, "ok": asset is not None})
                if asset is None:
                    errors.append(f"missing state image: {ref}")

    for key in ("CategoryIcon", "Icon"):
        ref = manifest.get(key)
        if ref:
            asset = resolve_asset(ref)
            record: dict[str, object] = {"check": key, "reference": ref, "ok": asset is not None}
            if asset and asset.suffix.lower() == ".png":
                record["dimensions"] = png_size(asset)
            checks.append(record)
            if asset is None:
                errors.append(f"missing manifest asset: {ref}")

    report = {
        "product": manifest.get("Name"),
        "version": manifest.get("Version"),
        "sdk_version": manifest.get("SDKVersion"),
        "actions": len(manifest.get("Actions", [])),
        "checks": checks,
        "errors": errors,
        "status": "pass" if not errors else "fail",
    }
    out = ROOT / "dist" / "web-poc-qa.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
