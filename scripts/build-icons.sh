#!/usr/bin/env bash
# Generate Expo / Play-Store icon + splash assets for both mobile apps from a
# single source PNG. Uses macOS `sips` (built-in, no install needed).
#
# Usage:
#   1. Save the Jeevan Rakshak icon as: jeevan_rakshak/assets-source/jr-icon.png
#      (ideal: 1024x1024 PNG with transparent or solid-color background)
#   2. Run:  bash scripts/build-icons.sh
#
# Outputs per app (apps/user-app/assets/ and apps/driver-app/assets/):
#   - icon.png            1024x1024 square (used by Expo for store icon)
#   - adaptive-icon.png   1024x1024 square (Android adaptive-icon foreground)
#   - splash.png          2048x2048 square (Expo crops to device at runtime)

set -euo pipefail

# Move to the monorepo root regardless of where the script is invoked from.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SRC="assets-source/jr-icon.png"

if [[ ! -f "$SRC" ]]; then
  echo "✗  Source icon not found at: $SRC" >&2
  echo "   Save the 1024x1024 JR icon there, then re-run." >&2
  exit 1
fi

W=$(sips -g pixelWidth  "$SRC" | awk '/pixelWidth/{print $2}')
H=$(sips -g pixelHeight "$SRC" | awk '/pixelHeight/{print $2}')
echo "→  Source: $SRC  (${W}x${H})"
if (( W < 1024 || H < 1024 )); then
  echo "   ⚠  source is smaller than 1024px — quality after upscale will suffer."
  echo "   For best result, replace with a >=1024x1024 PNG and re-run."
fi

build_for_app() {
  local app_dir="$1"
  local out="apps/${app_dir}/assets"
  mkdir -p "$out"
  echo "→  Building for $app_dir..."

  # 1024x1024 square icon, white-padded if source isn't square.
  sips -s format png \
       -Z 1024 \
       "$SRC" --out "$out/_scaled.png" >/dev/null
  sips -p 1024 1024 --padColor FFFFFF \
       "$out/_scaled.png" --out "$out/icon.png" >/dev/null

  # Adaptive-icon foreground: same 1024x1024 with white pad. Android renders the
  # brand color (red/navy) behind it via `android.adaptiveIcon.backgroundColor`.
  cp "$out/icon.png" "$out/adaptive-icon.png"

  # Splash: 2048x2048 square, padded with white. Expo's `splash.resizeMode:
  # contain` will fit + center it on the brand-color background at runtime.
  sips -p 2048 2048 --padColor FFFFFF \
       "$out/_scaled.png" --out "$out/splash.png" >/dev/null

  rm -f "$out/_scaled.png"
  echo "   ✓ $out/icon.png, adaptive-icon.png, splash.png"
}

build_for_app user-app
build_for_app driver-app

echo
echo "Done. Verify by running 'pnpm --filter @jr/user-app dev' and 'pnpm --filter @jr/driver-app dev'."
echo "EAS Build will regenerate Play-Store density variants from the 1024px icons automatically."
