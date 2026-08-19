# UptodateEditor — design spec

**Date:** 2026-08-19
**Status:** approved (design), pending implementation plan
**Scope:** gadget only. The on-wiki module/template patches in §8 are a documented
prerequisite for the `force-uptodate` feature; they are **not** applied by this
subproject and are **not** synced to prod by it.

---

## 1. Problem

`{{Uptodate}}` marks a utaite's song list as current. Its freshness tier is computed
purely from elapsed months, so every list drifts to "Outdated" whether or not that is
true. For inactive, graduated, or deceased singers the list is *complete and will
never change* — flagging it outdated is simply wrong, and there is currently no way
to say so.

Editors also update the template by hand-editing wikitext on a `/Songs` subpage,
which is easy to get wrong given the accumulated legacy parameter shapes (§4).

This subproject adds a button on the rendered freshness box that opens a modal to
edit the `{{Uptodate}}` parameters safely, including a `force-uptodate` flag, and
which detects singer inactivity from the infobox to suggest that flag.

---

## 2. Ground truth on prod (captured 2026-08-19)

The on-wiki docs are stale — `Template:Uptodate/doc` (rev 2658, 2025-04-16) still
documents `type` and `time` positional parameters that the current implementation
ignores entirely. **Do not trust the docs; the chain below is authoritative.**

### 2.1 The template chain

```
{{Uptodate}}  (rev 282525)
  -> {{Freshness|{{{1|}}}|base={{{bordercolor|{{{base|}}}}}}|discography=...|needrom=...
                |nocat=...|customlatesteditor=...|lastedittext-nolink=...}}
  -> {{Freshness}} (rev 282521) = <templatestyles src="Template:Freshness/styles.css" />
                                  {{#invoke:Freshness|render}}
  -> Module:Freshness (rev 282524)        — mw glue, marshals frame args
  -> Module:Freshness/core (rev 282527)   — pure logic, no mw dependency
```

Separately, articles use `{{Uptodate/sync}}` → `{{#invoke:Uptodate|getUptodateFromSubpage}}`
(**`Module:Uptodate`**, rev 17234 — *not* `Module:Freshness.fromSubpage`), which reads
the `/Songs` subpage, re-serializes the call, and `frame:preprocess`es it.

### 2.2 Parameter reality

| Layer | Parameters actually read |
|---|---|
| `Module:Freshness/core.decide` | `date`, `base`, `force` (bool), `reason`, `discography`, `nocat`, `needrom` |
| `Module:Freshness.render` | maps `force-outdated=yes` **or** `status=outdated` → `force`; also reads `reason` |
| `Template:Uptodate` | forwards **only** `1`, `bordercolor`/`base`, `discography`, `needrom`, `nocat`, `customlatesteditor`, `lastedittext-nolink` |

**Two consequences that shape this design:**

1. **`force-outdated`, `status`, and `reason` are already dead through `{{Uptodate}}`.**
   `Module:Freshness` supports them; `Template:Uptodate` does not pass them through.
   The pass-through gap exists on prod today, independent of this project.
2. **There is no "pin fresh" path at any layer.** `core.decide` derives `tier` from
   elapsed months (`< 6` fresh, `< 18` aging, `>= 18` outdated), and `forced` can only
   push *toward* `outdated`. `force-uptodate` therefore **cannot** be implemented
   gadget-side and requires the §8 patches.

### 2.3 Freshness thresholds and rendered markup

```
core.FRESH_MAX = 6    core.AGING_MAX = 18    core.FADE_MAX = 30 (months)
tier: fresh | aging | outdated        category: up-to-date | outdated
```

Rendered DOM (from `core.render`), which the button hooks into:

```
.freshness-box
  .freshness-head   > .freshness-ic, .freshness-label, .freshness-ago
  .freshness-body   > .freshness-line
                    > .freshness-meter > .freshness-fill
                    > .freshness-cta
                    > .freshness-meta
```

---

## 3. Where the wikitext lives

`{{Uptodate}}` renders in two places but the editable source is in one:

| Page | Contains | Edit target |
|---|---|---|
| `<Name>/Songs` | `{{Uptodate\|<date>\|...}}` | itself |
| `<Name>` (article) | `{{Uptodate/sync}}` | `<Name>/Songs` |
| `<Name>` (article, rare) | direct `{{Uptodate\|...}}` | itself |

Survey of ns-0 transclusions: **751 total — 88 `/Songs` pages with a direct call**,
657 articles (which register as transclusions because `/sync` preprocesses the call),
6 other.

