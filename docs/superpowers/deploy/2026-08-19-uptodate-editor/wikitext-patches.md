# Wikitext patches — prerequisites for `force-uptodate`

Apply by hand. Until these land, the gadget's force-uptodate checkbox writes
`force-uptodate=yes` into the template and the parameter is simply ignored —
nothing breaks, and every other field the modal edits works today.

Revisions these patches were written against (fetched 2026-08-19):

| Page | Revision |
|---|---|
| `Module:Freshness/core` | 282527 |
| `Module:Freshness` | 282524 |
| `Template:Uptodate` | 282525 |

If those revisions have moved on, re-read the pages before applying.

> **Lua version note:** Scribunto runs Lua 5.1, which has no `\u{...}` string
> escape. The em dash below is written as a literal character on purpose.

---

## 1. `Module:Freshness/core`

### 1a. Add a pin path in `core.decide`

Find:

```lua
  local forced = (params.force == true) or (reason ~= nil) or (not dated)

  local tier = forced and "outdated" or core.classify(months)
```

Replace with:

```lua
  local forced = (params.force == true) or (reason ~= nil) or (not dated)
  -- A pin marks a list complete for a singer who is no longer active, so it
  -- must stop ageing. An explicit outdated flag still wins over a pin.
  local pinned = (params.pin == true) and dated and not forced

  local tier
  if forced then tier = "outdated"
  elseif pinned then tier = "fresh"
  else tier = core.classify(months) end
```

### 1b. Make the state table pin-aware

In the same function, find:

```lua
    color = forced and core.GREY or core.fade(base, months),
    meter = forced and 3 or core.meter(months),
```

Replace with:

```lua
    pinned = pinned,
    color = forced and core.GREY or (pinned and base or core.fade(base, months)),
    meter = forced and 3 or (pinned and 100 or core.meter(months)),
```

`category` already reads `(tier == "fresh") and "up-to-date" or "outdated"`, so
it follows the pinned tier automatically — leave it alone.

### 1c. Add a pinned message in `core.render`

Find:

```lua
  elseif state.forced then
    line = "This song list is flagged as outdated."
  else
```

Replace with:

```lua
  elseif state.forced then
    line = "This song list is flagged as outdated."
  elseif state.pinned then
    line = "Song list last updated <b>" .. esc_none(state.date)
        .. "</b>. Pinned as complete — this singer is no longer active."
  else
```

---

### 1d. Accept `var()`, X11 names and short hex for `bordercolor`

**Problem.** `core.is_hex` accepts only `^#?%x%x%x%x%x%x$`. Anything else is
silently discarded and the box renders `BASE_DEFAULT` with no warning. Two live
pages hit this today:

| Page | `bordercolor` | Renders as |
|---|---|---|
| Chogakusei | `magenta` | default `#c3e6f9` |
| Chrono Reverse | `var(--primary-color)` | default `#c3e6f9` |

Lua cannot resolve `var(--x)` or an X11 name to RGB, so it cannot fade them
numerically. The browser can, via `color-mix()` — Lua computes only the
percentage, so the ageing curve stays identical to the numeric fade.

Verified against this wiki's sanitizer: `color-mix(...)`, `var(--x)`, X11
names, `rgb()` and short hex all survive an inline `style` attribute intact,
while `expression(...)` and attribute-breakout attempts are replaced with
`/* insecure input */`.

**Hex keeps the existing numeric path unchanged**, so the 26 pages that work
today render byte-identically. Only the 2 broken ones change.

Add next to `core.is_hex`:

```lua
-- Conservative allowlist of CSS colour syntaxes we are willing to emit into an
-- inline style. Anything that could break out of the attribute is rejected
-- here; MediaWiki's sanitizer is a second line of defence, not the first.
function core.is_css_color(s)
  if type(s) ~= "string" then return false end
  s = s:gsub("^%s+", ""):gsub("%s+$", "")
  if s == "" then return false end
  if s:find('[;{}"\'<>\\]') then return false end
  local low = s:lower()
  if low:find("expression") or low:find("javascript") or low:find("url") then return false end
  if s:match("^#%x%x%x$") or s:match("^#%x%x%x%x$")
     or s:match("^#%x%x%x%x%x%x$") or s:match("^#%x%x%x%x%x%x%x%x$") then return true end
  if s:match("^%a[%w%-]*$") then return true end                       -- magenta, rebeccapurple
  if s:match("^var%(%s*%-%-[%w%-]+%s*%)$") then return true end         -- var(--x)
  if s:match("^var%(%s*%-%-[%w%-]+%s*,[^()]*%)$") then return true end  -- var(--x, fallback)
  if s:match("^rgba?%([%d%s%.,%%/]*%)$") then return true end
  if s:match("^hsla?%([%d%s%.,%%/deg]*%)$") then return true end
  return false
end

-- Fades an arbitrary CSS colour toward grey in the browser, since Lua cannot
-- resolve var() or named colours to RGB. The percentage is still computed here,
-- so the ageing curve matches core.fade exactly.
function core.mix(css, months)
  local f = clamp(months / core.FADE_MAX, 0, 1)
  return "color-mix(in srgb, " .. css .. " " .. round((1 - f) * 100) .. "%, " .. core.GREY .. ")"
end
```

Then in `core.decide`, find:

```lua
  local base = (params.base and core.is_hex(params.base)) and params.base or core.BASE_DEFAULT
```

Replace with:

