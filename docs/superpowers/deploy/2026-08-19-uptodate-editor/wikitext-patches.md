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
