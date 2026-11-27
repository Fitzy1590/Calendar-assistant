---
paths: ["src/styles.css", "src/lib/themes.ts", "src/lib/themes.test.ts", "src/components/SetupParts.tsx", "src/components/ThemeSwitcher.tsx"]
---

# Theme engine

- A theme = one `[data-theme="id"]` block in `styles.css` with opaque `#rrggbb` tokens (`--bg --surface --surface-2 --text --muted --faint --line --line-strong --ok --warn --bad`). Effects (blur, glow, shadows) go in separate rules at the end of the file.
- Adding one: token block, `ThemeName` (types.ts), `THEME_ACCENTS` (themes.ts), `THEMES` (SetupParts.tsx), `set_theme` enum (assistant.ts), the id in `themes.test.ts`. Dark themes also join the two dark lists for `--n-*` (notes) and `--k-*` (email colours).
- `themes.test.ts` enforces AA text/muted/status contrast and accent button/outline contrast; fix the colour, not the test.
- Switching is instant: new themes set `transition: none`. The top-bar `ThemeSwitcher` opens the same `ThemePicker` as Settings.
- Fonts come from the `index.html` Google Fonts link; effect themes fall back to system fonts.
