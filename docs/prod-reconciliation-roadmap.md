# Prod-as-Source-of-Truth Reconciliation Roadmap

> **For agentic workers:** This is a **master roadmap**, not a task-by-task plan. Each phase below is an independent subsystem (one gadget section). When you start a phase, write a detailed per-phase plan with `superpowers:writing-plans`, execute it, then run the **Verification Harness** (below) before moving on. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the repository source (`src/`) reproduce the **live wiki (`https://utaite.wiki`)** exactly, treating prod as the single source of truth after the codebase was abandoned in 2025.

**Architecture:** For each gadget page on prod, either (a) confirm the repo already reproduces it, (b) back-port on-wiki edits into the TS/LESS source, or (c) import prod-only gadgets into the repo. The build (`vite`) + sync (`mwn`) pipeline stays as-is. Nothing is synced back to prod until a rebuilt `dist/` byte-matches prod for the files in scope.

**Tech Stack:** TypeScript → JS (Vite, ES2018), LESS → CSS, `mwn` bot sync, pnpm 11, Node 24.

---

## Global Constraints

- **Prod is authoritative.** When repo and prod differ, prod wins. Never run `pnpm run sync` for a file until its rebuilt output matches prod (verified by the harness). A premature sync **overwrites live edits** and is the primary risk of this project.
- **JS→TS conversion applies ONLY to code written on prod after the last sync (2025), which is unminified/readable.** Minified or vendor-bundled pages are **not** hand-converted — keep them as `.js`/vendor or regenerate from their npm dependency. See the **Vendor/minified** list.
- **Leave `twitter.js` alone** — it is vendored from Twitter's own embed documentation, not our source.
- Target **ES2018**; do not minify in the default `build` (only `rollup` minifies).
- Preserve each gadget's `ResourceLoader` flags **exactly as they appear in prod's `MediaWiki:Gadgets-definition`** (see inventory). The generated `gadgets-definition.wikitext` must byte-match prod.
- Node 20.19+/22.12+ (v24 recommended); pnpm 11 requires `allowBuilds` config (see Phase 0).
- Do not commit the gitignored snapshot dir `live-snapshot.local/` or `.env`.

---

## Ground-truth data (captured 2026-07-21)

Read-only snapshot of every managed page + full prod gadget inventory is saved under `live-snapshot.local/`:
- `_diff-report.json` — per-page SAME / CODE_DIFF / MISSING_ON_LIVE + orphan list
- `_code-inventory.json` — every `MediaWiki:Gadget-*.{js,css,json}` with byte size + line metrics + minified flag
- `_diffs/<page>.{repo,live}.txt` — banner-stripped repo-build vs live text for each divergent file

Regenerate any time with `live-snapshot.local/../` scripts (see Verification Harness).

### Vendor / minified pages — DO NOT hand-convert to TS/LESS
| Page | Size | Handling |
|---|---|---|
| `Gadget-twitter.js` | 126 KB | Leave as-is (vendor, per owner). |
| `Gadget-fontawesome.css` | 1.06 MB | Vendor Font Awesome; already `SAME` in repo (`fontawesome.less` wrapper). Keep. |
| `Gadget-Datatables.js` | 461 KB | Handsontable vendor bundle, runtime-loaded by `datatables-helper.js`. Regenerate via `rollup`/npm dep, not hand-edit. |
| `Gadget-Mobile-Datatables.js` | 271 KB | Same as above (mobile). |
| `Gadget-confetti.js` | 11 KB | Minified confetti lib. Vendor as `.js`. |

---

## Inventory by section (prod `Gadgets-definition`)

Legend: `SAME` = repo already reproduces prod · `DIFF` = back-port needed · `NEW` = prod-only, import · `VENDOR` = keep/regenerate, no TS.

### `core`
- CustomTabber, TextExtractsLoader, preloadtemplate, userlinks, forum, lightboxmodoki, ModalBuilder, QuickPurge, ShowbyGroup, AddCategory, hidesnonedit — **all SAME**
- **datatables** `[default|actions=view]` → `datatables-helper.js` **DIFF**, `mobile-datatables-helper.js` **DIFF**, `Datatables.css` **DIFF**; runtime bundles `Datatables.js`/`Mobile-Datatables.js` **VENDOR**
- **sandbox** → `portablesandbox.js`/`sandbox.js`/`sandbox.css` SAME; `sandbox.json` **NEW** (config file for existing gadget)

### `styling`  ← largest phase
- citizen `[skins=citizen|type=styles]`: `citizen-vars.css` **DIFF**, `citizen-templates.css` **DIFF**, `citizen-widgets.css` **DIFF**; other 8 citizen files SAME
- mainpage → `Mp.css` **DIFF**
- badge → `badge.css` **DIFF**
- usercard → `citizen-usergroup-icons.js` **DIFF**, `citizen-usergroup-icons.css` **NEW**
- actioncard, fontawesome(VENDOR/SAME), uptodatebox, systemmessage, protectionindicator, birthday, usersignaturestyle, documentation — **all SAME**
- **ProfileChips** `[default|hidden]` → `ProfileChips.js` + `.css` **NEW**
- **HideTags** `[default|hidden]` → `HideTags.js` **NEW**

