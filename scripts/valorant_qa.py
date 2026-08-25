#!/usr/bin/env python3
"""Host-independent release QA for the Valorant Tracker Stream Deck plugin."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / "com.packrat.valorant-tracker.sdPlugin"
MANIFEST = PLUGIN / "manifest.json"
PROFILES = [
    ROOT / "profiles" / "standard.json",
    ROOT / "profiles" / "xl.json",
    ROOT / "profiles" / "neo.json",
]

errors: list[str] = []
checks: list[str] = []


def fail(message: str) -> None:
    errors.append(message)


def check(condition: bool, message: str) -> None:
    if condition:
        checks.append(message)
    else:
        fail(message)


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        fail(f"invalid JSON {path.relative_to(ROOT)}: {exc}")
        return {}


manifest = load_json(MANIFEST)
check(manifest.get("UUID") == "com.packrat.valorant-tracker", "manifest uses dedicated Valorant Tracker UUID")
check(manifest.get("Name") == "Valorant Tracker", "manifest has customer-facing product name")
check(manifest.get("SDKVersion") == 3, "manifest targets Stream Deck SDK 3")

os_targets = {entry.get("Platform") for entry in manifest.get("OS", []) if isinstance(entry, dict)}
check({"windows", "mac"}.issubset(os_targets), "manifest declares Windows and macOS targets")

actions = manifest.get("Actions", [])
check(isinstance(actions, list) and len(actions) == 20, "manifest exposes exactly 20 v1 actions")
action_uuids = [entry.get("UUID") for entry in actions if isinstance(entry, dict)]
check(len(action_uuids) == len(set(action_uuids)), "all action UUIDs are unique")
check(all(isinstance(value, str) and value.startswith("com.packrat.valorant-tracker.") for value in action_uuids), "all action UUIDs stay in dedicated product namespace")

for action in actions:
    if not isinstance(action, dict):
        continue
    pi = action.get("PropertyInspectorPath")
    check(bool(pi and (PLUGIN / pi).is_file()), f"PI exists for {action.get('Name', action.get('UUID'))}")
    for asset_field in ("Icon",):
        stem = action.get(asset_field)
        if stem:
            check((PLUGIN / f"{stem}.png").is_file(), f"{asset_field} asset exists for {action.get('Name')}")
    states = action.get("States", [])
    if states:
        stem = states[0].get("Image")
        if stem:
            check((PLUGIN / f"{stem}.png").is_file(), f"default key asset exists for {action.get('Name')}")

for field in ("CategoryIcon", "Icon"):
    stem = manifest.get(field)
    if stem:
        check((PLUGIN / f"{stem}.png").is_file(), f"plugin {field} asset exists")

required_actions = {
    "rank", "rr", "session-rr", "session-record", "last-match", "headshot",
    "top-agent", "agent-kd", "agent-win-rate", "damage", "top-map",
    "map-win-rate", "acs", "recent-match", "act-countdown", "spike-timer",
    "log-win", "log-loss", "session-reset", "refresh",
}
actual_suffixes = {uuid.rsplit(".", 1)[-1] for uuid in action_uuids if isinstance(uuid, str)}
check(required_actions == actual_suffixes, "complete action contract is represented in manifest")

for path in PROFILES:
    data = load_json(path)
    grid = data.get("grid", {})
    columns = grid.get("columns")
    rows = grid.get("rows")
    keys = data.get("keys", [])
    label = path.stem
    check(isinstance(columns, int) and isinstance(rows, int), f"{label} profile has integer grid dimensions")
    positions: set[tuple[int, int]] = set()
    if isinstance(keys, list):
        for key in keys:
            if not isinstance(key, dict):
                fail(f"{label} profile contains non-object key")
                continue
            row = key.get("row")
            column = key.get("column")
            action_uuid = key.get("action")
            if not isinstance(row, int) or not isinstance(column, int):
                fail(f"{label} profile key has invalid position")
                continue
            if isinstance(rows, int) and isinstance(columns, int):
                check(0 <= row < rows and 0 <= column < columns, f"{label} key {row},{column} is inside grid")
            check((row, column) not in positions, f"{label} key {row},{column} is unique")
            positions.add((row, column))
            check(action_uuid in action_uuids, f"{label} references valid action {action_uuid}")
            settings = key.get("settings", {})
            if isinstance(settings, dict):
                check("apiKey" not in settings and "riotId" not in settings and "region" not in settings, f"{label} never duplicates account setup into key settings")
                if "slot" in settings:
                    check(settings["slot"] in {1, 2, 3, 4, 5}, f"{label} slot setting is supported")
    if label == "standard":
        check(len(keys) == 15 and len(positions) == 15, "standard profile definition fills exactly 15 keys")
    if label == "xl":
        check(len(keys) <= 32 and len(positions) == len(keys), "XL profile definition fits 32-key hardware without filler collisions")
    if label == "neo":
        check(len(keys) == 8 and len(positions) == 8, "Neo profile definition fills exactly 8 keys")

pi_html = (PLUGIN / "ui" / "config.html").read_text(encoding="utf-8")
pi_js = (PLUGIN / "ui" / "pi.js").read_text(encoding="utf-8")
service = (ROOT / "src" / "valorant" / "service.ts").read_text(encoding="utf-8")
session_source = (ROOT / "src" / "valorant" / "session.ts").read_text(encoding="utf-8")
henrik = (ROOT / "src" / "valorant" / "henrik.ts").read_text(encoding="utf-8")
actions_source = (ROOT / "src" / "valorant" / "actions.ts").read_text(encoding="utf-8")
plugin_source = (ROOT / "src" / "plugin.ts").read_text(encoding="utf-8")

check("Name#TAG" in pi_html, "Property Inspector documents exact Riot ID format")
check("Open HenrikDev Dashboard" in pi_html, "Property Inspector exposes one-click HenrikDev setup")
check("independent third-party community API" in pi_html, "Property Inspector discloses HenrikDev third-party dependency")
check('type="password"' in pi_html, "HenrikDev key uses a password input")
check("https://api.henrikdev.xyz/dashboard/" in pi_js, "Property Inspector points to the current HenrikDev dashboard")
check('event: "openUrl"' in pi_js, "Property Inspector opens HenrikDev through Stream Deck openUrl")
check('event: "setGlobalSettings"' in pi_js, "Property Inspector writes account setup to global settings")
check('event: "setSettings"' in pi_js, "Property Inspector keeps only action-specific display controls in action settings")
check("delete globalSettings.session" in pi_js and "delete globalSettings.cache" in pi_js, "changing tracked Riot identity clears prior player session and cache")
check("REFRESH_MS = 5 * 60_000" in service, "shared service uses five-minute cache freshness")
check("private inFlight" in service, "shared service coalesces simultaneous refreshes")
check("private refreshAgain" in service, "forced refresh during an in-flight request schedules one follow-up refresh")
check("cacheMatchesAccount" in service, "cached player data is scoped to the configured Riot ID")
check("accountFingerprint(store.account) !== requestedAccount" in service, "late network responses cannot overwrite a changed account")
check("const samePlayer = store.cache?.puuid === bundle.account.puuid" in service, "session state is reused only for the same resolved player")
check("match.startedAt <= entry.createdAt + MANUAL_RECONCILE_WINDOW_MS" in session_source, "manual result reconciliation is bounded on both sides of its timestamp")
check("match.startedAt >= session.startedAt" in session_source, "session accounting never resurrects matches from before a reset")
check("knownMatchIds(cache)" in service and "newSession(cache)" in service, "session controls baseline all matches already known locally")
check("private mutationQueue" in service and "return this.enqueueMutation" in service, "manual session mutations are serialized so rapid taps cannot overwrite each other")
check("const nextCache = cache" in service, "manual session controls update local cache immediately")
check("export const valorantService = new ValorantDataService" in service, "plugin has one shared Valorant data service")
check("/valorant/v3/mmr/" in henrik, "Henrik client uses MMR v3")
check("/valorant/v2/mmr-history/" in henrik, "Henrik client uses MMR History v2")
check("/valorant/v4/matches/" in henrik, "Henrik client uses Matchlist v4")
check("Authorization: apiKey" in henrik, "Henrik client sends user API key through Authorization header")
check("throw historyResult.reason" in henrik and "throw matchesResult.reason" in henrik, "partial Henrik failures preserve last-known-good data instead of writing empty snapshots")
check('new Set(["image/png", "image/jpeg", "image/webp", "image/gif"])' in henrik, "remote artwork hydration accepts only supported image MIME types")
check("session-reset" in actions_source and "Date.now() - started < 1200" in actions_source, "session reset requires deliberate hold")
check("45 - (Date.now() - this.startedAt) / 1000" in actions_source, "spike timer implements 45-second countdown")
check("startPoller" in plugin_source and "valorantService.refresh" in plugin_source, "plugin owns one background refresh loop")

# Avoid accidental credential samples or secrets in tracked product source.
secret_patterns = [
    re.compile(r"HDEV[-_A-Za-z0-9]{12,}", re.I),
    re.compile(r"(?:api[_-]?key|authorization)\s*[:=]\s*['\"][A-Za-z0-9_-]{20,}['\"]", re.I),
]
for path in list((ROOT / "src").rglob("*.ts")) + list((PLUGIN / "ui").rglob("*")):
    if not path.is_file():
        continue
    text = path.read_text(encoding="utf-8", errors="ignore")
    for pattern in secret_patterns:
        if pattern.search(text):
            fail(f"possible credential literal found in {path.relative_to(ROOT)}")

report = {
    "product": "valorant-tracker",
    "passed": not errors,
    "checks_passed": len(checks),
    "errors": errors,
}
out = ROOT / "dist" / "valorant-qa.json"
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, indent=2))
if errors:
    sys.exit(1)
