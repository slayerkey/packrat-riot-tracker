#!/usr/bin/env python3
"""Validate generated Valorant Tracker Marketplace media before release packaging."""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "dist" / "marketplace-art"
PLUGIN_ICONS = ROOT / "com.packrat.valorant-tracker.sdPlugin" / "imgs" / "plugin"
REPORT = ROOT / "dist" / "marketplace-art-qa.json"
ART_SOURCE = ROOT / "scripts" / "build_marketplace_art.py"

EXPECTED = {
    ART / "1-thumbnail.png": ((1920, 960), 50_000),
    ART / "2-session.png": ((1920, 960), 50_000),
    ART / "3-xl.png": ((1920, 960), 50_000),
    ART / "4-controls.png": ((1920, 960), 50_000),
    ART / "5-setup.png": ((1920, 960), 50_000),
    ART / "app-icon.png": ((288, 288), 3_000),
    PLUGIN_ICONS / "marketplace.png": ((256, 256), 3_000),
    PLUGIN_ICONS / "marketplace@2x.png": ((512, 512), 6_000),
}

errors: list[str] = []
checks: list[str] = []
digests: dict[str, str] = {}


def check(condition: bool, message: str) -> None:
    if condition:
        checks.append(message)
    else:
        errors.append(message)


for path, (expected_size, minimum_bytes) in EXPECTED.items():
    rel = str(path.relative_to(ROOT))
    check(path.is_file(), f"{rel} exists")
    if not path.is_file():
        continue
    check(path.stat().st_size >= minimum_bytes, f"{rel} is non-trivial artwork")
    try:
        with Image.open(path) as image:
            check(image.format == "PNG", f"{rel} is PNG")
            check(image.size == expected_size, f"{rel} dimensions are {expected_size[0]}x{expected_size[1]}")
    except Exception as exc:
        errors.append(f"{rel} failed to open: {exc}")
        continue
    digests[rel] = hashlib.sha256(path.read_bytes()).hexdigest()

listing_paths = [ART / f"{index}-{name}.png" for index, name in (
    (1, "thumbnail"),
    (2, "session"),
    (3, "xl"),
    (4, "controls"),
    (5, "setup"),
)]
listing_hashes = [digests.get(str(path.relative_to(ROOT))) for path in listing_paths]
listing_hashes = [value for value in listing_hashes if value]
check(len(listing_hashes) == 5, "all five listing images produced hashes")
check(len(set(listing_hashes)) == len(listing_hashes), "thumbnail and gallery images are byte-distinct")

# The images are deterministic raster output, so semantic product-copy checks live against the
# deterministic renderer source. This prevents an old interaction model from passing image-size QA.
art_source = ART_SOURCE.read_text(encoding="utf-8")
check('"TAP TWICE RESET"' in art_source, "Marketplace controls art documents the current two-tap reset")
check('"HOLD RESET"' not in art_source, "Marketplace art cannot regress to the removed hold-reset interaction")
check('"Automatic region detection"' in art_source, "Marketplace setup art documents automatic region detection")
check('("LOG WIN", GREEN)' not in art_source and '("LOG LOSS", RED)' not in art_source, "Marketplace default controls art does not present manual fallback logging as the primary workflow")

report = {
    "product": "valorant-tracker",
    "passed": not errors,
    "checks_passed": len(checks),
    "errors": errors,
    "sha256": digests,
}
REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, indent=2))
if errors:
    sys.exit(1)
