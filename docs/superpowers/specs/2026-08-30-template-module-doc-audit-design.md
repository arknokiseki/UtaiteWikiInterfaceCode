# Template & Lua Module Documentation Audit — Design

**Date:** 2026-08-30
**Status:** Approved for planning
**Wiki:** https://utaite.wiki (`/w/api.php`)

## Goal

Build a re-runnable, read-only pipeline that mirrors every Template and Module
page from the live wiki into the repository, analyses documentation coverage and
real usage, and renders one insight report.

The report is the deliverable. Writing the missing documentation is explicitly a
**follow-up** project, driven by the priority ranking this report produces.

## Why now

The repository stores **zero** templates and modules — only two Lua files under
`docs/superpowers/deploy/2026-08-19-uptodate-editor/lua/`. Consistent with
`docs/prod-reconciliation-roadmap.md`, the live wiki is the single source of
truth, and nothing in git may be trusted as current. Every number below was
measured against live on 2026-08-30 and is regenerated on each run.

## Non-goals

- **Writing documentation.** Deferred to a follow-up project.
- **Gadgets, scripts and styles.** Out of scope as code. They are read only as
  *evidence of template usage*, and `Template:X/styles.css` pages are never
  documented — but an owning template's doc must mention its stylesheet, so the
  analysis records the link.
- **Writing to the wiki.** Nothing in this pipeline edits, creates or deletes a
  page. See "Read-only by construction".
- **`Template:Utaite Spotlight/*natsuki`** — excluded by owner instruction.

## Ground truth (measured 2026-08-30)

Total pages in ns 10 + 828: **1,369** (1,264 content, 105 redirects), **2.41 MiB**.

| | real roots | with `/doc` | missing | covered |
|---|---|---|---|---|
| Template (ns 10) | 483 | 377 | **106** | 78% |
| Module (ns 828) | 83 | 38 | **45** | 46% |

Backlog for the follow-up writing project: **151 pages**.

Of 449 real `/doc` pages (excluding those that are themselves redirects): 37
stubs (<200 B), 120 thin (200–600 B), 157 adequate, 135 rich (>2 KB). Content
models present: wikitext, Scribunto, sanitized-css, json, text.

Doc-size tiers are a weak signal on their own and are not the priority ranking;
see "Documentation quality scoring".

Documentation is delivered by `{{Documentation}}` → `{{#invoke:documentation|main}}`
(`Module:Documentation`, 43 KB). Supporting furniture already exists:
`Template:Documentation/Header`, `/preload`, `/preload-module-doc`,
`/preload-sandbox`, `{{High Risk}}`, `{{T|…}}`. TemplateData 0.2.0,
TemplateStyles + Extender, TemplateSandbox and Translate are installed.

`Template:Uptodate/doc` is the house-style exemplar.

## Architecture

Three stages, one direction, each writing a file the next reads. Re-fetching is
rare and network-bound; re-analysing and re-rendering are instant and offline.

```
dev-utils/wiki-audit/
  fetch.ts        live wiki            ->  wiki/ + wiki/_manifest.json + wiki/_redirects.tsv
  analyze.ts      wiki/ + live-snapshot.local/  ->  wiki-audit.json
  report.ts       wiki-audit.json      ->  report HTML (published as an Artifact)
  lib/titles.ts   title <-> filesystem path encoding
  lib/api.ts      read-only mwn wrapper

wiki/
  templates/**    .wikitext | .css | .json
  modules/**      .lua | .wikitext | .css | .json
  _manifest.json
  _redirects.tsv
```

`package.json` gains `wiki:fetch`, `wiki:analyze`, `wiki:report`, and
`wiki:audit` to chain all three. Node 24 executes `.ts` directly, exactly as
`dev-sync/sync.ts` does; no build step is introduced.

## Stage 1 — fetch

**Enumeration.** `list=allpages` over ns 10 and 828, run twice per namespace with
`apfilterredir=redirects|nonredirects` so redirect status is known from
enumeration rather than inferred.