The infobox `status` parameter always lives on the **root article**, so when the
gadget runs on `/Songs` it must fetch the root page as well.

---

## 4. Live parameter shapes

Surveyed across the `/Songs` pages carrying a direct call. Ordered by frequency:

```
{{Uptodate|<date>}}                                              38
{{Uptodate|<date>|nocat=}}                                        8
{{Uptodate|<date>|||<pos3>|nocat=}}                               7
{{Uptodate|<date>|||<pos3>|bordercolor=|nocat=}}                  5
{{Uptodate|<date>|bordercolor=|utdcolor=}}                        4
... ~18 further long-tail combinations
```

Legacy cruft present on live pages:

- **empty `pos2` / `pos3`** — the dead `type` / `time` parameters from the stale doc.
- **`utdcolor=`** — consumed by the old `{{Outdated}}` box; ignored by Freshness since
  the module rewrite.

Both must survive an edit untouched (§5.2).

---

## 5. Architecture

New gadget at `src/gadgets/contents/UptodateEditor/`, alongside `SonglistCRUD` (the
other song-list tool).

### 5.1 Module boundaries

The hard logic is kept `mw`-free so it is unit-testable without a wiki.

| File | Responsibility | Dependencies |
|---|---|---|
| `uptodate-params.ts` | Brace-aware locate / parse / **surgical** re-serialize of `{{Uptodate\|...}}` | none (pure) |
| `status-detect.ts` | Free-text `status` → `{ activity, confidence, evidence, raw }` | none (pure) |
| `page-target.ts` | Resolve which page holds the wikitext; fetch & save via `mw.Api` | mw |
| `uptodate-modal.ts` | Standalone modal DOM + form state | DOM only |
| `UptodateEditor.ts` | Entry point: permission gate, button injection, wiring | mw |
| `UptodateEditor.less` | Button + modal styling | — |

**Why a standalone modal rather than `ModalBuilder`:** `ModalBuilder.ts:66` hard-gates
on `['bureaucrat','content-moderator','sysop','interface-admin']` and returns early for
everyone else. Updating a song-list date is routine editor work, so reusing it would
lock out the intended audience. The modal reuses `ModalBuilder.less` *visual tokens* so
it looks native, but not its code path. The shared gadget is not modified.

### 5.2 `uptodate-params.ts` — surgical parsing

`Module:Uptodate` and `core.from_subpage_params` both match with
`{{%s*[Uu]ptodate%s*|([^}]*)}}`, which breaks on any nested `{{...}}`. The TS parser
scans with a brace/bracket depth counter instead, so nested templates, `[[links]]`, and
`<ref>` inside parameter values survive.

**Name matching** follows MediaWiki title normalization: first character
case-insensitive, remaining characters exact, `_` ↔ space equivalent. So `uptodate` and
`Uptodate` both match; `UpToDate` does not. The parser must **not** match
`{{Uptodate/sync}}` or the separate legacy `{{Outdated}}` template.

**Surgical serialization.** Parsing yields an ordered list of raw parameter slices
retaining original spacing. Serialization replaces only the parameters the modal
actually touched and re-emits every other slice byte-identical, preserving order. Empty
positionals and `utdcolor=` therefore survive untouched.

**Round-trip invariant** (the primary test): *parse → serialize with zero edits must
return the input byte-for-byte*, verified against every real shape from §4.

### 5.3 `page-target.ts` — resolution and saving

Resolution follows the §3 table. Saves use
`api.postWithToken('csrf', { action: 'edit', ... })` with `basetimestamp` and
`starttimestamp` for edit-conflict safety, matching the existing pattern at
`src/gadgets/core/AddCategory/add-category.ts:651`.

### 5.4 `status-detect.ts` — inactivity detection

Detection reads the `status` parameter out of a `{{Utaite}}`, `{{Youtaite}}`, or
`{{Singer}}` transclusion using the same brace-aware extractor. (`{{Singer}}` is a
redirect to `{{Youtaite}}`; all three are aliases to look for.) Then, in order:

1. Strip `<ref>...</ref>`, HTML comments, and `{{cite}}` noise.
2. Find transclusions of the four `Category:Status Templates` members — `Active`,
   `Inactive`, `Hiatus`, `Graduated` — first-character case-insensitive.
3. **Exactly one** → confident.
4. **Multiple** → confident only if *all* resolve inactive-ish. Mixed values such as
   `{{Graduated}} as Utaite<br/>{{Active}} as professional singer` → **ambiguous**.
