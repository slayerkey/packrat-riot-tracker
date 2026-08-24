#!/usr/bin/env python3
"""Assemble the complete Valorant Tracker Marketplace release candidate."""
from __future__ import annotations

import hashlib
import json
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
ART = DIST / "marketplace-art"
PROFILES = ROOT / "com.packrat.valorant-tracker.sdPlugin" / "profiles"
MARKETPLACE = ROOT / "marketplace"
OUT = DIST / "valorant-tracker-release"
ZIP = DIST / "valorant-tracker-release.zip"

errors: list[str] = []


def require(path: Path, label: str) -> Path:
    if not path.is_file():
        errors.append(f"missing {label}: {path.relative_to(ROOT)}")
    return path


packages = sorted(DIST.glob("*.streamDeckPlugin"))
if len(packages) != 1:
    errors.append(f"expected exactly one packaged plugin in dist, found {len(packages)}")
package = packages[0] if packages else DIST / "missing.streamDeckPlugin"

required = [
    require(DIST / "valorant-qa.json", "structural QA report"),
    require(DIST / "marketplace-art-qa.json", "marketplace art QA report"),
    require(MARKETPLACE / "marketplace.json", "marketplace metadata"),
    require(MARKETPLACE / "release-notes.md", "release notes"),
]
for name in ("1-thumbnail.png", "2-session.png", "3-xl.png", "4-controls.png", "5-setup.png", "app-icon.png"):
    required.append(require(ART / name, f"marketplace artwork {name}"))
for name in ("Valorant Tracker Standard.streamDeckProfile", "Valorant Tracker XL.streamDeckProfile", "Valorant Tracker Neo.streamDeckProfile"):
    required.append(require(PROFILES / name, f"bundled profile {name}"))

if errors:
    for error in errors:
        print(f"RELEASE KIT FAIL: {error}", file=sys.stderr)
    sys.exit(1)

if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir(parents=True)
(OUT / "art").mkdir()
(OUT / "profiles").mkdir()
(OUT / "qa").mkdir()

shutil.copy2(package, OUT / package.name)
for path in sorted(ART.glob("*.png")):
    shutil.copy2(path, OUT / "art" / path.name)
for path in sorted(PROFILES.glob("*.streamDeckProfile")):
    shutil.copy2(path, OUT / "profiles" / path.name)
shutil.copy2(DIST / "valorant-qa.json", OUT / "qa" / "valorant-qa.json")
shutil.copy2(DIST / "marketplace-art-qa.json", OUT / "qa" / "marketplace-art-qa.json")
shutil.copy2(MARKETPLACE / "marketplace.json", OUT / "marketplace.json")
shutil.copy2(MARKETPLACE / "release-notes.md", OUT / "release-notes.md")

readme = """Valorant Tracker 1.0.0 Marketplace Release Candidate

Contents

plugin package
  Install this .streamDeckPlugin file for final local and hardware validation.

art/
  1-thumbnail.png is the Marketplace thumbnail.
  2-session.png through 5-setup.png are the gallery sequence.
  app-icon.png is the 288 x 288 Marketplace app icon.

profiles/
  Editable Standard, XL and Neo dashboard profiles bundled by the plugin.

marketplace.json
  Canonical listing copy, compatibility, candidate price and gallery order.

release-notes.md
  Version 1.0.0 release notes.

qa/
  Automated structural and Marketplace art QA evidence.

Final boundaries before publication

1. Install the plugin in current Stream Deck software.
2. Confirm the bundled profile imports on the target hardware you can access.
3. Enter a real Riot ID, region and HenrikDev API key and run the live smoke path.
4. Verify key readability and controls on physical hardware.
5. Review the candidate price and irreversible Maker Console fields before submission.

Do not place HenrikDev keys, Riot IDs, cookies or Maker Console authentication data into this kit.
"""
(OUT / "README.txt").write_text(readme, encoding="utf-8")

checksums: dict[str, str] = {}
for path in sorted(p for p in OUT.rglob("*") if p.is_file()):
    checksums[str(path.relative_to(OUT)).replace("\\", "/")] = hashlib.sha256(path.read_bytes()).hexdigest()
(OUT / "checksums.json").write_text(json.dumps(checksums, indent=2) + "\n", encoding="utf-8")

if ZIP.exists():
    ZIP.unlink()
with zipfile.ZipFile(ZIP, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for path in sorted(p for p in OUT.rglob("*") if p.is_file()):
        info = zipfile.ZipInfo(str(path.relative_to(OUT)).replace("\\", "/"))
        info.date_time = (2026, 1, 1, 0, 0, 0)
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)

print(f"RELEASE KIT PASS: {ZIP.relative_to(ROOT)} {ZIP.stat().st_size} bytes")
for name, digest in sorted(checksums.items()):
    print(f"  {digest}  {name}")
