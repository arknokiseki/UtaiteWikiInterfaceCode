# Complete Lua modules — paste-ready

Generated from the **live** module source (`Module:Freshness/core` rev 285322,
`Module:Freshness` rev 285323, fetched 2026-08-19) with the colour patch applied.
These are whole files, not diffs — paste each over the entire page.

| File | Wiki page | Status |
|---|---|---|
| `Module-Freshness-core.lua` | `Module:Freshness/core` | **changed** — adds `is_css_color` + `mix`, rewrites the colour branch |
| `Module-Freshness.lua` | `Module:Freshness` | **unchanged** — `pin` is already live; included only for completeness |

The pin/`force-uptodate` work you already applied is preserved as-is.

## Verified before delivery

Executed under a real Lua VM (fengari), not just eyeballed:

- Module loads without syntax or runtime error.
- `is_css_color`: 22 cases (13 accept, 9 hostile/malformed reject), 0 failures —
  identical results to the gadget's `css-color.ts` mirror.
- **Hex path unchanged**, which is the regression that would matter most:
  `#A97A3F` renders `#a97a3f` fresh, `#a68051` at 6 months, `#9a9a9a` at 33
  months — the same values the live module produces today.
- `magenta` → `color-mix(in srgb, magenta 97%, #9a9a9a)`
- `var(--primary-color)` → `color-mix(in srgb, var(--primary-color) 80%, #9a9a9a)`
- unrecognised value → `#c2e3f6`, i.e. the default, exactly as today.
- pinned → colour at full strength, `tier=fresh meter=100 category=up-to-date`.
- forced and undated → `#9a9a9a`.
- `core.render` produces the expected `border-color:` for every path.

Separately verified against this wiki's sanitizer: `color-mix()`, `var()`, X11
names, `rgb()` and short hex all survive an inline `style` attribute, while
`expression(...)` and attribute-breakout attempts become `/* insecure input */`.

## After pasting

1. Purge or null-edit `Chogakusei` and `Chrono Reverse` — the two pages whose
   colour is currently discarded — and confirm they now show their colour.
2. Spot-check one hex page (e.g. `Amatsuki`, `Soraru`) and confirm **nothing
   changed**. That path is meant to be untouched.
3. `color-mix()` needs Chrome 111+ / Firefox 113+ / Safari 16.2+. Older browsers
   fall back to `Template:Freshness/styles.css` — degraded, not broken.