**Content.** Batched `prop=revisions|info|categories` with
`rvprop=content|ids|timestamp|sha1` and `rvslots=main`, 50 titles per request —
roughly 30 requests for the whole wiki.

**Layout.** Docs are stored adjacent to their subject, not in a parallel tree.
Subpages become real directories, keeping a template's family together:

```
wiki/templates/Uptodate.wikitext
wiki/templates/Uptodate/doc.wikitext
wiki/templates/Uptodate/sync.wikitext
```

File extension follows content model: `wikitext`→`.wikitext`,
`Scribunto`→`.lua`, `sanitized-css`→`.css`, `json`→`.json`, `text`→`.txt`.

**Read-only by construction.** `lib/api.ts` exports a query function and nothing
else; no `mwn` write method is imported anywhere in `dev-utils/wiki-audit/`. The
roadmap names a premature sync as this project's primary risk, so the audit
tooling is made structurally incapable of writing rather than merely careful.
Credentials come from `.env` via the existing pattern, used only to obtain
`apihighlimits`.

### Path encoding (`lib/titles.ts`)

Real hazards measured on this wiki, not hypothetical ones:

- **6 titles contain Windows-illegal characters** — `Template:*`, `Template:?`,
  `Template:Wp:ja`, `Template:Wp:ja/doc`, `Template:Wp:zh`, and the excluded
  `Template:Utaite Spotlight/*natsuki`. Percent-encode `< > : " | ? *` and `%`
  itself: `Template:?` → `templates/%3F.wikitext`.
- **1 title has a trailing dot** — `Template:Forumheader/News, Important Topics, etc.`
  Trailing dots and spaces are percent-encoded.
- **Case-insensitive collisions.** NTFS cannot hold `Template:Yt` and
  `Template:YT` as separate files. Colliding groups get deterministic `~2`/`~3`
  suffixes recorded in the manifest. Nearly all such groups are redirect→target
  pairs; the sole genuine content fork found is `Template:LL` (305 B) vs
  `Template:Ll` (458 B).
- **DOS reserved names** (`CON`, `PRN`, `COM1`…) — none present today; encoded
  defensively.

Encoding is reversible via `_manifest.json`, which is the authoritative
path↔title map. **Fetch aborts loudly** if two titles ever resolve to one path;
silently losing a page is not an acceptable failure mode.

### Redirects — derived, never hand-maintained

Redirects are queryable, so no hand-written list is kept; one typed today is
stale the moment an editor creates a redirect. Each fetch derives them into:

1. `_manifest.json` — `redirect: true` + `redirectTarget` per entry (machine source).
2. `wiki/_redirects.tsv` — sorted `from` TAB `to`, one per line. Plain text, but
   tab-separated so it is both readable and parseable, and it diffs cleanly in
   git: a new redirect appears as a one-line change on the next fetch.
3. A section of the report.

Redirect pages are still mirrored (20–40 bytes each) to keep the mirror
faithful, but are excluded from every coverage denominator.

### Provenance capture

Transwiki import preserves original revision history with **interwiki-prefixed
usernames**, which makes origin near-authoritative rather than heuristic:

```
Module:Documentation  2022-05-24  wikia>Awesome Aasi   "Created page with return require('Dev:Documentation')"
Module:Yesno          2013-02-28  mw>ATDT              "Ported [[Template:Yesno]] to Lua"
Module:Hatnote        2019-07-03  wikia>FANDOM         "1 revision: Starter Wiki Refresh"
Module:ACandy         2025-04-28  mh>PetraMagna        "Import module ... github.com/AmeroHan/ACandy"
Template:Album        2009-12-13  wikia:utaite>Default
Module:Utaite         2024-09-02  Ark                  (no prefix — native)
```

**Purpose.** Provenance is not collected to label origin for its own sake. It
**splits the writing backlog**, which is the single highest-leverage output of
this audit. Measured on the 45 undocumented module roots:

| | count | consequence |
|---|---|---|
| native (no prefix) | 19 | must be written from scratch; only this wiki can |
| imported (`mw>`, `wikia>`, `mh>`, `wp>`, `meta>`) | 26 | upstream documentation already exists — import or link it |

