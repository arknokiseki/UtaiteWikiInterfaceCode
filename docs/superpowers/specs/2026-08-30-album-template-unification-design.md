# Album template unification — design

**Date:** 2026-08-30
**Status:** Approved for planning
**Scope:** `Template:AlbumType2`, `Template:Track`, new `Module:Album`, album CSS in `src/gadgets/styling/citizen/citizen-templates.less`, DataTables gating in `src/gadgets/core/datatables/`

## 1. Problem

Two album templates exist and neither is fit to be the survivor.

`Template:Album` (350 ns-0 pages, 1,475 calls) is a portable-infobox with the per-track block copy-pasted 30 times. It caps at 30 tracks — its own source says *"If you find an utaite album with more than 30 tracks, please contact an admin."* Three live albums exceed the cap and one reaches 154 tracks; those tracks render nowhere.

`Template:AlbumType2` (166 ns-0 pages, 783 calls) is more modern but cannot render at all without `{{Track}}`: it splices `{{{track}}}` raw inside `<table>`, and `{{Track}}` emits `<tr>…</tr>`. Its documentation was last edited 2025-04-24 against a template last edited 2026-07-23 — fifteen months stale.

### Measured baseline

Parser limit reports from the live wiki, heaviest page of each family:

| | `MARiA/Discography` (26 × Album) | `Yuikonnu/Discography` (33 × AlbumType2, 234 rows) |
|---|---|---|
| CPU time | **8.095 s** | 2.090 s |
| Wall time | 11.077 s | 2.267 s |
| Lua time | none used | 1.144 s / 10.000 |
| Lua memory | — | 1.45 MB / 52.4 MB |
| Dominant cost | `Template:Album` 10,792 ms (99.58%) | see below |

`Template:Album` costs **~415 ms per invocation**; `AlbumType2` ~48 ms. `{{Track}}` costs **~1 ms per row** (236 ms for 234 calls) and is not a cost problem. Lua sits at 11% of its time budget and 3% of memory.

Conclusion: moving rendering into Lua is a performance *win*. One `#invoke` replaces N template expansions.

### Client-side baseline

Every one of the 783 tables boots DataTables with `data-page-length="25"` and `data-search-panes="true"`, yet:

```
rows per table:  p25=4  median=7  p75=12  p90=16  p99=25  max=44
tables <= 10 rows: 528 of 783 (67%)
tables <= 25 rows: 776 of 783 (99%)
```

`Yuikonnu/Discography` initialises 23 DataTable instances for 234 total rows.

### Data quality

Across 1,475 `{{Album}}` calls there are **256 distinct parameter names**, mostly typos (`trac9arranger`, `track4lyrcist`, `trakk6info`, `tracl7composer`, `crossfadeYTID`, `daterealeased`, `albumArtist`). Across 783 `{{AlbumType2}}` calls, 39 names including `JPshops`, `spotifyalbumID`, `officialjapptitle`. All silently render nothing today.

Editors also reach for fields neither template supports: `track#mixer` (×4), `track8guitar`, `track#note`/`notes`, `label`, `jpshops`, `spotifyalbumid`, `itunes`.

Empty-parameter ritual is widespread: `additionalshortinfo` is present on 95% of track rows and **empty in half of them** (3,113 of 6,224); `track#arranger` is empty 6,255 times.

## 2. Goals

1. One template renders every album, with **unlimited tracks**.
2. Accept three input dialects without page edits: new `t1*`, legacy `track1*`, and legacy `{{Track}}` rows.
3. Reduce parser cost per album and DataTables instances per page.
4. Improve desktop and mobile presentation: modern, sophisticated, not overwhelming.
5. Fix cover-image rendering, which is currently reader-dependent and can crop.

### Non-goals

- Rewriting `Template:Album` in this phase. It is redirected to the unified template only after AlbumType2 is proven.
- Preserving `Template:Album`'s portable-infobox theming. It is explicitly dropped: when Album is redirected its pages adopt the new card wholesale.
- Migrating existing pages to the new `t1*` scheme. Legacy dialects keep working indefinitely.
- Changing `Template:Tabber`, `Module:Tabber`, or the TabberNeue extension.
- Bucket / `Module:Bucket` collab-album indexing behaviour, which is carried over unchanged.

