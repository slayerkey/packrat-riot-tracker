#!/usr/bin/env python3
"""Build deterministic Marketplace media for Valorant Tracker.

This is a source-driven renderer. It does not call an image generation API and it does not fake
Stream Deck hardware. The dashboard previews are rendered directly from the same deterministic
SVG fixtures used by release QA, so the Marketplace media stays tied to what the plugin actually
shows on keys.
"""
from __future__ import annotations

import io
from pathlib import Path

import cairosvg
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "dist" / "visual-fixtures"
OUT = ROOT / "dist" / "marketplace-art"
PLUGIN_ICONS = ROOT / "com.packrat.valorant-tracker.sdPlugin" / "imgs" / "plugin"

W, H = 1920, 960
BG = (7, 7, 10)
PANEL = (24, 24, 31)
WHITE = (247, 247, 248)
MUTED = (164, 164, 176)
RED = (255, 70, 85)
GREEN = (53, 208, 127)
AMBER = (240, 173, 78)
LINE = (48, 48, 61)

FONT_BOLD_CANDIDATES = [
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    Path("/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf"),
]
FONT_REGULAR_CANDIDATES = [
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    Path("/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"),
]


def require_font(candidates: list[Path], label: str) -> Path:
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise SystemExit(f"MARKETPLACE ART FAIL: deterministic {label} font not found")


FONT_BOLD = require_font(FONT_BOLD_CANDIDATES, "bold")
FONT_REGULAR = require_font(FONT_REGULAR_CANDIDATES, "regular")


def font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_BOLD if bold else FONT_REGULAR), size)


def fit_text(draw: ImageDraw.ImageDraw, text: str, max_width: int, max_size: int, min_size: int = 18, bold: bool = True) -> ImageFont.FreeTypeFont:
    for size in range(max_size, min_size - 1, -2):
        candidate = font(size, bold)
        if draw.textbbox((0, 0), text, font=candidate)[2] <= max_width:
            return candidate
    return font(min_size, bold)


def fixture(name: str) -> Image.Image:
    path = FIXTURES / f"{name}.svg"
    if not path.is_file():
        raise SystemExit(f"MARKETPLACE ART FAIL: missing visual fixture {path.relative_to(ROOT)}")
    png = cairosvg.svg2png(url=str(path))
    return Image.open(io.BytesIO(png)).convert("RGBA")


def background() -> Image.Image:
    base = Image.new("RGBA", (W, H), (*BG, 255))
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    draw.ellipse((1050, -250, 2150, 850), fill=(*RED, 36))
    draw.ellipse((-500, 420, 750, 1350), fill=(80, 30, 80, 24))
    return Image.alpha_composite(base, glow.filter(ImageFilter.GaussianBlur(170)))


def round_panel(canvas: Image.Image, box: tuple[int, int, int, int], radius: int = 28) -> None:
    ImageDraw.Draw(canvas).rounded_rectangle(box, radius=radius, fill=(*PANEL, 245), outline=(*LINE, 255), width=2)


def header(canvas: Image.Image, eyebrow: str, headline: str, subtitle: str | None = None) -> None:
    draw = ImageDraw.Draw(canvas)
    draw.text((110, 78), eyebrow.upper(), font=font(22), fill=RED)
    headline_font = fit_text(draw, headline.upper(), 1500, 72, 42)
    draw.text((110, 116), headline.upper(), font=headline_font, fill=WHITE)
    if subtitle:
        subtitle_font = fit_text(draw, subtitle, 1500, 30, 20, False)
        draw.text((112, 210), subtitle, font=subtitle_font, fill=MUTED)
    draw.line((110, 260, 1810, 260), fill=(*RED, 110), width=2)


def pill(canvas: Image.Image, x: int, y: int, text: str, accent: tuple[int, int, int]) -> int:
    draw = ImageDraw.Draw(canvas)
    face = font(19)
    width = draw.textbbox((0, 0), text, font=face)[2]
    draw.rounded_rectangle((x, y, x + width + 34, y + 42), radius=21, fill=(22, 22, 28, 255), outline=(*accent, 170), width=2)
    draw.text((x + 17, y + 10), text, font=face, fill=WHITE)
    return x + width + 48


