#!/usr/bin/env python3
"""Elgato resubmission Marketplace renderer.

Uses the canonical deterministic Valorant Marketplace renderer, with the session
slide composed without the obsolete footer sentence that collided with the
Stream Deck preview/key labels in the Marketplace submission.
"""
from __future__ import annotations

import build_marketplace_art as art


def build_session(standard):
    canvas = art.background()
    art.header(
        canvas,
        "RANKED SESSION",
        "Track the whole session",
        "Automatic Competitive results stay with the session",
    )
    preview = art.resized(standard, 1030, 610)
    art.paste_shadow(canvas, preview, 760, 300)
    draw = art.ImageDraw.Draw(canvas)
    cards = (
        ("CURRENT", "ASC 2", "67 RR", art.RED),
        ("SESSION", "+74 RR", "4W 2L", art.GREEN),
        ("LAST MATCH", "WIN", "+22 RR", art.GREEN),
    )
    y = 320
    for kicker, value, secondary, accent in cards:
        art.round_panel(canvas, (110, y, 650, y + 145), 22)
        draw.text((140, y + 22), kicker, font=art.font(19), fill=art.MUTED)
        draw.text((140, y + 52), value, font=art.font(39), fill=accent)
        draw.text((455, y + 68), secondary, font=art.font(23), fill=art.WHITE)
        y += 165
    return canvas


art.build_session = build_session

if __name__ == "__main__":
    art.main()
