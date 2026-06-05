#!/usr/bin/env python3
"""
v1.1.0 — generate the driver-app launcher icons from the branded "DRIVER"
logo (heart + ECG + road + DRIVER wordmark). Replaces the old brand-icon.py
ribbon overlay — the new artwork already carries the DRIVER label.

Reads  assets/driver-logo-source.png  (the supplied logo, kept under VC)
Writes assets/icon.png           — 1024² launcher / Play-Store icon, white bg,
                                    logo trimmed + fit to ~88% of the canvas
       assets/adaptive-icon.png  — 1024² Android adaptive foreground, logo fit
                                    inside the ~64% centre safe-zone (the
                                    launcher crops to circle/squircle and clips
                                    everything outside ~66%), transparent
                                    margin so app.json backgroundColor shows.

Idempotent. Run BEFORE ./gradlew assembleRelease.
Usage:  python3 apps/driver-app/scripts/make-icon.py
"""
import re
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent / "assets"
SOURCE = ASSETS / "driver-logo-source.png"
OUT_ICON = ASSETS / "icon.png"
OUT_ADAPTIVE = ASSETS / "adaptive-icon.png"

# Native Android resources — the gradle build reads these, NOT app.json
# (we don't re-run `expo prebuild`, which would wipe the autolinking override).
RES = HERE.parent / "android" / "app" / "src" / "main" / "res"
# density -> (legacy ic_launcher px, adaptive foreground px)
DENSITIES = {
    "mdpi": (48, 108),
    "hdpi": (72, 162),
    "xhdpi": (96, 216),
    "xxhdpi": (144, 324),
    "xxxhdpi": (192, 432),
}
ICON_BG_HEX = "#FFFFFF"  # adaptive background — white, to match the logo

CANVAS = 1024
WHITE = (255, 255, 255, 255)
ICON_FILL = 0.82        # square launcher/Play-Store icon (full logo, slight margin)
# The "DRIVER" wordmark is wide + low, so a circular mask clips it unless the
# whole logo fits inside the safe-zone circle. 0.50 is the largest fill where
# the full logo (heart + road + DRIVER) is visible on a circle (verified by
# rendering the circle-masked preview). Used for the adaptive foreground AND
# the legacy round icon.
ADAPTIVE_FILL = 0.50


def content_bbox(img: Image.Image):
    """Bounding box of non-white, non-transparent pixels."""
    rgba = img.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    minx, miny, maxx, maxy = w, h, 0, 0
    found = False
    # Sample stride keeps it fast on a 1.5k image without missing the wordmark.
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 16 and not (r > 244 and g > 244 and b > 244):
                found = True
                if x < minx: minx = x
                if x > maxx: maxx = x
                if y < miny: miny = y
                if y > maxy: maxy = y
    if not found:
        return (0, 0, w, h)
    return (minx, miny, maxx + 1, maxy + 1)


def fit_centered(logo: Image.Image, fill: float, background) -> Image.Image:
    canvas = Image.new("RGBA", (CANVAS, CANVAS), background)
    box = CANVAS * fill
    lw, lh = logo.size
    scale = min(box / lw, box / lh)
    nw, nh = max(1, int(lw * scale)), max(1, int(lh * scale))
    resized = logo.resize((nw, nh), Image.LANCZOS)
    canvas.alpha_composite(resized, ((CANVAS - nw) // 2, (CANVAS - nh) // 2))
    return canvas


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"missing source logo: {SOURCE}")
    src = Image.open(SOURCE).convert("RGBA")
    logo = src.crop(content_bbox(src))
    print(f"[make-icon] source {src.size} -> trimmed {logo.size}")
    # Launcher / Play-Store icon: white background, large logo.
    fit_centered(logo, ICON_FILL, WHITE).save(OUT_ICON, format="PNG", optimize=True)
    print(f"  wrote {OUT_ICON.relative_to(ASSETS.parent)}")
    # Adaptive foreground: transparent margin, logo inside the safe-zone.
    fit_centered(logo, ADAPTIVE_FILL, (255, 255, 255, 0)).save(OUT_ADAPTIVE, format="PNG", optimize=True)
    print(f"  wrote {OUT_ADAPTIVE.relative_to(ASSETS.parent)}")

    write_native(logo)


def write_native(logo: Image.Image) -> None:
    """Regenerate the per-density mipmap webp resources + white background so
    the gradle APK reflects the new icon without an `expo prebuild`."""
    if not RES.exists():
        print(f"[make-icon] native res dir absent ({RES}) — skipping native regen")
        return
    for dens, (legacy_px, fg_px) in DENSITIES.items():
        d = RES / f"mipmap-{dens}"
        if not d.exists():
            continue
        # Legacy SQUARE icon: full logo at ICON_FILL on white.
        legacy = fit_centered(logo, ICON_FILL, WHITE).resize((legacy_px, legacy_px), Image.LANCZOS)
        legacy.convert("RGB").save(d / "ic_launcher.webp", format="WEBP", lossless=True)
        # Legacy ROUND icon: the launcher renders this as a circle, so use the
        # circle-safe fill (same as the adaptive foreground) — otherwise the
        # wide "DRIVER" wordmark clips.
        roundIcon = fit_centered(logo, ADAPTIVE_FILL, WHITE).resize((legacy_px, legacy_px), Image.LANCZOS)
        roundIcon.convert("RGB").save(d / "ic_launcher_round.webp", format="WEBP", lossless=True)
        # Adaptive foreground keeps transparency + safe-zone fill.
        fg = fit_centered(logo, ADAPTIVE_FILL, (255, 255, 255, 0)).resize((fg_px, fg_px), Image.LANCZOS)
        fg.save(d / "ic_launcher_foreground.webp", format="WEBP", lossless=True)
        print(f"  wrote mipmap-{dens}/ (ic_launcher {legacy_px}px, foreground {fg_px}px)")
    # Adaptive background color -> white.
    colors = RES / "values" / "colors.xml"
    if colors.exists():
        txt = colors.read_text()
        new = re.sub(
            r'(<color name="iconBackground">)#[0-9A-Fa-f]{6,8}(</color>)',
            r"\g<1>" + ICON_BG_HEX + r"\g<2>",
            txt,
        )
        if new != txt:
            colors.write_text(new)
            print(f"  set iconBackground -> {ICON_BG_HEX}")


if __name__ == "__main__":
    main()