58% of the module backlog therefore needs sourcing rather than authoring.
`Module:Yesno`, `TableTools`, `Namespace detect`, `Category handler` and
`Lua banner` are well-documented upstream libraries; `Module:Utaite`,
`UtaiteUnit` and `SonglistFromJson` are bespoke. Treating those two groups
identically would waste the majority of the effort.

**Method — one source, not two.** The **first revision** of each page
(`rvdir=newer&rvlimit=1`, capturing user, comment and timestamp) is sufficient
and authoritative. `Special:Import` log events are deliberately *not* used: they
are strictly redundant (transwiki import preserves the original history, so the
first revision already carries the prefix), and strictly narrower (they miss
every page imported outside a logged `Special:Import`). The only thing the log
adds is when a page landed on this wiki, which nothing in this audit needs.

**Cost.** Measured at 568 ms/page, so ~5.4 minutes for 566 roots. A
`list=allrevisions&arvdir=newer` sweep was evaluated and **rejected**: it walks
the namespace's entire revision history from 2013 forward, and in testing spent
122 requests to resolve only 32 pages. Results are cached in the manifest keyed
by revid and are not re-fetched while a page's latest revid is unchanged.

**Limit to record honestly.** The `wikia>` prefix identifies Fandom but not
*which* Fandom wiki, so upstream docs for those cannot be located
automatically; `mw>`, `wp>` and `meta>` resolve directly to mediawiki.org,
Wikipedia and Meta. Copy-paste imports that left no interwiki prefix are
undetectable by this method and will read as native.

The confirmed lineage of the documentation system is **Fandom** — Dev-wiki
`Dev:*` modules, reportedly by way of the Genshin Impact wiki — *not* Wikipedia
or mediawiki.org. Content-based markers (`Global Lua Modules`, `Dev:`,
`mediawiki.org`, `Uses TNT`, LDoc `@require` headers) are retained only as weak
corroboration; they are sparse and noisy here (of 41 template pages mentioning
"Wikipedia", most are interwiki *link* templates such as `Template:Wp:ja`, not
imports).

## Stage 2 — analyze

Input: the `wiki/` mirror plus the existing `live-snapshot.local/` gadget
snapshot. Output: `wiki-audit.json`. No network access.

### Usage graph

Nodes are the 566 real (non-redirect) roots. Four edge sources:

1. **Transclusion, any namespace** — `prop=transcludedin`, capped at 500 and
   bucketed as `500+`. Only the low end needs resolution.
2. **`require()` / `mw.loadData()`** — regex over mirrored `.lua`. Without this,
   library modules such as `Yesno` and `TableTools` read as dead.
3. **String references in gadget JS/CSS** — grep `live-snapshot.local/` and
   `MediaWiki:` pages for `Template:X` / `Module:X`, catching gadget-driven
   templates such as `{{Uptodate}}` written by UptodateEditor.
4. **Wanted templates** — referenced but nonexistent; the inverse signal.

**Usage resolves through redirects.** A use of `{{YT}}` counts as a use of
`Template:Yt`. Omitting this would make targets look under-used and redirects
look orphaned — the failure mode that would make the whole report untrustworthy.

### Orphan classification (tiered, not binary)

- **UNUSED** — no edges of any kind. Deletion candidate.
- **DOC-ONLY** — referenced only from `/doc`, `/sandbox` or `/Draft` pages.
- **INTERNAL** — used only by other templates/modules, never mainspace. Alive
  but invisible; **not** a deletion candidate.
- **USED** — real mainspace or gadget usage.

Anything whose invocation may be dynamic (name built by concatenation in Lua or
JS) is flagged `needs-manual-review` instead of dead. The report ranks
*candidates* with supporting evidence; it never asserts a page is safe to
delete, because static analysis cannot establish that on a wiki.

### Documentation quality scoring

Per real root: has a doc; doc size tier; carries `<templatedata>`; uses
`{{Documentation/Header}}`; and — a required check — **mentions its
`/styles.css` when one exists**.