5. **No templates** → match bare text against a small lexicon: `active`, `inactive`,
   `hiatus`, `graduated`, `deceased`, `retired`.
6. **Anything else** → **unknown**.

**`Hiatus` does not count as inactive.** A hiatus is temporary, so the list may still
need future updates. It resolves to its own tier and never pre-ticks the checkbox.

The checkbox is pre-ticked only when detection is **confident** *and* activity is one of
`inactive`, `graduated`, `deceased`, `retired`. The editor can always untick it.
Ambiguous or unknown results leave it unticked and display the **raw status value
verbatim** with a neutral "couldn't determine" note, so the editor judges rather than
trusting a guess.

Distribution across 836 `{{Utaite}}`/`{{Youtaite}}` articles, which sets the test corpus:

| Shape | Count |
|---|---|
| Single `{{Active}}` / `{{Inactive}}` template | 686 |
| Bare text `Active` / `Inactive` | 103 |
| Multi-template (mixed and non-mixed) | 28 |
| Oddballs: `Deceased`, `Retired`, `Revived`, `Semi-active`, `Active (on hiatus)`, `Inctive` (typo), `active occasionally` | ~11 |
| No `status` parameter | 6 |

~94% is machine-readable; the tail is genuinely free text and is handled by the
"couldn't determine" path rather than by heuristics.

### 5.5 UI

A button injected into the rendered `.freshness-box` on both the article and the
`/Songs` subpage — where the outdated warning already is, which is where an editor
notices the problem.

Gate: logged-in **autoconfirmed** users (`mw.config.get('wgUserGroups')`).

Modal fields:

- **Date** (required). Defaults to today in **JST** — the wiki's templates use
  `CURRENTJST*` magic words throughout. Formatted to match the page's existing date
  style, falling back to `Month D, YYYY`.
- **force-uptodate** checkbox, with its detection evidence line beneath it.
- `reason`, `discography`, `needrom`, `nocat`, `bordercolor`.
- A live wikitext diff preview before saving.

The legacy `{{Outdated}}` box (`.uptodate-container`) is **out of scope** — it is a
different template with a different DOM.

---

## 6. Registration

Added to `src/gadgets/gadgets-definition.yaml` under `contents`:

```yaml
UptodateEditor:
  description: "Button + modal to update {{Uptodate}} parameters on song lists."
  code:
    - UptodateEditor.ts
    - UptodateEditor.less
  resourceLoader:
    default: true
    hidden: true
    actions: [view]
    namespaces: [0]
    dependencies: [mediawiki.api, mediawiki.util, mediawiki.user]
```

Note this changes the generated `dist/gadgets/gadgets-definition.wikitext`. Per the
reconciliation roadmap that file must otherwise byte-match prod, so the new line is the
**only** permitted delta and must be reviewed as such before deployment.

---

## 7. Testing

`jest` + `ts-jest` + `jsdom` is already configured but the repo currently has **no test
files**; these are the first.

- **`uptodate-params.test.ts`** — round-trip byte-identity across every §4 shape;
  targeted edits preserving untouched parameters; nested-brace values; correct
  non-matching of `{{Uptodate/sync}}` and `{{Outdated}}`; first-char case-insensitive
  name matching.
- **`status-detect.test.ts`** — the full §5.4 corpus, explicitly including the 28
  multi-template cases, the mixed-status example, every oddball, and the missing case.
- **`page-target.test.ts`** — thin, with a stubbed `mw.Api`, covering the three
  resolution branches.

DOM injection is not unit-tested; it is verified manually against a live page.

---

## 8. Prerequisite on-wiki patches (NOT applied by this subproject)

`force-uptodate` is inert until these land. Everything else in the gadget works without
them. Exact wikitext is produced during implementation for manual review and application.

1. **`Module:Freshness/core.decide`** — add a `pin` path. When pinned and dated:
   `tier = 'fresh'`, full meter, `category = 'up-to-date'`, unfaded base colour.
   `force-outdated` / `reason` take precedence over `pin` (an explicit outdated flag
   must always win).
2. **`Module:Freshness.render`** — map `a['force-uptodate']` → `pin`.
3. **`Template:Uptodate`** — widen the pass-through, which currently drops
   `force-outdated`, `status`, and `reason`. Following the wiki's fallback convention,
   the date becomes `{{{updated-at|{{{1|}}}}}}` so existing positional usage on live
   pages does not degrade. `force-uptodate` is new, so it is **named-only** — it gets no
   positional slot, avoiding any collision with the legacy `pos2`/`pos3`/`pos4` values
   still present in live wikitext.

