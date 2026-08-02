"""Action and plugin icons for Riot Tracker, via the shared generator.

Tabler glyphs only, no League/TFT/Riot marks anywhere: "swords" for the LoL rank action
(combat, not the game's own crossed-swords mark), "chess-knight" for TFT (an auto-battler is a
chess relative), "trophy" for the plugin/category icon (rank tracking in general).

Run from anywhere:  python plugins/riot-tracker/scripts/gen-icons.py
"""
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "plugins", "_shared", "scripts"))

from gen_icons import generate  # noqa: E402

generate(
    slug="riot-tracker",
    uuid="com.packrat.riot-tracker",
    actions={"lol-rank": "swords", "tft-rank": "chess-knight"},
    plugin_glyph="trophy",
)