The primary priority signal is **undocumented parameters**: extract the true
parameter set by regexing `{{{name|` out of template source, then diff against
what the doc prose and TemplateData actually describe. A 2 KB doc missing six
parameters ranks worse than a 400 B doc covering all three — a better measure of
need than byte length.

### Documentation plumbing

Detected and grouped by problem type:

- `/doc` pages that are **themselves redirects** (12 remaining after the
  2026-08-30 cleanup, down from 22) — subdivided into circular targets, docs
  pointing at a template rather than a doc, docs living in userspace, and
  un-cleaned renames.
- `/doc` pages **attached to redirect pages** (11 remaining, from 20).
- `/doc` pages whose **subject page does not exist** (4 at last measurement).
- **Deliberate doc-sharing**, where one template intentionally reuses another's
  doc. Legitimate; recorded, not flagged as a fault.
- Double redirects, redirect chains and loops, redirects to missing pages.

## Stage 3 — report

One self-contained HTML page, published as an Artifact so it yields a private
link shareable with other wiki editors. Six sections, actionable material first,
inventory material last.

1. **At a glance** — four numbers only: template coverage, module coverage,
   deletion candidates, snapshot timestamp. Not a KPI wall.
2. **Coverage** — documented / thin / missing, split Template vs Module.
3. **Priority queue** — the core deliverable, **split by provenance into
   "write" and "source"**. Undocumented pages are ranked by *usage × doc-gap*
   so high-transclusion, zero-doc pages surface first, then divided into the
   native pages someone must author and the imported ones whose upstream docs
   need importing or linking (19 vs 26 for modules). The two halves are
   different kinds of work and are not interleaved.
4. **Deletion candidates** — tiered, each row carrying an evidence column and a
   `needs-manual-review` flag where applicable.
5. **Doc plumbing** — the findings above, grouped by problem type, with the
   redirect inventory linking out to `_redirects.tsv` rather than dumping 105 rows.
6. **Provenance summary** — a compact breakdown by source wiki, plus the pages
   whose origin could not be determined. Deliberately small: provenance does its
   real work as a column and a split inside section 3, not as an inventory of
   its own. Its one standalone job here is showing how much of the backlog is
   sourcing rather than authoring.

### Visual direction

**Colour encodes difference or it is not used.** Within any single figure, one
hue plus a gradient is almost always sufficient — magnitude is a ramp, not a
palette. A second hue appears only where it marks a genuinely different *kind*
of thing (Template vs Module, broken vs merely missing), never to enumerate
categories that differ only by label.

Across the report that yields: a neutral canvas; one sequential ramp carrying
magnitude (coverage, usage); and a small reserved semantic set — a red that
means *broken*, never a red that means *the fourth category*. Theme-tokened for
light and dark. Density over decoration: tables that scan rather than cards that
sprawl. The `artifact-design` skill is loaded before the page is written.

## Verification

- `wiki/` file count equals manifest entry count equals live page count.
- Every manifest path round-trips back to its exact title.
- Re-running fetch with no wiki changes produces a zero-line git diff.
- Byte size of each mirrored file matches the API-reported `length`.
- Spot-check: `Module:Yesno` classifies as USED (via `require`, not
  transclusion); `Template:Uptodate` classifies as USED via gadget string
  reference. Both are the cases naive analysis gets wrong.
- Coverage totals reproduce the ground-truth table above when run against an
  unchanged wiki.

## Risks

- **Accidental write to prod.** Mitigated structurally (no write method
  imported), not procedurally.
- **Stale snapshot.** Live pages change during a project; the 2026-08-30
  deletions already shifted these numbers mid-design. All figures are
  snapshot-stamped and regenerated per run.
- **Over-confident deletion advice.** Mitigated by tiering, evidence columns and
  `needs-manual-review`; the report recommends review, never deletion.
- **Search-API throttling.** Avoided by doing analysis offline against the
  mirror rather than via `insource:` queries.

## Follow-up (not this project)

Writing the 151 missing docs, prioritised by this report's queue, in the
`Template:Uptodate/doc` house style, with TemplateData blocks and `/styles.css`
cross-references.