### `blog`
- **userblog** `[default|hidden|dependencies=mediawiki.api|namespaces=0,2,3000,3001]` → `userblog.js` **DIFF**, `userblog.css` **DIFF**

### `contents`
- spoiler — SAME
- **SonglistCRUD** `[dependencies=mediawiki.api,mediawiki.util,mediawiki.user,jquery|default|hidden]` → `SonglistRenderer.js` + `SonglistCRUD.js` + `SonglistCRUD.css` **NEW**

### `utility`
- getuserprofile, docsbrowser, LinkSuggest, PWA — SAME
- **Countdown** `[default|hidden]` → `Countdown.js` + `.css` **NEW**

### `custom icon`  ← new section, not in repo folder layout
- **CustomIconGlobal** `[default|hidden|dependencies=mediawiki.api,mediawiki.util]` → `CustomIconGlobal.js` **NEW**
- **CustomIconManager** `[default|hidden|dependencies=mediawiki.api]` → `CustomIconManager.js` **NEW**

### `moderation-housekeeping`
- massrename, massdelete, massupload, masscategorization — code **SAME**; RL flags on prod are bare `[ResourceLoader]` (no `default`, no `hidden`). ⚠ The uncommitted `gadgets-definition.yaml` edit matches prod for these but **also flipped `ShowbyGroup` to `default:false/hidden:false`, which CONFLICTS with prod** (`ShowbyGroup` is still `default|hidden`). Reconcile the yaml to prod exactly.

### `community` / `external`
- discord, consolemessage, tabs — **all SAME** (verify-only)

### Unregistered `Gadget-*` pages (exist on prod, NOT in `Gadgets-definition`)
Loaded via `Common.js`/other gadgets, or stale. Need triage (keep+import / ignore / delete):
`blog-post-vote.js`, `create-blog-post.{js,css}`, `recent-blogs.css`, `blogs.css`, `discography-editor.{js,css}`, `mmv.{js,css}`, `findreplace.js`, `suggestions.js`, `nocontextmenu.js`, `poll-correction.js`, `mobile-mainpage.js`, `activityfeedmimic.css`/`ActivityFeedMimic.css`, `Pagestructure.css`, `layout.css`, `CustomSlider.{js,css}`, `citizen-extension-socialprofile*.{js,css}`, `citizen-layout.js`, `gadget-impl.js`.

---

## Phases

Order chosen for risk isolation: prep first, then verify-only sections (cheap wins), then back-ports (medium risk), then new imports (largest), then triage, then the authoritative first sync.

### Phase 0 — Foundations (do first)
- [ ] Fix pnpm 11 build gate: add `pnpm-workspace.yaml` with an `allowBuilds` map for `esbuild`, `core-js`, `unrs-resolver` so `pnpm run build`/`sync` stop erroring `ERR_PNPM_IGNORED_BUILDS`. (Interim: `node node_modules/vite/bin/vite.js build` already works.)
- [ ] Verify `.env` points at prod and bot creds are valid with a **read-only** `bot.getSiteInfo()` login test (no writes).
- [ ] Fix the `sync.ts` fire-and-forget bug (`syncWikiCode` is not awaited before `last-updated.txt` is written) so failed pages are not silently skipped — OR mandate `--update-all` for the reconciliation sync.
- [ ] Commit the Verification Harness scripts (below) under `dev-utils/audit/` so the diff is repeatable.
- **Acceptance:** `pnpm run build` succeeds; audit harness runs and reproduces the current 11 `DIFF` + prod-only inventory.

### Phase 1 — `community` + `external` + `moderation-housekeeping` (verify-only, cheap)
- [ ] Confirm all code files SAME via harness (no source changes expected).
- [ ] Correct `gadgets-definition.yaml` RL flags to match prod exactly (fix the `ShowbyGroup` conflict; keep mass* as bare `[ResourceLoader]`).
- **Acceptance:** harness shows SAME for every file in these sections **and** generated `gadgets-definition.wikitext` matches prod for their lines.

### Phase 2 — `blog` (back-port `userblog`)
- [ ] Back-port live `userblog.css` (+4 lines: blog-listing-header/avatar/loader, surface-bg tokens) into `src/gadgets/blog/userblog/userblog.less`.
- [ ] Convert live `userblog.js` (166→278 L: profile batch-fetch of revision timestamps + extracts, new header/avatar markup) into `src/.../userblog.ts` as typed TS.
- **Acceptance:** rebuild → harness shows `userblog.js` + `userblog.css` = SAME.

