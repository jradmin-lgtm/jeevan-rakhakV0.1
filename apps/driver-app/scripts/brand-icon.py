#!/usr/bin/env python3
"""
v1.0.15 — brand the driver-app icon with a "DRIVER" ribbon so users can
distinguish it from the patient app on the Play Store + Android launcher.

Reads `assets/icon-source.png` (a 1:1 copy of the original icon kept under
version control as the brand-able source) and writes:
  - `assets/icon.png`           — full-bleed (1024×1024) used for Play Store
  - `assets/adaptive-icon.png`  — same composite (Expo auto-handles foreground/
                                  background masking from app.json)

Idempotent: re-running rebuilds from source each time. Run BEFORE
`./gradlew assembleRelease` so the APK picks up the latest brand.

Usage:
  python3 apps/driver-app/scripts/brand-icon.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent / "assets"

SOURCE_ICON = ASSETS / "icon-source.png"
SOURCE_ADAPTIVE = ASSETS / "adaptive-icon-source.png"
OUT_ICON = ASSETS / "icon.png"
OUT_ADAPTIVE = ASSETS / "adaptive-icon.png"

# Brand styling
RIBBON_COLOR = (229, 50, 43, 255)        # JR primary red
TEXT_COLOR = (255, 255, 255, 255)
LABEL = "DRIVER"


def brand(src_path: Path, dst_path: Path) -> None:
    img = Image.open(src_path).convert("RGBA")
    w, h = img.size
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # Ribbon = bottom 22% of the icon, full-width. Sits behind a corner-
    # rounded mask is unnecessary because the Android launcher already crops
    # to the adaptive-icon shape (Expo handles that via app.json's
    # backgroundColor + foregroundImage).
    ribbon_h = int(h * 0.22)
    ribbon_y0 = h - ribbon_h
    draw.rectangle([(0, ribbon_y0), (w, h)], fill=RIBBON_COLOR)

    # Font: try a few macOS system fonts, fall back to PIL default.
    font_size = int(ribbon_h * 0.55)
    font = None
    for cand in (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial Bold.ttf",
    ):
        try:
            font = ImageFont.truetype(cand, font_size)
            break
        except (OSError, IOError):
            continue
    if font is None:
        font = ImageFont.load_default()

    # Centre the text inside the ribbon.
    bbox = draw.textbbox((0, 0), LABEL, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    tx = (w - text_w) // 2
    ty = ribbon_y0 + (ribbon_h - text_h) // 2 - bbox[1]
    # Letter-spacing via per-glyph draw — PIL Image draw doesn't support
    # letter-spacing natively, so render the word once. The font is bold
    # enough that "DRIVER" reads cleanly at this size.
    draw.text((tx, ty), LABEL, fill=TEXT_COLOR, font=font)

    composite = Image.alpha_composite(img, overlay)
    composite.save(dst_path, format="PNG", optimize=True)
    print(f"  wrote {dst_path.relative_to(ASSETS.parent)}")


def main() -> None:
    if not SOURCE_ICON.exists():
        raise SystemExit(f"missing source icon: {SOURCE_ICON}")
    print(f"[brand-icon] icon-source.png -> icon.png")
    brand(SOURCE_ICON, OUT_ICON)
    if SOURCE_ADAPTIVE.exists():
        print(f"[brand-icon] adaptive-icon-source.png -> adaptive-icon.png")
        brand(SOURCE_ADAPTIVE, OUT_ADAPTIVE)
    else:
        # No separate adaptive source — copy the branded icon as adaptive too.
        print(f"[brand-icon] no adaptive-icon-source, mirroring icon.png")
        brand(SOURCE_ICON, OUT_ADAPTIVE)


if __name__ == "__main__":
    main()