## 3. Decisions taken

| Decision | Choice | Rationale |
|---|---|---|
| Where it ships | Evolve **`Template:AlbumType2` in place** | 166 pages is a smaller blast radius than Album's 350; `Template:Album` is redirected later |
| Substrate | **`Module:Album`** (Lua) + adaptive shell | Only way to get unlimited tracks; measured as cheaper than wikitext expansion |
| Tab shell | **`{{Tabber}}`** via `Module:Tabber` | Already promoted and mature: TemplateData, `hideN`, `id=` deep-linking |
| Track row model | **Columns that earn their place**; collapsed credit line on mobile | Kills 6,255 empty arranger cells; median album drops 7 columns → 4 |
| Canonical params | **`t1title` family** + aliases | Short to type at scale, visually distinct from `track1title` |
| `{{Track}}` ingestion | **`{{Track}}` emits data, not markup** | Lets all 166 legacy pages gain the redesign with zero page edits |
| `group` rendering | **Section headers or row badges**, never a column | `group` is an edition/disc partition, not a credit |

## 4. Architecture

```
Template:AlbumType2   thin wrapper  ->  {{#invoke:Album|main}}
Template:Album        (later)       ->  {{#invoke:Album|main}}
Template:Track        emits a delimited record, not <tr>

Module:Album
  ├── ingest      three dialects -> one normalised album model
  ├── normalise   aliases, typo map, N/A stripping, numbering
  ├── analyse     which columns are earned; group contiguity
  └── render      card + metadata grid + tracklist + Tabber tabs
```

`Module:Album` calls `Module:Tabber` directly rather than round-tripping through `{{Tabber}}` wikitext.

### 4.1 The normalised model

Every dialect resolves to:

```lua
album = {
  titles   = { japanese=, romaji=, english=, display= },
  cover    = { image=, alts={…}, artist=, link= },
  meta     = { released=, label=, catalog=, singers= },
  media    = { streams=, spotify=, jpshops=, shops=, crossfadeYT=, crossfadeNND=, gallery= },
  tracks   = { { n=, title=, info=, utaite=, lyricist=, composer=, arranger=, group= }, … },
  flags    = { type=, groupstyle=, suppressacg= },
}
```

Rendering reads only this model. Dialect handling exists solely at ingest.

### 4.2 Parameter contract

**Canonical (new):**

```
|t1title=  |t1info=  |t1utaite=  |t1lyricist=  |t1composer=  |t1arranger=  |t1group=
```

Unlimited `N`. Aliases: `t1singers` → `t1utaite`.

**Legacy Album dialect:** `track1title`, `track1info`, `track1utaite`, `track1lyricist`, `track1composer`, `track1arranger` — accepted verbatim.

**Legacy Track dialect:** `|track=` containing `{{Track}}` rows.

**Track discovery must not stop at the first gap.** Album's current behaviour discards every track after a missing number. The module instead scans all arguments matching `^t(%d+)title$` and `^track(%d+)title$`, takes the maximum index, and iterates 1..max, skipping empty slots. This is what makes the 154-track album work.

### 4.3 `{{Track}}` as a data emitter

`{{Track}}` is effectively private to `{{AlbumType2}}`:

```
Template:Track transcluded on 183 pages
  ns 0: 167   ns 2: 4   ns 4: 4   ns 10: 4   ns 14: 3   ns 844: 1
ns-0 pages using Track:     167
  ...also using AlbumType2: 166   (the 1 exception is itself transcluded into a |track=)
{{Track}} calls on those pages: 6,572
  inside a |track= value:       6,565
  loose:                            7
```

New output — record separator `U+241E` (␞), field separator `U+241F` (␟):

```
<includeonly>{{#if:{{{title|}}}|␞{{{1|}}}␟{{{title|}}}␟{{{additionalshortinfo|}}}␟{{{utaite|{{{singers|}}}}}}␟{{{lyricist|}}}␟{{{composer|}}}␟{{{arranger|}}}␟{{{group|}}}}}</includeonly>
```

**These separators were chosen by probing the live wiki, not by preference.** `action=expandtemplates` shows that real C0 controls do not survive: MediaWiki replaces U+001E/U+001F with U+FFFD during parsing, and the numeric entities `&#30;`/`&#31;` survive only as literal five-character text. Either would have meant `{{Track}}` records never parsed after cutover. U+241E and U+241F pass through expansion unchanged, including inside a template parameter, and are conspicuous if a record ever escapes unparsed.