### Phase 3 — `core/datatables` (back-port + vendor wiring)
- [ ] Back-port `Datatables.css` (612→899 L: Codex design-tokens, progressive colours, corner-radius) into LESS.
- [ ] Convert `datatables-helper.js` (col-visibility dropdown panel + unique-id gen) and `mobile-datatables-helper.js` (`applySonglistMobileView`, songlist-desktop/mobile toggle) into TS.
- [ ] Confirm `Datatables.js`/`Mobile-Datatables.js` vendor bundles are produced by `rollup` (Handsontable dep) and match prod's runtime URL; do not hand-edit.
- **Acceptance:** harness SAME for the 3 source files; vendor bundles documented as regenerated, not diffed line-by-line.

### Phase 4 — `styling` (largest: back-ports + new imports)
- [ ] Back-port DIFFs: `citizen-vars.css` (oklch tokens), `citizen-templates.css` (`.no-external`), `citizen-widgets.css` (`.active-template`→`.status-templates`), `Mp.css` (mp-section scaffolding, news/blogs scroll), `badge.css` (moved rules → note the `UserTag.css` split), `citizen-usergroup-icons.js` (role-icon-list + tooltip rewrite) into their LESS/TS sources.
- [ ] Import NEW: `citizen-usergroup-icons.css` (usercard), `ProfileChips.{js→ts,css→less}`, `HideTags.js→ts` — new gadget folders + `gadgets-definition.yaml` entries with prod RL flags.
- **Acceptance:** harness SAME for all styling DIFFs; new gadgets build to pages that byte-match prod.

### Phase 5 — `contents/SonglistCRUD` (new, large)
- [ ] Create `src/gadgets/contents/SonglistCRUD/` with `SonglistRenderer.ts`, `SonglistCRUD.ts`, `SonglistCRUD.less` converted from prod; add definition entry with deps `mediawiki.api,mediawiki.util,mediawiki.user,jquery|default|hidden`.
- **Acceptance:** harness SAME for all three pages.

### Phase 6 — `utility/Countdown` + `custom icon` section (new)
- [ ] Import `Countdown.{js→ts,css→less}` under `utility`.
- [ ] Create a new **`custom icon`** section folder; import `CustomIconGlobal.ts`, `CustomIconManager.ts` with their deps; add the new section to `gadgets-definition.yaml`.
- **Acceptance:** harness SAME; generated definition includes the new section header identically to prod.

### Phase 7 — `core/sandbox.json`
- [ ] Add prod-only `sandbox.json` to the existing sandbox gadget (it is data/config, copy verbatim).
- **Acceptance:** page SAME.

### Phase 8 — Unregistered-page triage
- [ ] For each unregistered `Gadget-*` page (list above): determine loader (grep prod `MediaWiki:Common.js` + other gadgets for the page name), then classify keep-and-import / vendor / stale-ignore. Produce a decision table; import the "keep" ones into the appropriate section.
- **Acceptance:** every unregistered page has a recorded disposition.

### Phase 9 — (Optional, decision pending) Gadget description + section messages
- Not selected in current scope. If adopted later: extend the pipeline to sync `MediaWiki:Gadget-<name>` (descriptions, sourced from `gadgets-definition.yaml` `description:`) and `MediaWiki:Gadget-section-<x>` headers. Flagged here so it is not forgotten.

### Phase 10 — Authoritative first sync
- [ ] Full clean rebuild; run harness — expect **zero** `DIFF` for all in-scope pages.
- [ ] `pnpm run sync -- --update-all` against prod (publishes source→wiki). Only after the harness is green, because at this point source == prod, so the sync is a safe no-op that re-establishes the repo as the deploy origin going forward.
- [ ] Commit everything; tag the reconciliation.
- **Acceptance:** harness green; sync log shows no unexpected content changes.

---

## Verification Harness (the definition of "done" for every phase)

The audit script already exists (`live-snapshot.local/../live-diff.mjs`; promote to `dev-utils/audit/live-diff.mjs`). Per phase:

- [ ] `node node_modules/vite/bin/vite.js build` (or `pnpm run build` after Phase 0)
- [ ] `node dev-utils/audit/live-diff.mjs`
- [ ] Confirm every file in the phase's section reports **SAME** (banner-stripped). Any `CODE_DIFF` means the back-port/import is not yet faithful.
- [ ] Spot-load the gadget on prod in a browser to confirm runtime behavior matches.

**Conversion recipe (unminified prod JS → TS):** paste the readable prod JS as the module body, add types (`types-mediawiki` globals: `mw`, `$`), replace `var`→`const/let` only where semantically safe, keep behavior identical. Verify by build+harness = SAME (banner-stripped ignores the auto-banner and formatting differences the Vite output re-imposes; if formatting alone causes a diff, prefer matching prod's structure so the harness stays green).

---

## Self-review notes
- Every prod-registered gadget in the inventory maps to a phase (core→P1/P3/P7, styling→P4, blog→P2, contents→P5, utility+custom icon→P6, community/external/mod-housekeeping→P1).
- Vendor pages are explicitly carved out of TS conversion per the owner's constraint.
- The `ShowbyGroup` yaml conflict and the `sync.ts` await bug are captured as concrete tasks, not left implicit.
- Unregistered pages get a dedicated triage phase rather than being silently dropped or blindly imported.