def paste_shadow(canvas: Image.Image, asset: Image.Image, x: int, y: int, radius: int = 24) -> None:
    pad = 22
    shadow = Image.new("RGBA", (asset.width + pad * 2, asset.height + pad * 2), (0, 0, 0, 0))
    draw = ImageDraw.Draw(shadow)
    draw.rounded_rectangle((pad // 2, pad // 2, asset.width + pad + pad // 2, asset.height + pad + pad // 2), radius=radius, fill=(0, 0, 0, 180))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    canvas.alpha_composite(shadow, (x - pad, y - pad))
    canvas.alpha_composite(asset, (x, y))


def resized(asset: Image.Image, max_width: int, max_height: int) -> Image.Image:
    scale = min(max_width / asset.width, max_height / asset.height)
    return asset.resize((max(1, int(asset.width * scale)), max(1, int(asset.height * scale))), Image.Resampling.LANCZOS)


def make_icon(size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (8, 8, 12, 255))
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse((size * 0.12, size * 0.08, size * 0.88, size * 0.84), fill=(*RED, 46))
    canvas = Image.alpha_composite(canvas, glow.filter(ImageFilter.GaussianBlur(size * 0.09)))
    draw = ImageDraw.Draw(canvas)
    margin = size * 0.15
    draw.rounded_rectangle((margin, margin, size - margin, size - margin), radius=size * 0.18, fill=(18, 18, 24, 255), outline=(*RED, 255), width=max(3, int(size * 0.018)))
    center = size / 2
    outer = [(center, size * 0.23), (size * 0.70, size * 0.35), (size * 0.64, size * 0.64), (center, size * 0.79), (size * 0.36, size * 0.64), (size * 0.30, size * 0.35)]
    inner = [(center, size * 0.30), (size * 0.62, size * 0.40), (size * 0.58, size * 0.58), (center, size * 0.70), (size * 0.42, size * 0.58), (size * 0.38, size * 0.40)]
    draw.polygon(outer, fill=(*RED, 38), outline=(*RED, 255))
    draw.polygon(inner, fill=(*RED, 210))
    rr_font = font(int(size * 0.19))
    rr_box = draw.textbbox((0, 0), "RR", font=rr_font)
    rr_width = rr_box[2] - rr_box[0]
    rr_height = rr_box[3] - rr_box[1]
    draw.text((center - rr_width / 2, center - rr_height / 2 - rr_box[1]), "RR", font=rr_font, fill=(8, 8, 12, 255))
    return canvas


def build_thumbnail(standard: Image.Image) -> Image.Image:
    canvas = background()
    header(canvas, "PACKRAT", "Valorant Tracker", "A physical ranked dashboard for Stream Deck")
    preview = resized(standard, 920, 500)
    round_panel(canvas, (830, 290, 1810, 840), 32)
    paste_shadow(canvas, preview, 860, 315)
    draw = ImageDraw.Draw(canvas)
    draw.text((115, 345), "RANKED INFO", font=font(54), fill=WHITE)
    draw.text((115, 405), "AT A GLANCE", font=font(54), fill=WHITE)
    draw.text((118, 495), "Rank, RR, automatic session tracking,", font=font(26, False), fill=MUTED)
    draw.text((118, 532), "recent stats, agents and maps.", font=font(26, False), fill=MUTED)
    x = 118
    for text, accent in (("20 ACTIONS", RED), ("1 SHARED SETUP", GREEN), ("STANDARD • XL • NEO", AMBER)):
        x = pill(canvas, x, 630, text, accent)
    draw.text((118, 790), "No Riot developer key required", font=font(24), fill=WHITE)
    draw.text((118, 826), "Uses your own HenrikDev API key", font=font(21, False), fill=MUTED)
    return canvas


def build_session(standard: Image.Image) -> Image.Image:
    canvas = background()
    header(canvas, "RANKED SESSION", "Track the whole session", "Automatic Competitive results stay with the session")
    preview = resized(standard, 1030, 610)
    paste_shadow(canvas, preview, 760, 300)
    draw = ImageDraw.Draw(canvas)
    cards = (("CURRENT", "ASC 2", "67 RR", RED), ("SESSION", "+74 RR", "4W 2L", GREEN), ("LAST MATCH", "WIN", "+22 RR", GREEN))
    y = 320
    for kicker, value, secondary, accent in cards:
        round_panel(canvas, (110, y, 650, y + 145), 22)
        draw.text((140, y + 22), kicker, font=font(19), fill=MUTED)
        draw.text((140, y + 52), value, font=font(39), fill=accent)
        draw.text((455, y + 68), secondary, font=font(23), fill=WHITE)
        y += 165
    draw.text((115, 845), "Persistent session accounting survives long play sessions and rolling recent-match windows.", font=font(18, False), fill=MUTED)
    return canvas


def build_xl(xl: Image.Image) -> Image.Image:
    canvas = background()
    header(canvas, "STREAM DECK XL", "Built to expand", "More room for agents, maps and recent matches")
    preview = resized(xl, 1040, 600)
    round_panel(canvas, (110, 305, 1210, 835), 32)
    paste_shadow(canvas, preview, 140, 320)
    draw = ImageDraw.Draw(canvas)
    draw.text((1290, 340), "EXPANDED", font=font(44), fill=WHITE)
    draw.text((1290, 390), "VIEWS", font=font(44), fill=WHITE)
    bullets = (("3 AGENT SLOTS", "K/D + win rate"), ("3 MAP SLOTS", "map win rate"), ("5 RECENT MATCHES", "result + K/D"), ("FULL CONTROLS", "timer + refresh"))
    y = 495
    for heading, detail in bullets:
        draw.ellipse((1292, y + 11, 1308, y + 27), fill=RED)
        draw.text((1330, y), heading, font=font(24), fill=WHITE)
        draw.text((1330, y + 32), detail, font=font(20, False), fill=MUTED)
        y += 90
    return canvas


def build_controls(standard: Image.Image, states: Image.Image) -> Image.Image:
    canvas = background()
    header(canvas, "MATCH CONTROLS", "Useful while you play", "A glanceable 45 second spike timer and protected Session Reset")
    control_crop = standard.crop((0, 360, standard.width, standard.height))
    controls = resized(control_crop, 1100, 330)
    round_panel(canvas, (90, 330, 1260, 780), 32)
    paste_shadow(canvas, controls, 125, 390)
    timer_crop = states.crop((170, 190, states.width, states.height))
    timers = resized(timer_crop, 520, 250)
    paste_shadow(canvas, timers, 1320, 370)
    draw = ImageDraw.Draw(canvas)
    draw.text((1320, 675), "45 → 20 → 7 → 0", font=font(31), fill=WHITE)
    draw.text((1320, 720), "Normal, warning, critical, complete", font=font(19, False), fill=MUTED)
    x = 205
    for text, accent in (("45 SEC TIMER", AMBER), ("WARNING", AMBER), ("CRITICAL", RED), ("TAP TWICE RESET", RED)):
        x = pill(canvas, x, 840, text, accent)
    return canvas


def build_setup() -> Image.Image:
    canvas = background()
    header(canvas, "ONE TIME SETUP", "Set it once. Every key shares it.", "Account settings are global across the Valorant Tracker plugin")
    round_panel(canvas, (190, 315, 900, 835), 28)
    draw = ImageDraw.Draw(canvas)
    draw.text((235, 350), "RIOT ACCOUNT", font=font(21), fill=WHITE)

    def field(y: int, label: str, value: str, masked: bool = False) -> None:
        draw.text((235, y), label, font=font(18), fill=MUTED)
        draw.rounded_rectangle((235, y + 30, 855, y + 90), radius=10, fill=(10, 10, 14, 255), outline=(62, 62, 75, 255), width=2)
        draw.text((260, y + 47), "••••••••••••" if masked else value, font=font(22, False), fill=WHITE)

    field(405, "Riot ID", "Name#TAG")
    field(520, "Fallback region", "North America (NA)")
    field(635, "HenrikDev API Key", "", True)
    draw.rounded_rectangle((235, 762, 855, 812), radius=10, fill=(42, 23, 26, 255), outline=(*RED, 170), width=2)
    draw.text((435, 775), "OPEN HENRIKDEV DASHBOARD", font=font(17), fill=(255, 220, 223))
    draw.text((1030, 360), "ONE ACCOUNT", font=font(52), fill=WHITE)
    draw.text((1030, 420), "ALL 20 ACTIONS", font=font(52), fill=WHITE)
    bullets = (
        "Riot ID in Name#TAG format",
        "Automatic region detection",
        "Fallback region if detection is unavailable",
        "Paste your HenrikDev API key once",
        "No PackRat account or analytics service",
    )
    y = 535
    for bullet in bullets:
        draw.ellipse((1034, y + 7, 1048, y + 21), fill=RED)
        draw.text((1070, y), bullet, font=font(24, False), fill=MUTED)
        y += 58
    return canvas


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(path, format="PNG", optimize=True)


def verify_png(path: Path, expected: tuple[int, int]) -> None:
    with Image.open(path) as image:
        if image.format != "PNG" or image.size != expected:
            raise SystemExit(f"MARKETPLACE ART FAIL: {path.relative_to(ROOT)} expected PNG {expected}, got {image.format} {image.size}")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    standard = fixture("standard")
    xl = fixture("xl")
    states = fixture("states")

    media = {
        "1-thumbnail.png": build_thumbnail(standard),
        "2-session.png": build_session(standard),
        "3-xl.png": build_xl(xl),
        "4-controls.png": build_controls(standard, states),
        "5-setup.png": build_setup(),
    }
    for name, image in media.items():
        save_png(image, OUT / name)

    save_png(make_icon(288), OUT / "app-icon.png")
    save_png(make_icon(256), PLUGIN_ICONS / "marketplace.png")
    save_png(make_icon(512), PLUGIN_ICONS / "marketplace@2x.png")

    for name in media:
        verify_png(OUT / name, (1920, 960))
    verify_png(OUT / "app-icon.png", (288, 288))
    verify_png(PLUGIN_ICONS / "marketplace.png", (256, 256))
    verify_png(PLUGIN_ICONS / "marketplace@2x.png", (512, 512))

    print("MARKETPLACE ART PASS")
    for path in sorted(OUT.glob("*.png")):
        print(f"  {path.relative_to(ROOT)} {path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