```lua
  -- Hex keeps the exact numeric fade it has always had, so existing pages do
  -- not shift. Other valid CSS colours are faded in the browser instead.
  local raw = params.base
  local base = (raw and core.is_hex(raw)) and raw or core.BASE_DEFAULT
  local css = nil
  if raw and not core.is_hex(raw) and core.is_css_color(raw) then css = raw end
```

And replace the `color` line from step 1b with an explicit branch, placed just
before the `state` table:

```lua
  local color
  if forced then
    color = core.GREY
  elseif pinned then
    color = css or base          -- pinned pages show the colour at full strength
  elseif css then
    color = core.mix(css, months)
  else
    color = core.fade(base, months)
  end
```

then in the `state` table use simply:

```lua
    color = color,
```

**Browser support.** `color-mix()` requires Chrome 111+, Firefox 113+, Safari
16.2+ (all shipped 2023). Older browsers ignore the declaration and fall back to
whatever `Template:Freshness/styles.css` sets, which degrades gracefully.

### Verification for 1d

1. `{{Uptodate|<3 months ago>|bordercolor=magenta}}` renders a magenta-ish
   border, not the default blue.
2. `{{Uptodate|<3 months ago>|bordercolor=var(--primary-color)}}` follows the
   skin's primary colour.
3. `{{Uptodate|<3 months ago>|bordercolor=#A97A3F}}` renders **exactly** the same
   as before this patch — confirm against a saved screenshot or the current
   value, since this path must not shift.
4. `{{Uptodate|<40 months ago>|bordercolor=magenta}}` renders grey.
5. `{{Uptodate|X|bordercolor=red;background:url(//evil.example/x)}}` produces no
   style injection — MediaWiki replaces it with `/* insecure input */`.

---

## 2. `Module:Freshness`

In `p.render`, find:

```lua
    force = (a['force-outdated'] == 'yes') or (a.status == 'outdated'),
```

Add a line directly beneath it:

```lua
    pin = (a['force-uptodate'] == 'yes'),
```

---

## 3. `Template:Uptodate`

Current content (rev 282525):

```
<includeonly>{{Freshness|{{{1|}}}|base={{{bordercolor|{{{base|}}}}}}|discography={{{discography|}}}|needrom={{{needrom|}}}|nocat={{{nocat|}}}|customlatesteditor={{{customlatesteditor|}}}|lastedittext-nolink={{{lastedittext-nolink|}}}}}</includeonly><noinclude>{{documentation}}</noinclude>
```

Replace with:

```
<includeonly>{{Freshness|{{{updated-at|{{{1|}}}}}}|base={{{bordercolor|{{{base|}}}}}}|discography={{{discography|}}}|needrom={{{needrom|}}}|nocat={{{nocat|}}}|customlatesteditor={{{customlatesteditor|}}}|lastedittext-nolink={{{lastedittext-nolink|}}}|force-uptodate={{{force-uptodate|}}}|force-outdated={{{force-outdated|}}}|status={{{status|}}}|reason={{{reason|}}}}}</includeonly><noinclude>{{documentation}}</noinclude>
```

What changed and why:

- **`{{{1|}}}` → `{{{updated-at|{{{1|}}}}}}`** — names the date parameter while
  keeping the unnamed fallback, so all 88 live `/Songs` pages using the
  positional form keep working unchanged.
- **`force-uptodate` added** — the new pin flag. **Named-only, no positional
  slot**, deliberately: live pages still carry legacy empty `pos2`/`pos3` (and
  occasionally `pos4`) values from the long-removed `type`/`time` parameters, so
  claiming a positional slot would collide with real wikitext.
- **`force-outdated`, `status`, `reason` added** — `Module:Freshness` has always
  read these, but `Template:Uptodate` never forwarded them, so they were dead
  through `{{Uptodate}}`. This closes a pre-existing gap.

---

## Verification after applying

On a sandbox page:

1. `{{Uptodate|January 1, 2020}}` renders **Outdated**.
2. `{{Uptodate|January 1, 2020|force-uptodate=yes}}` renders **Up to date**,
   full meter, unfaded border.
3. `{{Uptodate|January 1, 2020|force-uptodate=yes|reason=Missing 2021 covers}}`
   renders **Outdated** — reason must beat pin.
4. `{{Uptodate|January 1, 2020|force-uptodate=yes|force-outdated=yes}}` renders
   **Outdated** — explicit outdated must beat pin.
5. `{{Uptodate|updated-at=January 1, 2020}}` renders identically to the
   positional form.
6. `{{Uptodate|February 1, 2026}}` (recent) still renders **Up to date** with a
   normal meter — the pin path must not disturb undated/fresh behaviour.
7. Category check: a pinned page should land in
   `Category:Utaite with up-to-date covered song list`, not the outdated one.

### The `{{Uptodate/sync}}` propagation check

Do this one explicitly — it is the least obvious part.

`{{Uptodate/sync}}` runs through **`Module:Uptodate`**, *not*
`Module:Freshness.fromSubpage`. Its rebuild loop forwards every named parameter
except `nocat`, so `force-uptodate` *should* reach the article — but that is
incidental behaviour rather than something designed for this, so confirm it:

1. Put `{{Uptodate|January 1, 2020|force-uptodate=yes}}` on a test `/Songs` subpage.
2. Put `{{Uptodate/sync}}` on its parent article.
3. Purge the article and confirm its box shows **Up to date**.

If it does not propagate, the fix is in `Module:Uptodate.getUptodateFromSubpage`,
whose named-parameter loop currently excludes only `nocat`.