**Verification gotcha.** `{{Uptodate/sync}}` runs through `Module:Uptodate`, not
`Module:Freshness.fromSubpage`. Its rebuild loop forwards all named parameters except
`nocat`, so `force-uptodate` should propagate to articles — but that is incidental rather
than designed, and must be confirmed on a test page after patching.

---

## 9. Build & deployment handoff

Final step of implementation: produce deployable artifacts. Nothing is pushed to prod by
this subproject — `pnpm run sync` is **not** run, per the roadmap's rule that a premature
sync overwrites live edits.

**Build command.** `pnpm run build` currently **fails**: `pnpm-workspace.yaml` still
contains the literal placeholder values `set this to true or false` for the `allowBuilds`
map (the unfinished Phase 0 roadmap item), so pnpm aborts during its dependency check.
Use the direct invocation, which is verified working:

```bash
node node_modules/vite/bin/vite.js build
```

Fixing `pnpm-workspace.yaml` is a separate roadmap item and out of scope here.

**Artifacts produced**, collected into a single deploy folder for convenience:

| Built file | Wiki destination |
|---|---|
| `dist/gadgets/contents/UptodateEditor/UptodateEditor.js` | `MediaWiki:Gadget-UptodateEditor.js` |
| `dist/gadgets/contents/UptodateEditor/UptodateEditor.css` | `MediaWiki:Gadget-UptodateEditor.css` |
| new line in `dist/gadgets/gadgets-definition.wikitext` | `MediaWiki:Gadgets-definition` |
| §8 patches | `Module:Freshness/core`, `Module:Freshness`, `Template:Uptodate` |

Output targets ES2018 and is **unminified** in the default build (only the `rollup`
command minifies), with the standard source banner applied — consistent with every other
gadget already on prod.

**Deployment order matters.** Ship the gadget first; it degrades gracefully because
`force-uptodate` simply has no effect until the module patches land. Applying the §8
patches before the gadget exists is also safe. Applying neither leaves prod unchanged.

---

## 10. Out of scope

- Applying anything to the live wiki (the user deploys).
- The legacy `{{Outdated}}` template and its `.uptodate-container` box.
- Fixing `pnpm-workspace.yaml` (roadmap Phase 0).
- Bulk/mass updating of many pages — this is a single-page tool.
- Documenting the Freshness chain — **deferred to §11**, to be done after this
  subproject ships.

---

## 11. Follow-up: document the Freshness chain (AFTER this subproject)

Agreed as a sequenced follow-up, not part of this subproject. The Freshness chain is
almost entirely undocumented, which is the root cause of the parameter confusion this
gadget works around. Doc state as verified 2026-08-19:

| Page | State |
|---|---|
| `Template:Freshness/doc` | **missing** — `{{Freshness}}` calls `{{documentation}}`, so it renders a "create this doc" stub on-wiki today |
| `Module:Freshness/doc` | **missing** |
| `Module:Freshness/core/doc` | **missing** |
| `Template:Uptodate/sync/doc` | **missing** (usage notes live inline in `<noinclude>` instead) |
| `Template:Uptodate/doc` | exists but **stale** — rev 2658 (2025-04-16), documents `type` / `time` positionals that the Freshness rewrite made inert |
| `Template:Outdated/doc` | exists, current, but describes the superseded box |
| `Module:Uptodate/doc` | exists, current |
| `Template:{Active,Inactive,Hiatus,Graduated}/doc` | exist, current (July 2026) |

**Why it must come after, not before.** The §8 patches change the parameter surface —
they add `force-uptodate` and open the `force-outdated` / `status` / `reason`
pass-through. Writing docs first would document a surface about to change and
guarantee a second stale generation.

Scope when picked up: write the four missing docs, rewrite the stale
`Template:Uptodate/doc` against the *patched* behaviour, and cross-link the chain so
`{{Uptodate}}` → `{{Freshness}}` → `Module:Freshness` → `Module:Freshness/core` is
navigable. Document the real thresholds (`FRESH_MAX 6`, `AGING_MAX 18`,
`FADE_MAX 30`), the tier/category mapping, and the `{{Uptodate/sync}}` →
`Module:Uptodate` path including the "forwards all named params except `nocat`"
behaviour noted in §8.