A printable separator is still safe against content collision, and a distinctive one is needed because track values carry arbitrary wikitext and nested templates (`{{VW}}` ×2,396, `{{Orikyoku}}` ×1,020, `{{yt}}` ×928, `{{Ruby/rt}}` ×573) that can emit pipes, brackets, tables and strip markers. Field values are never split further, so extension strip markers pass through opaquely.

Because U+241E/U+241F are three UTF-8 bytes each, the module cannot express a negated character class for them and splits on plain substring finds instead.

**Transitional tolerance.** Template edits purge dependent pages lazily, so a cached page may deliver old `<tr>` output to a new module. If `Module:Album` sees `<tr` in `|track=` and no `U+241E`, it passes the content through into a fixed-column table exactly as today, and emits a tracking category. This removes any ordering requirement between the two template edits.

### 4.4 Normalisation rules

1. `N/A` and `-` normalise to empty. `{{Track}}` already renders `N/A` for an empty lyricist, and editors have typed it literally; left alone, a column of nothing but `N/A` would defeat the earned-column test.
2. A typo map covers observed misspellings (`trac9arranger`, `track4lyrcist`, `trakk6info`, `tracl7info`, `tracl7composer`, `trach1info`, `track5lyricst`, `track7yricist`, `track11arrange`, `track1arrange`, `track12arrange`, `track13arrangement`, `crossfadeYTID`, `cossradeNNDID`, `crossdafeNNDID`, `crossfadend`, `daterealeased`, `releasedate`, `albumArtist`, `JPshops`, `spotifyalbumID`, `officialjapptitle`). Mapped values render correctly and add a maintenance category.
3. Unknown parameters render nothing but add `[[Category:Album template with unknown parameters]]`, so the remaining long tail becomes findable instead of silent.
4. Unsupported-but-attempted fields (`mixer`, `guitar`, `note`/`notes`) are appended to the track's `info` rather than discarded.

## 5. Rendering

### 5.1 Card

Layout **A** proportions (cover left, details right) with **C**'s metadata treatment.

Metadata moves from stacked `<div>`s with inline `<strong>` labels to a definition grid:

```html
<dl class="album-meta">
  <dt>Released</dt><dd>2024-08-14</dd>
  <dt>Label</dt><dd>Balloon Rec.</dd>
</dl>
```
```less
.album-meta { display: grid; grid-template-columns: auto 1fr; gap: 5px 14px; }
.album-meta dt { color: var(--text-tertiary); font-weight: 400; white-space: nowrap; }
```

Rationale: values align into one scannable column despite labels of different length; labels stop competing with the album title for emphasis; long `singers` values wrap inside their own column instead of under the label; and absent rows cost nothing, which matters because only 25% of albums have `label`, 3% `singers`, 2% `catalognumber`.

### 5.2 Cover image

Current desktop CSS is defective:

```less
.album-cover     { flex: 1; max-width: 30%; overflow: hidden; }
.album-cover img { border-radius: 8px; }   /* no width, height, or object-fit */
```

The cover is emitted as `[[File:…|thumb|…]]`, so its width is whatever MediaWiki's thumbnailer produces — **which follows each reader's thumbnail-size preference**. With `overflow: hidden` and no sizing rule, a wider thumb is silently cropped and a narrower one floats in dead space. Below 1024px the rules are already correct.

Replacement: a fixed square box, since album covers are effectively always 1:1.

```less
.album-cover {
  flex: 0 0 auto;
  width: clamp(120px, 22%, 220px);
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border-radius: 8px;
}
.album-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
```

The image is emitted with an explicit pixel width rather than `thumb`, so rendering no longer varies per reader. `figure`/caption is dropped on desktop; `albumartist` already appears in the metadata grid.

### 5.3 Tracklist

**Fixed spine, adaptive tail.** These five columns are always rendered:

```
# | Title | Utaite | Lyricist | Composer
```

`Arranger` and `Group` adapt — rendered only if some track on that album fills them. `Details` is removed as a column entirely; `info` becomes inline secondary text on the title, since it is empty in half its uses (3,113 of 6,224).

