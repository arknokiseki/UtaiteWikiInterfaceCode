# UptodateEditor — deploy bundle (2026-08-19)

Built from `feat/uptodate-editor` with:

```
node node_modules/vite/bin/vite.js build
```

ES2018, unminified, standard source banner — consistent with every gadget
already on prod. `pnpm run build` does NOT work: `pnpm-workspace.yaml` still
holds literal `set this to true or false` placeholders for `allowBuilds`
(unfinished roadmap Phase 0), so pnpm aborts before vite runs.

## What to deploy

| File here | Wiki destination |
|---|---|
| `UptodateEditor.js` | `MediaWiki:Gadget-UptodateEditor.js` |
| `UptodateEditor.css` | `MediaWiki:Gadget-UptodateEditor.css` |
| `gadgets-definition-line.txt` | add that one line to `MediaWiki:Gadgets-definition`, under `== contents ==` |
| `wikitext-patches.md` | `Module:Freshness/core`, `Module:Freshness`, `Template:Uptodate` |

## Order

Either order is safe:

- **Gadget first** — `force-uptodate` is written into the template but ignored
  until the module patches land. Every other field works immediately.
- **Patches first** — harmless before the gadget exists.

Nothing was synced. `pnpm run sync` was deliberately not run.

## Do not paste the whole generated Gadgets-definition

`dist/gadgets/gadgets-definition.wikitext` currently differs from prod in many
places unrelated to this work — that is pre-existing repo/prod divergence which
the reconciliation roadmap exists to resolve. **Add only the single
`UptodateEditor` line.**

Two divergences worth fixing separately:

- The generator emits `[ResourceLoadernull]` (literal `null` concatenated onto
  `ResourceLoader`) for `movablesitenotice`, `massrename`, `massdelete`,
  `massupload` and `masscategorization`. That is malformed wikitext and would
  break those gadget definitions if synced.
- `citizen` loses its `skins=citizen|type=styles` flags in the generated output.

## MediaWiki syntax constraint (learned the hard way)

MediaWiki's ResourceLoader `JavaScriptMinifier` **cannot parse object spread**
(`{...x}`). It rejects the entire gadget with:

```
Parse error: Unexpected: ... on line N in MediaWiki:Gadget-UptodateEditor.js
```

This is specific to object spread, not modern syntax in general. On this wiki
(MediaWiki 1.45.4) live gadgets already ship arrow functions (30 of them),
rest and call spread `(...args)`, and even ES2020 optional chaining
(`Gadget-Datatables.js`) — all parsing fine.

Vite's `es2018` target passes object spread through untouched, so nothing in
the build catches it. `built-bundle.test.ts` now fails the suite if it
reappears.

**Check any deploy against the live parser oracle:**

```bash
curl -s "https://utaite.wiki/w/load.php?modules=ext.gadget.UptodateEditor&only=scripts"
```

A healthy module returns the script. A broken one returns an `mw.log.error`
line naming the parse error and the offending line number.

## Verification performed

- 86 jest tests pass (4 suites), typecheck clean.
- Parser validated against **all 88 live `/Songs` pages**: round-trip
  byte-identical, zero parameter loss under a date edit.
- Status detection validated against **all 836 live articles**: confident on
  801 (95.8%); the remaining 35 are correctly ambiguous (27, the
  `{{Inactive}} as Utaite / {{Active}} as producer` pattern) or unknown (8).
- The built bundle was driven in jsdom against DOM captured verbatim from the
  live Kogeinu page: button injection, permission gate, `/Songs` resolution,
  prefill, pin pre-ticking and preview all verified. See `built-bundle.test.ts`.
- Nothing was written to the wiki at any point.
