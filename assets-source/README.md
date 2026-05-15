# Icon source

Save the **Jeevan Rakshak icon** PNG here as `jr-icon.png`.

```
assets-source/
└── jr-icon.png       ← drop your icon here (≥1024×1024 PNG ideal)
```

Then from the monorepo root run:

```bash
bash scripts/build-icons.sh
```

That script uses macOS `sips` to generate:

- `apps/user-app/assets/{icon,adaptive-icon,splash}.png`
- `apps/driver-app/assets/{icon,adaptive-icon,splash}.png`

EAS Build will regenerate every Play-Store density variant from the 1024 px PNG, so we only ship one source file per app.

## Quality notes

- A clean **1024×1024 PNG** is ideal; the build script will upscale smaller sources but quality suffers.
- The Android adaptive-icon **foreground** lives inside a 66 %-of-canvas safe zone — keep the JR + ambulance artwork inside the inner ~675 × 675 px area of your 1024² PNG to avoid cropping in launcher icons.
- The adaptive-icon **background color** is set per-app in `app.json` (`#E5322B` for user, `#0F172A` for driver); leave the icon background white or transparent so the brand color shows around it.