`Utaite` is deliberately *not* adaptive. `{{Track}}` already falls back to the page's own singer when the field is blank:

```
<td>{{#if:{{{utaite|{{{singers|}}}}}}|{{{utaite|{{{singers}}}}}}|{{ROOTPAGENAME}}}}</td>
```

so the column is never actually empty, and making it adaptive would be a regression rather than a saving. That fallback is preserved.

Measured on `Yuikonnu/Discography`, whose 32 albums span 4 distinct coverage shapes:

| Column rule | Distinct header rows | Stable leading columns |
|---|---|---|
| Fully adaptive | 4 | 2 |
| Adaptive with `Lyricist`/`Composer` pinned | 4 | 2 |
| Optional columns moved to the tail | 4 | 4 |
| **Fixed spine, `Utaite` always** | **2** | **5** |

This is the answer to "intentional but also inconsistent": the first five columns never move, so a difference between two albums on a page reads as *this album has no arranger* rather than *this table is shaped differently*. Median album: 7 columns today → 5.

`group` is never a column. It carries two distinct meanings:

```
105x All editions   90x Disc 1   44x Disc 2   15x Regular CD
15x Disc1 (StarLight Side)   10x Disc 3 (Limited Edition A only)
3x Type A   3x Type B only   2x Toranoana Limited ver.   2x Animate
26 albums use it · 19 contiguous · 7 interleaved
```

- **Contiguous** (each value one unbroken run, 19 albums) → **section header rows** spanning the table. `世会色ユニバース` becomes `Disc 1` (17) / `Disc 2` (17) / `Disc 3 (Limited Edition A only)` (10) instead of repeating `Disc 1` down 17 rows.
- **Interleaved** (7 albums, e.g. `Irregular record`: `All editions` / `Type A` / `Type B`) → **row badges**. Sectioning shatters these into one-track sections.

`|groupstyle=section|badge|column` overrides the heuristic. `group` is not a column by default; `column` remains available as an escape hatch.

**Track numbers are opaque strings, not integers.** The DataTables gadget registers a `track-number-pre` sort that already handles suffixed values such as `12-a` and `1b`, so the module must never coerce to a number or regenerate the sequence. Sources:

- `t1*` / `track1*` dialects — the number *is* the index `N`.
- `{{Track}}` dialect — the positional `|1`, preserved verbatim.

Only 2 albums restart numbering per section; numbering is otherwise continuous and always taken from the source.

### 5.4 Mobile

Below the breakpoint the table becomes a list: number, title (+ info), utaite/group, then a collapsed credit line. Roles sharing a person merge — `lyricist == composer` renders `lyrics, music: ryo`, not ryo twice. This restores behaviour `Template:Album` has and `AlbumType2` lost, and is what keeps the line short enough to work at 380px.

### 5.5 Tabs

`Tracklist`, `Cover Art`, `Shops & Downloads`, `Streaming`, `YT Crossfade`, `NND Crossfade` — same set as today, via `Module:Tabber`, with `hideN` for absent content and a stable `id=` derived from the album title for deep-linking.

## 6. DataTables gating

DataTables initialises only when a table exceeds **15 rows**; otherwise a plain styled table is emitted with no JS. Expected effect: ~80 initialisations instead of 783; `Yuikonnu/Discography` drops from 23 instances to roughly 2.

The module emits `class="album-track-table"` always, and adds `dataTable` plus the `data-*` attributes only past the threshold. `datatables-helper.ts` needs no change — it selects on `.dataTable`. `Datatables.less` gains styling for the non-DataTables case so small tables do not look unstyled.

Threshold is a module constant, overridable per album with `|tablefilter=always|never`.

### 6.1 Sectioned albums conflict with DataTables

DataTables treats every `<tr>` in `<tbody>` as a data row, so injected section-header rows would be sorted and filtered as if they were tracks. The **RowGroup extension is not bundled** in this repo — `grep -rn "rowGroup\|RowGroup" src/gadgets/core/datatables/` returns nothing — so there is no native way to render group headers inside a managed table.

This is not hypothetical: `世会色ユニバース` is 44 rows (past the threshold) *and* sectioned into three discs.

Resolution: **a sectioned album renders one table per section**, each with its own heading, and DataTables is suppressed for that album. A disc is its own tracklist, so separate tables are the more faithful structure anyway.

### 6.2 Filtering must not be lost in the trade

Suppressing DataTables would otherwise sacrifice one UX aspect to buy another. Instead a sectioned album gets a lightweight filter bar above its section tables:

- **Group chips** — `All` · `Disc 1` · `Disc 2` · `Disc 3 (Limited Edition A only)` — show or hide whole section tables.
- **One text input** filtering titles and credits **across all section tables**, with an `n of N` count.

This is strictly better than what it replaces. DataTables' searchPanes could only facet within a single table and only while `group` was a column; the chip row filters the whole album, costs no library, and survives `group` no longer being a column. It is a small addition to the datatables gadget bundle, not a DataTables instance.

Non-sectioned albums keep the plain >15-row DataTables threshold.

## 7. Performance budget

Targets, verified with `action=parse&prop=limitreportdata` before and after:

| Metric | Now | Target |
|---|---|---|
| `MARiA/Discography` CPU | 8.095 s | < 2 s |
| `Yuikonnu/Discography` CPU | 2.090 s | < 1.5 s |
| Lua time, heaviest page | 1.144 s | < 4 s |
| Lua memory, heaviest page | 1.45 MB | < 15 MB |
| DataTables instances, Yuikonnu | 23 | ≤ 3 |

Lua memory is the metric to watch, since the module holds the whole album model; 154 tracks × 8 fields is the worst case and is small.

## 8. Testing

The repo already runs Jest (299 tests). Wiki-side logic is not covered by it, so:

1. **Lua unit tests** for ingest and analysis: dialect equivalence (the same album expressed in all three dialects must produce an identical model), gap handling, 154-track case, `N/A` stripping, typo mapping, group contiguity detection, credit merging.
2. **Render-parity harness** (repo-side, extends `dev-utils/wiki-audit/`): for all 166 AlbumType2 pages, fetch current rendered HTML, render the same wikitext against the sandbox module via `action=parse&text=`, and diff track counts, titles and credit strings. Any album whose track set changes is a regression. This is the gate for deployment.
3. **Visual checks** at 380 / 768 / 1024 / 1440 px on: a 1-track single, the median 7-track album, `世会色ユニバース` (44 tracks, 3 discs — exercises §6.1), `Irregular record` (interleaved tags), and `Yuikonnu/Discography` (33 albums on one page).
   Also confirm that no section-header row is ever emitted into a DataTables-managed `<tbody>`, and that `track-number-pre` sorting still orders suffixed numbers (`12-a`) correctly where DataTables is active.
4. **Parser cost measurement** on the pages in §7, single cached requests only — batch uncached parses of these pages returned HTTP 503 during research and must not be repeated.

## 9. Rollout

1. Build `Module:Album` and `Module:Album/testcases` in the module namespace. No template changes.
2. Run the render-parity harness against all 166 pages from the sandbox module. Fix until clean.
3. Edit `Template:Track` to emit records. Old cached pages still work via §4.3 transitional tolerance.
4. Point `Template:AlbumType2` at `{{#invoke:Album|main}}`.
5. Ship the CSS changes through the normal `build` + `sync` deploy.
6. Watch the maintenance categories from §4.4 and fix the long tail of typos.
7. Only once stable: redirect `Template:Album` and re-run parity against its 350 pages.

**Rollback** is reverting the template revision; the module can stay in place.

## 10. Open questions

- Should the 7 loose `{{Track}}` calls and ~16 non-mainspace usages be migrated, or left to render as raw records?
- The typo map in §4.4 is drawn from currently observed misspellings and will go stale. The maintenance category is the mechanism for catching new ones, but nobody is assigned to watch it.

### Resolved during review

- **Varying column counts** — resolved by the fixed spine in §5.3. Header shapes on `Yuikonnu/Discography` drop from 4 to 2, with 5 stable leading columns. Intentional *and* consistent, rather than a trade between them.
- **Lost filtering on sectioned albums** — resolved by the chip + text filter in §6.2, which filters across section tables rather than within one. No UX aspect is sacrificed to buy another.
- **`Template:Album` portable-infobox theming** — explicitly dropped, not deferred. It is not considered beneficial, so the eventual Album redirect adopts the new card wholesale with no portable-infobox compatibility work.
