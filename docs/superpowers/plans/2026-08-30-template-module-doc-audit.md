# Template & Module Documentation Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only three-stage pipeline that mirrors every Template and Module page from utaite.wiki into `wiki/`, analyses documentation coverage and real usage, and renders one insight report.

**Architecture:** Three commands chained by files on disk — `fetch.ts` (network → `wiki/` + `_manifest.json`), `analyze.ts` (mirror → `wiki-audit.json`, offline), `report.ts` (JSON → HTML). Pure logic lives in small `lib/` and `analyze/` modules that take injected dependencies, so every unit is testable without network or fixtures on disk.

**Tech Stack:** TypeScript executed directly by Node 24 (no build step, as `dev-sync/sync.ts` does), `mwn` for read-only API access, Jest + ts-jest for tests.

**Spec:** `docs/superpowers/specs/2026-08-30-template-module-doc-audit-design.md`

## Global Constraints

- **Read-only.** No `mwn` write method (`save`, `edit`, `create`, `delete`, `move`) may be imported anywhere under `dev-utils/wiki-audit/`. A premature write to prod is this project's primary risk.
- **Branch:** `feat/template-module-doc-audit`. Already created; the spec is committed on it.
- **Never `git add -A` or `git add .`** in this repo. `core.autocrlf=true` with no `.gitattributes` makes ~100 files show as modified when they are pure line-ending churn. Stage only the exact paths each task names.
- **Node 24 / pnpm 11.** Run TS directly: `node dev-utils/wiki-audit/fetch.ts`.
- **Imports use `.js` extensions** (tsconfig is `nodenext`), e.g. `import { titleToPath } from './lib/titles.js'`.
- **Tests are colocated** as `*.test.ts` beside the module, matching `src/gadgets/contents/UptodateEditor/`.
- **Run tests:** `pnpm run tests` (jest). Single file: `npx jest <path>`.
- **API URL** comes from `WIKI_API_URL` in `.env` (`https://utaite.wiki/w/api.php`).
- **Excluded by owner instruction:** `Template:Utaite Spotlight/*natsuki`.
- **Namespaces in scope:** 10 (Template) and 828 (Module) only.

---

## File Structure

```
dev-utils/wiki-audit/
  lib/types.ts          shared interfaces; no logic
  lib/titles.ts         title <-> filesystem path encoding      + titles.test.ts
  lib/api.ts            read-only mwn wrapper, batching, paging + api.test.ts
  fetch.ts              enumeration -> wiki/ mirror + manifest + redirects.tsv
  analyze/usage.ts      usage graph + orphan tiers               + usage.test.ts
  analyze/docquality.ts doc scoring + parameter extraction       + docquality.test.ts
  analyze/plumbing.ts   redirect & doc-plumbing findings         + plumbing.test.ts
  analyze/provenance.ts first-revision user -> source wiki       + provenance.test.ts
  analyze.ts            orchestrator -> wiki-audit.json
  report.ts             wiki-audit.json -> HTML

wiki/                   (generated) templates/**, modules/**, _manifest.json, _redirects.tsv
wiki-audit.json         (generated) analysis output
```

`fetch.ts`, `analyze.ts` and `report.ts` are thin orchestrators. All logic worth testing lives in `lib/` and `analyze/`.

---

### Task 1: Title ↔ path encoding

The highest-risk correctness piece: six live titles are illegal Windows filenames, one has a trailing dot, and several groups collide case-insensitively on NTFS. Getting this wrong silently loses pages.

**Files:**
- Create: `dev-utils/wiki-audit/lib/types.ts`
- Create: `dev-utils/wiki-audit/lib/titles.ts`
- Test: `dev-utils/wiki-audit/lib/titles.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type ContentModel = 'wikitext' | 'Scribunto' | 'sanitized-css' | 'json' | 'text'`
  - `interface ManifestEntry` (full shape below)
  - `encodeSegment(seg: string): string`
  - `decodeSegment(seg: string): string`
  - `titleToPath(title: string, model: ContentModel): string`
  - `pathToTitle(path: string): string`
  - `assignPaths(entries: {title: string, model: ContentModel}[]): Map<string, string>`

- [ ] **Step 1: Create the shared types file**

Create `dev-utils/wiki-audit/lib/types.ts`:

```ts
export type ContentModel = 'wikitext' | 'Scribunto' | 'sanitized-css' | 'json' | 'text';

export interface FirstRevision {
  user: string;
  timestamp: string;
  comment: string;
  /** Interwiki prefix without '>', e.g. 'mw', 'wikia', 'mh', 'wp', 'meta'. Empty string = native. */
  sourceWiki: string;
}

export interface ManifestEntry {
  title: string;
  /** Repo-relative, POSIX separators, e.g. 'wiki/templates/Uptodate/doc.wikitext'. */
  path: string;
  ns: 10 | 828;
  model: ContentModel;
  length: number;
  sha1: string;
  revid: number;
  timestamp: string;
  redirect: boolean;
  redirectTarget?: string;
  firstRevision?: FirstRevision;
}

export interface Manifest {
  fetchedAt: string;
  apiUrl: string;
  entries: ManifestEntry[];
}
```

- [ ] **Step 2: Write the failing test**

Create `dev-utils/wiki-audit/lib/titles.test.ts`:

```ts
import { encodeSegment, decodeSegment, titleToPath, pathToTitle, assignPaths } from './titles.js';

describe('encodeSegment — percent-encodes what NTFS refuses', () => {
  test.each([
    ['?', '%3F'],
    ['*', '%2A'],
    ['Wp:ja', 'Wp%3Aja'],
    ['a<b>c', 'a%3Cb%3Ec'],
    ['pipe|bar', 'pipe%7Cbar'],
    ['quote"mark', 'quote%22mark'],
    ['100%', '100%25'],
  ])('encodes %s -> %s', (raw, want) => {
    expect(encodeSegment(raw)).toBe(want);
  });

  test('encodes a trailing dot', () => {
    expect(encodeSegment('News, Important Topics, etc.')).toBe('News, Important Topics, etc%2E');
  });

  test('encodes a trailing space', () => {
    expect(encodeSegment('trailing ')).toBe('trailing%20');
  });

  test('leaves ordinary segments untouched', () => {
    expect(encodeSegment('Uptodate')).toBe('Uptodate');
    expect(encodeSegment('Time ago')).toBe('Time ago');
  });

  test('encodes % before anything else, so encoding is reversible', () => {
    expect(decodeSegment(encodeSegment('%3F'))).toBe('%3F');
  });
});

describe('decodeSegment — round-trips every encodeSegment output', () => {
  test.each(['?', '*', 'Wp:ja', '100%', 'News, etc.', 'trailing ', 'Uptodate', 'a<b>|c"d'])(
    'round-trips %s',
    (raw) => { expect(decodeSegment(encodeSegment(raw))).toBe(raw); }
  );
});

describe('titleToPath', () => {
  test('maps a template root to templates/', () => {
    expect(titleToPath('Template:Uptodate', 'wikitext')).toBe('wiki/templates/Uptodate.wikitext');
  });

  test('maps subpages to real directories', () => {
    expect(titleToPath('Template:Uptodate/doc', 'wikitext')).toBe('wiki/templates/Uptodate/doc.wikitext');
  });

  test('maps a module to modules/ with .lua', () => {
    expect(titleToPath('Module:Yesno', 'Scribunto')).toBe('wiki/modules/Yesno.lua');
  });

  test('a module /doc is wikitext, not lua', () => {
    expect(titleToPath('Module:Yesno/doc', 'wikitext')).toBe('wiki/modules/Yesno/doc.wikitext');
  });

  test('sanitized-css becomes .css', () => {
    expect(titleToPath('Template:Infobox/styles.css', 'sanitized-css'))
      .toBe('wiki/templates/Infobox/styles.css.css');
  });

  test('encodes illegal characters per segment', () => {
    expect(titleToPath('Template:?', 'wikitext')).toBe('wiki/templates/%3F.wikitext');
    expect(titleToPath('Template:Wp:ja', 'wikitext')).toBe('wiki/templates/Wp%3Aja.wikitext');
  });

  test('does not encode the subpage separator', () => {
    expect(titleToPath('Template:Time ago/core', 'wikitext')).toBe('wiki/templates/Time ago/core.wikitext');
  });
});

describe('pathToTitle — inverse of titleToPath for non-colliding titles', () => {
  test.each([
    ['Template:Uptodate', 'wikitext' as const],
    ['Template:Uptodate/doc', 'wikitext' as const],
    ['Module:Yesno', 'Scribunto' as const],
    ['Template:?', 'wikitext' as const],
    ['Template:Wp:ja', 'wikitext' as const],
    ['Template:Time ago/core', 'wikitext' as const],
  ])('round-trips %s', (title, model) => {
    expect(pathToTitle(titleToPath(title, model))).toBe(title);
  });
});

describe('assignPaths — resolves case-insensitive collisions deterministically', () => {
  test('gives distinct paths to titles differing only by case', () => {
    const got = assignPaths([
      { title: 'Template:Yt', model: 'wikitext' },
      { title: 'Template:YT', model: 'wikitext' },
    ]);
    expect(got.get('Template:YT')).toBe('wiki/templates/YT.wikitext');
    expect(got.get('Template:Yt')).toBe('wiki/templates/Yt~2.wikitext');
  });

  test('is deterministic regardless of input order', () => {
    const a = assignPaths([
      { title: 'Template:Yt', model: 'wikitext' },
      { title: 'Template:YT', model: 'wikitext' },
    ]);
    const b = assignPaths([
      { title: 'Template:YT', model: 'wikitext' },
      { title: 'Template:Yt', model: 'wikitext' },
    ]);
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
  });

  test('handles a three-way collision', () => {
    const got = assignPaths([
      { title: 'Template:TOCright', model: 'wikitext' },
      { title: 'Template:TOCRight', model: 'wikitext' },
      { title: 'Template:Tocright', model: 'wikitext' },
    ]);
    expect(new Set(got.values()).size).toBe(3);
  });

  test('leaves non-colliding titles unsuffixed', () => {
    const got = assignPaths([
      { title: 'Template:Uptodate', model: 'wikitext' },
      { title: 'Template:Freshness', model: 'wikitext' },
    ]);
    expect(got.get('Template:Uptodate')).toBe('wiki/templates/Uptodate.wikitext');
    expect(got.get('Template:Freshness')).toBe('wiki/templates/Freshness.wikitext');
  });

  test('throws on an exact duplicate title rather than losing a page', () => {
    expect(() => assignPaths([
      { title: 'Template:Uptodate', model: 'wikitext' },
      { title: 'Template:Uptodate', model: 'wikitext' },
    ])).toThrow(/duplicate/i);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest dev-utils/wiki-audit/lib/titles.test.ts`
Expected: FAIL — cannot find module `./titles.js`.

- [ ] **Step 4: Write the implementation**

Create `dev-utils/wiki-audit/lib/titles.ts`:

```ts
import type { ContentModel } from './types.js';

const EXT: Record<ContentModel, string> = {
  wikitext: '.wikitext',
  Scribunto: '.lua',
  'sanitized-css': '.css',
  json: '.json',
  text: '.txt',
};

const NS_DIR: Record<number, string> = { 10: 'templates', 828: 'modules' };

/**
 * Characters NTFS refuses in a filename, plus the control range. '%' is in the
 * class so that encoding stays reversible.
 * Spaces and hyphens are LEGAL mid-name and deliberately absent here —
 * 'Time ago' must survive unchanged. Only TRAILING dots and spaces are a
 * problem, and they are handled separately below.
 */
const ILLEGAL = /[%<>:"|?*\x00-\x1f]/g;

export function encodeSegment(seg: string): string {
  let out = seg.replace(ILLEGAL, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
  // Windows also refuses trailing dots and spaces.
  out = out.replace(/[. ]$/, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
  return out;
}

export function decodeSegment(seg: string): string {
  return seg.replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function nsOf(title: string): number {
  return title.startsWith('Module:') ? 828 : 10;
}

function bodyOf(title: string): string {
  return title.slice(title.indexOf(':') + 1);
}

export function titleToPath(title: string, model: ContentModel): string {
  const dir = NS_DIR[nsOf(title)];
  const segments = bodyOf(title).split('/').map(encodeSegment);
  return `wiki/${dir}/${segments.join('/')}${EXT[model]}`;
}

export function pathToTitle(path: string): string {
  const m = path.match(/^wiki\/(templates|modules)\/(.+?)(\.wikitext|\.lua|\.css|\.json|\.txt)$/);
  if (!m) throw new Error(`not a mirror path: ${path}`);
  const prefix = m[1] === 'modules' ? 'Module:' : 'Template:';
  const body = m[2].split('/').map(decodeSegment).join('/');
  return prefix + body;
}

/**
 * Assigns a unique filesystem path to every title, resolving case-insensitive
 * collisions with deterministic ~2 / ~3 suffixes. Throws on exact duplicates —
 * silently losing a page is not an acceptable failure mode.
 */
export function assignPaths(entries: { title: string; model: ContentModel }[]): Map<string, string> {
  const seenTitles = new Set<string>();
  for (const e of entries) {
    if (seenTitles.has(e.title)) throw new Error(`duplicate title in input: ${e.title}`);
    seenTitles.add(e.title);
  }

  // Sort for order-independence, then group by lowercased natural path.
  const sorted = [...entries].sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
  const groups = new Map<string, { title: string; model: ContentModel; natural: string }[]>();
  for (const e of sorted) {
    const natural = titleToPath(e.title, e.model);
    const key = natural.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ ...e, natural });
  }

  const out = new Map<string, string>();
  for (const members of groups.values()) {
    members.forEach((m, i) => {
      if (i === 0) {
        out.set(m.title, m.natural);
      } else {
        const dot = m.natural.lastIndexOf('.');
        out.set(m.title, `${m.natural.slice(0, dot)}~${i + 1}${m.natural.slice(dot)}`);
      }
    });
  }
  return out;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest dev-utils/wiki-audit/lib/titles.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 6: Commit**

```bash
git add dev-utils/wiki-audit/lib/types.ts dev-utils/wiki-audit/lib/titles.ts dev-utils/wiki-audit/lib/titles.test.ts
git commit -m "feat(wiki-audit): title to filesystem path encoding

Percent-encodes NTFS-illegal characters and trailing dots/spaces, maps
subpages to directories, and resolves case-insensitive collisions with
deterministic suffixes. Throws on exact duplicates rather than dropping
a page."
```

---

### Task 2: Read-only API client

**Files:**
- Create: `dev-utils/wiki-audit/lib/api.ts`
- Test: `dev-utils/wiki-audit/lib/api.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `interface WikiQuery { query(params: Record<string, string>): Promise<any> }`
  - `createClient(apiUrl: string, userAgent: string): WikiQuery`
  - `queryAll(client: WikiQuery, params: Record<string, string>, extract: (d: any) => any[]): Promise<any[]>`
  - `chunk<T>(items: T[], size: number): T[][]`

- [ ] **Step 1: Write the failing test**

Create `dev-utils/wiki-audit/lib/api.test.ts`:

```ts
import { queryAll, chunk } from './api.js';
import type { WikiQuery } from './api.js';

function fakeClient(pages: any[]): WikiQuery {
  let call = 0;
  return {
    async query() {
      call++;
      if (call === 1) return { query: { allpages: pages.slice(0, 2) }, continue: { apcontinue: 'x' } };
      return { query: { allpages: pages.slice(2) } };
    },
  };
}

describe('chunk', () => {
  test('splits into batches of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  test('returns an empty array for empty input', () => {
    expect(chunk([], 50)).toEqual([]);
  });
});

describe('queryAll — follows continuation until exhausted', () => {
  test('concatenates every page across continuations', async () => {
    const client = fakeClient([{ title: 'a' }, { title: 'b' }, { title: 'c' }]);
    const got = await queryAll(client, { list: 'allpages' }, (d) => d.query.allpages);
    expect(got.map((p: any) => p.title)).toEqual(['a', 'b', 'c']);
  });

  test('stops after one call when there is no continue key', async () => {
    const client: WikiQuery = { async query() { return { query: { allpages: [{ title: 'only' }] } }; } };
    const got = await queryAll(client, { list: 'allpages' }, (d) => d.query.allpages);
    expect(got).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest dev-utils/wiki-audit/lib/api.test.ts`
Expected: FAIL — cannot find module `./api.js`.

- [ ] **Step 3: Write the implementation**

Create `dev-utils/wiki-audit/lib/api.ts`. Note there is deliberately no write method anywhere in this file — that is a hard constraint of the project, not an oversight.

```ts
/**
 * Read-only MediaWiki API access for the documentation audit.
 *
 * This module intentionally exposes ONLY query capability. No mwn write method
 * (save/edit/create/delete/move) is imported here or anywhere under
 * dev-utils/wiki-audit/, so the audit tooling is structurally incapable of
 * modifying the live wiki.
 */

export interface WikiQuery {
  query(params: Record<string, string>): Promise<any>;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function createClient(apiUrl: string, userAgent: string): WikiQuery {
  return {
    async query(params: Record<string, string>): Promise<any> {
      const body = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'User-Agent': userAgent, 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!res.ok) throw new Error(`API ${res.status} ${res.statusText}`);
      const json = await res.json();
      if (json.error) throw new Error(`API error: ${json.error.code} — ${json.error.info}`);
      return json;
    },
  };
}

/** Runs a query, following MediaWiki continuation until every result is collected. */
export async function queryAll(
  client: WikiQuery,
  params: Record<string, string>,
  extract: (d: any) => any[],
): Promise<any[]> {
  const out: any[] = [];
  let cont: Record<string, string> = {};
  for (;;) {
    const d = await client.query({ ...params, ...cont });
    out.push(...(extract(d) ?? []));
    if (d.continue) cont = d.continue;
    else return out;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest dev-utils/wiki-audit/lib/api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dev-utils/wiki-audit/lib/api.ts dev-utils/wiki-audit/lib/api.test.ts
git commit -m "feat(wiki-audit): read-only API client with continuation

Exposes query only; no mwn write method is imported anywhere under
wiki-audit, making the tooling structurally unable to modify prod."
```

---

### Task 3: Provenance classification

Pure function, so it lands before the network code that feeds it.

**Files:**
- Create: `dev-utils/wiki-audit/analyze/provenance.ts`
- Test: `dev-utils/wiki-audit/analyze/provenance.test.ts`

**Interfaces:**
- Consumes: `FirstRevision` from `lib/types.ts`.
- Produces:
  - `parseSourceWiki(user: string): string` — `''` when native
  - `describeSource(prefix: string): string` — human label
  - `isUpstream(rev: FirstRevision | undefined): boolean`

- [ ] **Step 1: Write the failing test**

Create `dev-utils/wiki-audit/analyze/provenance.test.ts`:

```ts
import { parseSourceWiki, describeSource, isUpstream } from './provenance.js';

describe('parseSourceWiki — the interwiki prefix is the provenance', () => {
  test.each([
    ['mw>ATDT', 'mw'],
    ['wikia>Awesome Aasi', 'wikia'],
    ['mh>PetraMagna', 'mh'],
    ['wp>Someone', 'wp'],
    ['meta>Someone', 'meta'],
    ['wikia:utaite>Default', 'wikia:utaite'],
  ])('reads %s as %s', (user, want) => {
    expect(parseSourceWiki(user)).toBe(want);
  });

  test.each(['Ark', 'Arknomahounorobotto', ''])('treats %s as native', (user) => {
    expect(parseSourceWiki(user)).toBe('');
  });
});

describe('describeSource', () => {
  test.each([
    ['mw', 'mediawiki.org'],
    ['wp', 'Wikipedia'],
    ['meta', 'Meta-Wiki'],
    ['wikia', 'Fandom (wiki not identified)'],
    ['wikia:utaite', 'Fandom — old utaite wiki'],
    ['', 'written on this wiki'],
  ])('labels %s', (prefix, want) => {
    expect(describeSource(prefix)).toBe(want);
  });

  test('falls back to the raw prefix for an unknown wiki', () => {
    expect(describeSource('mh')).toBe('mh');
  });
});

describe('isUpstream — drives the write-vs-source split', () => {
  test('an imported page is upstream', () => {
    expect(isUpstream({ user: 'mw>ATDT', timestamp: '', comment: '', sourceWiki: 'mw' })).toBe(true);
  });

  test('a native page is not upstream', () => {
    expect(isUpstream({ user: 'Ark', timestamp: '', comment: '', sourceWiki: '' })).toBe(false);
  });

  test('unknown provenance is not assumed upstream', () => {
    expect(isUpstream(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest dev-utils/wiki-audit/analyze/provenance.test.ts`
Expected: FAIL — cannot find module `./provenance.js`.

- [ ] **Step 3: Write the implementation**

Create `dev-utils/wiki-audit/analyze/provenance.ts`:

```ts
import type { FirstRevision } from '../lib/types.js';

/**
 * Transwiki import preserves the original revision history with interwiki-
 * prefixed usernames, so the first revision's user IS the provenance.
 * Special:Import log events are deliberately not consulted: they are redundant
 * with this signal and narrower, missing anything imported outside a logged
 * Special:Import.
 */
export function parseSourceWiki(user: string): string {
  const i = user.indexOf('>');
  return i === -1 ? '' : user.slice(0, i);
}

const LABELS: Record<string, string> = {
  mw: 'mediawiki.org',
  wp: 'Wikipedia',
  meta: 'Meta-Wiki',
  wikia: 'Fandom (wiki not identified)',
  'wikia:utaite': 'Fandom — old utaite wiki',
  '': 'written on this wiki',
};

export function describeSource(prefix: string): string {
  return LABELS[prefix] ?? prefix;
}

/**
 * True when upstream documentation is likely to exist, meaning the page needs
 * its doc SOURCED rather than AUTHORED. Unknown provenance is never assumed
 * upstream — that would wrongly move work out of the write queue.
 */
export function isUpstream(rev: FirstRevision | undefined): boolean {
  return !!rev && rev.sourceWiki !== '';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest dev-utils/wiki-audit/analyze/provenance.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dev-utils/wiki-audit/analyze/provenance.ts dev-utils/wiki-audit/analyze/provenance.test.ts
git commit -m "feat(wiki-audit): provenance from first-revision interwiki prefix

Splits the backlog into pages that must be authored here and pages whose
upstream docs can be sourced. Unknown provenance stays in the write queue."
```

---

### Task 4: Fetch — mirror, manifest, redirects

**Files:**
- Create: `dev-utils/wiki-audit/fetch.ts`
- Test: `dev-utils/wiki-audit/fetch.test.ts`

**Interfaces:**
- Consumes: `assignPaths`, `titleToPath` (Task 1); `WikiQuery`, `queryAll`, `chunk` (Task 2); `ManifestEntry`, `Manifest` (Task 1).
- Produces:
  - `buildManifest(pages: RawPage[]): Manifest` — pure, testable
  - `renderRedirectsTsv(m: Manifest): string` — pure, testable
  - `interface RawPage { title: string; ns: number; model: ContentModel; length: number; sha1: string; revid: number; timestamp: string; redirect: boolean; redirectTarget?: string; content: string }`
  - `runFetch(client: WikiQuery, outDir: string): Promise<Manifest>` — the orchestrator

- [ ] **Step 1: Write the failing test**

Create `dev-utils/wiki-audit/fetch.test.ts`:

```ts
import { buildManifest, renderRedirectsTsv, EXCLUDED_TITLES } from './fetch.js';
import type { RawPage } from './fetch.js';

function page(over: Partial<RawPage> = {}): RawPage {
  return {
    title: 'Template:Uptodate', ns: 10, model: 'wikitext', length: 10, sha1: 'abc',
    revid: 1, timestamp: '2026-01-01T00:00:00Z', redirect: false, content: 'x', ...over,
  };
}

describe('buildManifest', () => {
  test('assigns a path to every page', () => {
    const m = buildManifest([page(), page({ title: 'Module:Yesno', ns: 828, model: 'Scribunto' })]);
    expect(m.entries).toHaveLength(2);
    expect(m.entries.find((e) => e.title === 'Module:Yesno')!.path).toBe('wiki/modules/Yesno.lua');
  });

  test('records redirect status and target', () => {
    const m = buildManifest([page({ title: 'Template:YT', redirect: true, redirectTarget: 'Template:Yt' })]);
    expect(m.entries[0].redirect).toBe(true);
    expect(m.entries[0].redirectTarget).toBe('Template:Yt');
  });

  test('drops owner-excluded titles', () => {
    const m = buildManifest([page(), page({ title: 'Template:Utaite Spotlight/*natsuki' })]);
    expect(m.entries.map((e) => e.title)).not.toContain('Template:Utaite Spotlight/*natsuki');
    expect(EXCLUDED_TITLES).toContain('Template:Utaite Spotlight/*natsuki');
  });

  test('gives colliding titles distinct paths', () => {
    const m = buildManifest([page({ title: 'Template:Yt' }), page({ title: 'Template:YT' })]);
    const paths = m.entries.map((e) => e.path);
    expect(new Set(paths).size).toBe(2);
  });

  test('stamps the fetch time', () => {
    const m = buildManifest([page()]);
    expect(m.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('renderRedirectsTsv', () => {
  test('emits sorted from-tab-to lines for redirects only', () => {
    const m = buildManifest([
      page({ title: 'Template:YT', redirect: true, redirectTarget: 'Template:Yt' }),
      page({ title: 'Template:Ytc', redirect: true, redirectTarget: 'Template:YtC' }),
      page({ title: 'Template:Uptodate' }),
    ]);
    expect(renderRedirectsTsv(m)).toBe('Template:YT\tTemplate:Yt\nTemplate:Ytc\tTemplate:YtC\n');
  });

  test('returns an empty string when there are no redirects', () => {
    expect(renderRedirectsTsv(buildManifest([page()]))).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest dev-utils/wiki-audit/fetch.test.ts`
Expected: FAIL — cannot find module `./fetch.js`.

- [ ] **Step 3: Write the implementation**

Create `dev-utils/wiki-audit/fetch.ts`:

```ts
import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { assignPaths } from './lib/titles.js';
import { createClient, queryAll, chunk } from './lib/api.js';
import type { WikiQuery } from './lib/api.js';
import type { ContentModel, Manifest, ManifestEntry } from './lib/types.js';

export const EXCLUDED_TITLES = ['Template:Utaite Spotlight/*natsuki'];

const NAMESPACES = [10, 828] as const;
const USER_AGENT = 'UtaiteWikiDocAudit/1.0 (repo tooling; read-only)';

export interface RawPage {
  title: string;
  ns: number;
  model: ContentModel;
  length: number;
  sha1: string;
  revid: number;
  timestamp: string;
  redirect: boolean;
  redirectTarget?: string;
  content: string;
}

export function buildManifest(pages: RawPage[]): Manifest {
  const kept = pages.filter((p) => !EXCLUDED_TITLES.includes(p.title));
  const paths = assignPaths(kept.map((p) => ({ title: p.title, model: p.model })));

  const entries: ManifestEntry[] = kept.map((p) => ({
    title: p.title,
    path: paths.get(p.title)!,
    ns: p.ns as 10 | 828,
    model: p.model,
    length: p.length,
    sha1: p.sha1,
    revid: p.revid,
    timestamp: p.timestamp,
    redirect: p.redirect,
    ...(p.redirectTarget ? { redirectTarget: p.redirectTarget } : {}),
  }));

  entries.sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
  return { fetchedAt: new Date().toISOString(), apiUrl: process.env.WIKI_API_URL ?? '', entries };
}

export function renderRedirectsTsv(m: Manifest): string {
  return m.entries
    .filter((e) => e.redirect && e.redirectTarget)
    .map((e) => `${e.title}\t${e.redirectTarget}`)
    .sort()
    .map((l) => l + '\n')
    .join('');
}

async function enumeratePages(client: WikiQuery): Promise<Map<string, { ns: number; redirect: boolean }>> {
  const out = new Map<string, { ns: number; redirect: boolean }>();
  for (const ns of NAMESPACES) {
    for (const filter of ['redirects', 'nonredirects'] as const) {
      const pages = await queryAll(
        client,
        { action: 'query', list: 'allpages', apnamespace: String(ns), aplimit: '500', apfilterredir: filter },
        (d) => d.query.allpages,
      );
      for (const p of pages) out.set(p.title, { ns, redirect: filter === 'redirects' });
    }
  }
  return out;
}

async function fetchContent(client: WikiQuery, titles: string[], meta: Map<string, { ns: number; redirect: boolean }>): Promise<RawPage[]> {
  const out: RawPage[] = [];
  const batches = chunk(titles, 50);
  for (const [i, batch] of batches.entries()) {
    process.stdout.write(`\r  content ${i + 1}/${batches.length}`);
    const d = await client.query({
      action: 'query',
      prop: 'revisions|info',
      rvprop: 'content|ids|timestamp|sha1',
      rvslots: 'main',
      titles: batch.join('|'),
    });
    for (const p of d.query.pages ?? []) {
      const rev = p.revisions?.[0];
      if (!rev) continue;
      const slot = rev.slots.main;
      const info = meta.get(p.title)!;
      out.push({
        title: p.title,
        ns: info.ns,
        model: slot.contentmodel as ContentModel,
        length: p.length ?? slot.content.length,
        sha1: rev.sha1 ?? '',
        revid: rev.revid,
        timestamp: rev.timestamp,
        redirect: info.redirect,
        content: slot.content ?? '',
      });
    }
  }
  process.stdout.write('\n');
  return out;
}

async function resolveRedirectTargets(client: WikiQuery, redirects: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const batch of chunk(redirects, 50)) {
    const d = await client.query({ action: 'query', titles: batch.join('|'), redirects: '1' });
    for (const r of d.query.redirects ?? []) out.set(r.from, r.to);
  }
  return out;
}

export async function runFetch(client: WikiQuery, outDir: string): Promise<Manifest> {
  console.log('Enumerating Template and Module namespaces...');
  const meta = await enumeratePages(client);
  console.log(`  ${meta.size} pages`);

  const titles = [...meta.keys()].filter((t) => !EXCLUDED_TITLES.includes(t));
  const pages = await fetchContent(client, titles, meta);

  const redirectTitles = pages.filter((p) => p.redirect).map((p) => p.title);
  const targets = await resolveRedirectTargets(client, redirectTitles);
  for (const p of pages) if (p.redirect) p.redirectTarget = targets.get(p.title);

  const manifest = buildManifest(pages);

  console.log('Writing mirror...');
  const byTitle = new Map(pages.map((p) => [p.title, p]));
  for (const e of manifest.entries) {
    const abs = resolve(outDir, '..', e.path);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, byTitle.get(e.title)!.content, 'utf8');
  }
  await writeFile(resolve(outDir, '_manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  await writeFile(resolve(outDir, '_redirects.tsv'), renderRedirectsTsv(manifest), 'utf8');

  console.log(`Done: ${manifest.entries.length} pages mirrored.`);
  return manifest;
}

if (import.meta.filename === process.argv[1]) {
  const apiUrl = process.env.WIKI_API_URL;
  if (!apiUrl) throw new Error('WIKI_API_URL is not set');
  const outDir = resolve(import.meta.dirname, '../../wiki');
  await mkdir(outDir, { recursive: true });
  await runFetch(createClient(apiUrl, USER_AGENT), outDir);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest dev-utils/wiki-audit/fetch.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the real fetch against the live wiki**

```bash
node --env-file=.env dev-utils/wiki-audit/fetch.ts
```

Expected: roughly 1,369 pages mirrored, ~30 content requests, completing in about a minute. Verify:

```bash
node -e "const m=require('./wiki/_manifest.json');console.log('entries',m.entries.length,'redirects',m.entries.filter(e=>e.redirect).length)"
```

Expected: `entries` matches the file count under `wiki/`, `redirects` is about 105.

- [ ] **Step 6: Verify the mirror is faithful**

```bash
node -e "
const m=require('./wiki/_manifest.json'), fs=require('fs');
let bad=0;
for (const e of m.entries) if (!fs.existsSync(e.path)) { console.log('MISSING',e.path); bad++; }
console.log(bad? bad+' missing':'all manifest paths exist on disk');
"
```

Expected: `all manifest paths exist on disk`.

- [ ] **Step 7: Commit the tooling and the mirror separately**

```bash
git add dev-utils/wiki-audit/fetch.ts dev-utils/wiki-audit/fetch.test.ts
git commit -m "feat(wiki-audit): fetch stage — mirror, manifest, redirects.tsv"
git add wiki/
git commit -m "chore(wiki): mirror Template and Module namespaces from live wiki

Read-only snapshot of all Template and Module pages, ~2.4 MiB. Prod is
the source of truth; this is the audit baseline, not an edit target."
```

---

### Task 5: Fetch — first revisions for provenance

Kept separate from Task 4 because it is a distinct ~5 minute network pass with its own cache, and a reviewer could reasonably accept the mirror while rejecting this.

**Files:**
- Modify: `dev-utils/wiki-audit/fetch.ts` (add `enrichFirstRevisions`, call it from `runFetch`)
- Modify: `dev-utils/wiki-audit/fetch.test.ts` (add the cache tests below)

**Interfaces:**
- Consumes: `parseSourceWiki` (Task 3), `WikiQuery` (Task 2), `Manifest` (Task 1).
- Produces: `enrichFirstRevisions(client: WikiQuery, m: Manifest, prior?: Manifest): Promise<Manifest>`

- [ ] **Step 1: Write the failing test**

Append to `dev-utils/wiki-audit/fetch.test.ts`:

```ts
import { enrichFirstRevisions } from './fetch.js';
import type { WikiQuery } from './lib/api.js';

describe('enrichFirstRevisions', () => {
  const client: WikiQuery = {
    async query(p) {
      return { query: { pages: [{ title: p.titles, revisions: [{ user: 'mw>ATDT', timestamp: '2013-02-28T00:00:00Z', comment: 'Ported' }] }] } };
    },
  };

  test('records the first revision and its parsed source wiki', async () => {
    const m = buildManifest([page({ title: 'Module:Yesno', ns: 828, model: 'Scribunto' })]);
    const out = await enrichFirstRevisions(client, m);
    expect(out.entries[0].firstRevision).toEqual({
      user: 'mw>ATDT', timestamp: '2013-02-28T00:00:00Z', comment: 'Ported', sourceWiki: 'mw',
    });
  });

  test('reuses a cached first revision when revid is unchanged', async () => {
    let calls = 0;
    const counting: WikiQuery = { async query(p) { calls++; return client.query(p); } };
    const m = buildManifest([page({ title: 'Module:Yesno', ns: 828, model: 'Scribunto', revid: 7 })]);
    const prior = await enrichFirstRevisions(client, m);
    await enrichFirstRevisions(counting, m, prior);
    expect(calls).toBe(0);
  });

  test('refetches when revid has changed', async () => {
    let calls = 0;
    const counting: WikiQuery = { async query(p) { calls++; return client.query(p); } };
    const prior = await enrichFirstRevisions(client, buildManifest([page({ title: 'Module:Yesno', ns: 828, model: 'Scribunto', revid: 7 })]));
    const changed = buildManifest([page({ title: 'Module:Yesno', ns: 828, model: 'Scribunto', revid: 8 })]);
    await enrichFirstRevisions(counting, changed, prior);
    expect(calls).toBe(1);
  });

  test('only queries root pages, not subpages', async () => {
    let calls = 0;
    const counting: WikiQuery = { async query(p) { calls++; return client.query(p); } };
    const m = buildManifest([
      page({ title: 'Template:Uptodate' }),
      page({ title: 'Template:Uptodate/doc' }),
    ]);
    await enrichFirstRevisions(counting, m);
    expect(calls).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest dev-utils/wiki-audit/fetch.test.ts -t enrichFirstRevisions`
Expected: FAIL — `enrichFirstRevisions` is not exported.

- [ ] **Step 3: Add the implementation**

Add to `dev-utils/wiki-audit/fetch.ts` (import `parseSourceWiki` from `./analyze/provenance.js` at the top):

```ts
/**
 * Fetches each root page's FIRST revision, whose interwiki-prefixed username
 * carries the page's provenance.
 *
 * Per-page rvdir=newer is used deliberately. A list=allrevisions&arvdir=newer
 * sweep was measured and rejected: it walks the namespace's entire revision
 * history from 2013 forward and spent 122 requests to resolve only 32 pages.
 * Per-page costs ~568 ms, so ~5.4 minutes for 566 roots, cached by revid.
 */
export async function enrichFirstRevisions(client: WikiQuery, m: Manifest, prior?: Manifest): Promise<Manifest> {
  const cache = new Map((prior?.entries ?? []).map((e) => [e.title, e]));
  const isRoot = (t: string) => !t.slice(t.indexOf(':') + 1).includes('/');
  const roots = m.entries.filter((e) => isRoot(e.title));

  for (const [i, e] of roots.entries()) {
    const cached = cache.get(e.title);
    if (cached?.firstRevision && cached.revid === e.revid) {
      e.firstRevision = cached.firstRevision;
      continue;
    }
    if (i % 25 === 0) process.stdout.write(`\r  first revisions ${i}/${roots.length}`);
    const d = await client.query({
      action: 'query', prop: 'revisions', titles: e.title,
      rvdir: 'newer', rvlimit: '1', rvprop: 'user|timestamp|comment',
    });
    const rev = d.query.pages?.[0]?.revisions?.[0];
    if (!rev) continue;
    e.firstRevision = {
      user: rev.user ?? '',
      timestamp: rev.timestamp ?? '',
      comment: rev.comment ?? '',
      sourceWiki: parseSourceWiki(rev.user ?? ''),
    };
  }
  process.stdout.write('\n');
  return m;
}
```

Then in `runFetch`, after `const manifest = buildManifest(pages);` and before the mirror write, add:

```ts
  const priorPath = resolve(outDir, '_manifest.json');
  let prior: Manifest | undefined;
  try { prior = JSON.parse(await readFile(priorPath, 'utf8')); } catch { prior = undefined; }
  console.log('Collecting first revisions for provenance...');
  await enrichFirstRevisions(client, manifest, prior);
```

Add `readFile` to the `fs/promises` import.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest dev-utils/wiki-audit/fetch.test.ts`
Expected: PASS.

- [ ] **Step 5: Re-run the real fetch and sanity-check provenance**

```bash
node --env-file=.env dev-utils/wiki-audit/fetch.ts
```

```bash
node -e "
const m=require('./wiki/_manifest.json');
const roots=m.entries.filter(e=>!e.title.slice(e.title.indexOf(':')+1).includes('/'));
const c={}; for(const e of roots){const s=e.firstRevision?e.firstRevision.sourceWiki||'(native)':'(unknown)'; c[s]=(c[s]||0)+1;}
console.log(c);
console.log('Module:Yesno ->', m.entries.find(e=>e.title==='Module:Yesno').firstRevision);
"
```

Expected: `Module:Yesno` shows `sourceWiki: 'mw'`. The distribution shows a mix of `(native)`, `mw`, `wikia`, `mh`, `wp`, `meta`.

- [ ] **Step 6: Commit**

```bash
git add dev-utils/wiki-audit/fetch.ts dev-utils/wiki-audit/fetch.test.ts
git commit -m "feat(wiki-audit): collect first revisions for provenance

Per-page rvdir=newer, cached by revid. The allrevisions sweep was
measured and rejected: 122 requests resolved only 32 pages."
git add wiki/_manifest.json
git commit -m "chore(wiki): add provenance to the mirror manifest"
```

---

### Task 6: Analyze — usage graph and orphan tiers

**Files:**
- Create: `dev-utils/wiki-audit/analyze/usage.ts`
- Test: `dev-utils/wiki-audit/analyze/usage.test.ts`

**Interfaces:**
- Consumes: `Manifest`, `ManifestEntry` (Task 1).
- Produces:
  - `type UsageTier = 'USED' | 'INTERNAL' | 'DOC-ONLY' | 'UNUSED'`
  - `interface UsageRecord { title, transclusions, transclusionsCapped, transcludedFrom, requiredBy, gadgetRefs, tier, needsManualReview }`
  - `resolveRedirects(m: Manifest): Map<string, string>`
  - `extractRequires(lua: string): string[]`
  - `extractGadgetRefs(text: string): string[]`
  - `classify(input: ClassifyInput): { tier: UsageTier; needsManualReview: boolean }`

- [ ] **Step 1: Write the failing test**

Create `dev-utils/wiki-audit/analyze/usage.test.ts`:

```ts
import { resolveRedirects, extractRequires, extractGadgetRefs, classify } from './usage.js';
import type { Manifest } from '../lib/types.js';

function manifest(entries: any[]): Manifest {
  return { fetchedAt: '', apiUrl: '', entries };
}

describe('resolveRedirects — usage must count toward the target', () => {
  test('maps a redirect to its target', () => {
    const m = manifest([
      { title: 'Template:YT', redirect: true, redirectTarget: 'Template:Yt' },
      { title: 'Template:Yt', redirect: false },
    ]);
    expect(resolveRedirects(m).get('Template:YT')).toBe('Template:Yt');
  });

  test('follows a two-hop chain to the final target', () => {
    const m = manifest([
      { title: 'Template:A', redirect: true, redirectTarget: 'Template:B' },
      { title: 'Template:B', redirect: true, redirectTarget: 'Template:C' },
      { title: 'Template:C', redirect: false },
    ]);
    expect(resolveRedirects(m).get('Template:A')).toBe('Template:C');
  });

  test('does not loop forever on a cycle', () => {
    const m = manifest([
      { title: 'Template:A', redirect: true, redirectTarget: 'Template:B' },
      { title: 'Template:B', redirect: true, redirectTarget: 'Template:A' },
    ]);
    expect(() => resolveRedirects(m)).not.toThrow();
  });

  test('leaves non-redirects mapping to themselves', () => {
    const m = manifest([{ title: 'Template:Yt', redirect: false }]);
    expect(resolveRedirects(m).get('Template:Yt')).toBe('Template:Yt');
  });
});

describe('extractRequires — module-to-module edges', () => {
  test('finds a single-quoted require', () => {
    expect(extractRequires("local y = require('Module:Yesno')")).toEqual(['Module:Yesno']);
  });

  test('finds a double-quoted require', () => {
    expect(extractRequires('require("Module:TableTools")')).toEqual(['Module:TableTools']);
  });

  test('finds mw.loadData', () => {
    expect(extractRequires("mw.loadData('Module:Utaite/data')")).toEqual(['Module:Utaite/data']);
  });

  test('finds several and de-duplicates', () => {
    const lua = "require('Module:Yesno') require('Module:Yesno') require('Module:Args')";
    expect(extractRequires(lua).sort()).toEqual(['Module:Args', 'Module:Yesno']);
  });

  test('ignores a Dev: require, which is not a local module', () => {
    expect(extractRequires("require('Dev:Documentation')")).toEqual([]);
  });

  test('returns empty for lua with no requires', () => {
    expect(extractRequires('local p = {} return p')).toEqual([]);
  });
});

describe('extractGadgetRefs — templates a gadget writes at runtime', () => {
  test('finds a Template: string in JS', () => {
    expect(extractGadgetRefs("api.edit('Template:Uptodate', ...)")).toEqual(['Template:Uptodate']);
  });

  test('finds a Module: string', () => {
    expect(extractGadgetRefs('var m = "Module:Freshness";')).toEqual(['Module:Freshness']);
  });

  test('de-duplicates repeated references', () => {
    expect(extractGadgetRefs("'Template:Uptodate' 'Template:Uptodate'")).toEqual(['Template:Uptodate']);
  });

  test('returns empty when there are none', () => {
    expect(extractGadgetRefs('function foo() { return 1; }')).toEqual([]);
  });
});

describe('classify — tiers, not a boolean', () => {
  const base = { transclusions: 0, transcludedFrom: [] as string[], requiredBy: [] as string[], gadgetRefs: [] as string[], dynamic: false };

  test('mainspace transclusion is USED', () => {
    expect(classify({ ...base, transclusions: 12, transcludedFrom: ['Some Article'] }).tier).toBe('USED');
  });

  test('a gadget reference alone is USED', () => {
    expect(classify({ ...base, gadgetRefs: ['Gadget-UptodateEditor.js'] }).tier).toBe('USED');
  });

  test('required by another module is INTERNAL, not a deletion candidate', () => {
    expect(classify({ ...base, requiredBy: ['Module:Documentation'] }).tier).toBe('INTERNAL');
  });

  test('transcluded only from other templates is INTERNAL', () => {
    expect(classify({ ...base, transclusions: 3, transcludedFrom: ['Template:Foo', 'Module:Bar'] }).tier).toBe('INTERNAL');
  });

  test('used only from doc and sandbox pages is DOC-ONLY', () => {
    expect(classify({ ...base, transclusions: 2, transcludedFrom: ['Template:Foo/doc', 'Template:Bar/sandbox'] }).tier).toBe('DOC-ONLY');
  });

  test('no edges at all is UNUSED', () => {
    expect(classify(base).tier).toBe('UNUSED');
  });

  test('a dynamic invocation is never reported as confidently dead', () => {
    const got = classify({ ...base, dynamic: true });
    expect(got.tier).toBe('UNUSED');
    expect(got.needsManualReview).toBe(true);
  });

  test('a plainly used page does not need manual review', () => {
    expect(classify({ ...base, transclusions: 40, transcludedFrom: ['Article'] }).needsManualReview).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest dev-utils/wiki-audit/analyze/usage.test.ts`
Expected: FAIL — cannot find module `./usage.js`.

- [ ] **Step 3: Write the implementation**

Create `dev-utils/wiki-audit/analyze/usage.ts`:

```ts
import type { Manifest } from '../lib/types.js';

export type UsageTier = 'USED' | 'INTERNAL' | 'DOC-ONLY' | 'UNUSED';

export interface UsageRecord {
  title: string;
  transclusions: number;
  transclusionsCapped: boolean;
  transcludedFrom: string[];
  requiredBy: string[];
  gadgetRefs: string[];
  tier: UsageTier;
  needsManualReview: boolean;
}

export interface ClassifyInput {
  transclusions: number;
  transcludedFrom: string[];
  requiredBy: string[];
  gadgetRefs: string[];
  dynamic: boolean;
}

/**
 * Maps every title to its final redirect target so that usage of a redirect
 * counts as usage of the target. Without this, targets look under-used and
 * redirects look orphaned.
 */
export function resolveRedirects(m: Manifest): Map<string, string> {
  const target = new Map<string, string>();
  for (const e of m.entries) target.set(e.title, e.redirect && e.redirectTarget ? e.redirectTarget : e.title);

  const out = new Map<string, string>();
  for (const start of target.keys()) {
    let cur = start;
    const seen = new Set<string>([cur]);
    for (;;) {
      const next = target.get(cur);
      if (!next || next === cur) break;
      if (seen.has(next)) break; // cycle — stop where we are
      seen.add(next);
      cur = next;
    }
    out.set(start, cur);
  }
  return out;
}

const REQUIRE_RX = /(?:require|mw\.loadData)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

export function extractRequires(lua: string): string[] {
  const out = new Set<string>();
  for (const m of lua.matchAll(REQUIRE_RX)) {
    if (m[1].startsWith('Module:')) out.add(m[1]);
  }
  return [...out];
}

const GADGET_REF_RX = /['"](?:Template|Module):[^'"\n]{1,120}?['"]/g;

export function extractGadgetRefs(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(GADGET_REF_RX)) out.add(m[0].slice(1, -1));
  return [...out];
}

const DOCISH = /\/(doc|sandbox|Draft|testcases)$/i;

export function classify(input: ClassifyInput): { tier: UsageTier; needsManualReview: boolean } {
  const { transclusions, transcludedFrom, requiredBy, gadgetRefs, dynamic } = input;

  if (gadgetRefs.length > 0) return { tier: 'USED', needsManualReview: false };

  const real = transcludedFrom.filter((t) => !DOCISH.test(t));
  const contentSpace = real.filter((t) => !/^(Template|Module):/.test(t));

  if (contentSpace.length > 0) return { tier: 'USED', needsManualReview: dynamic };
  if (requiredBy.length > 0 || real.length > 0) return { tier: 'INTERNAL', needsManualReview: dynamic };
  if (transclusions > 0) return { tier: 'DOC-ONLY', needsManualReview: dynamic };
  return { tier: 'UNUSED', needsManualReview: dynamic };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest dev-utils/wiki-audit/analyze/usage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dev-utils/wiki-audit/analyze/usage.ts dev-utils/wiki-audit/analyze/usage.test.ts
git commit -m "feat(wiki-audit): usage graph with redirect resolution and orphan tiers

Usage resolves through redirects so targets are not undercounted.
Classification is tiered — INTERNAL pages are alive but invisible and
are never deletion candidates."
```

---

### Task 7: Analyze — documentation quality and parameters

**Files:**
- Create: `dev-utils/wiki-audit/analyze/docquality.ts`
- Test: `dev-utils/wiki-audit/analyze/docquality.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure string analysis).
- Produces:
  - `extractParameters(wikitext: string): string[]`
  - `extractDocumentedParameters(doc: string): string[]`
  - `scoreDoc(input: DocScoreInput): DocScore`
  - `interface DocScore { hasDoc, sizeTier, hasTemplateData, hasHeader, mentionsStyles, undocumentedParams, gap }`

- [ ] **Step 1: Write the failing test**

Create `dev-utils/wiki-audit/analyze/docquality.test.ts`:

```ts
import { extractParameters, extractDocumentedParameters, scoreDoc } from './docquality.js';

describe('extractParameters — the template\'s real parameter set', () => {
  test('finds named parameters with defaults', () => {
    expect(extractParameters('{{{date|}}} and {{{bordercolor|#fff}}}').sort()).toEqual(['bordercolor', 'date']);
  });

  test('finds a parameter with no default', () => {
    expect(extractParameters('{{{name}}}')).toEqual(['name']);
  });

  test('finds numbered parameters', () => {
    expect(extractParameters('{{{1|}}} {{{2|}}}').sort()).toEqual(['1', '2']);
  });

  test('de-duplicates repeated uses', () => {
    expect(extractParameters('{{{date|}}} {{{date|}}}')).toEqual(['date']);
  });

  test('does not mistake triple braces inside a template call', () => {
    expect(extractParameters('{{Foo|bar=baz}}')).toEqual([]);
  });

  test('trims whitespace in the parameter name', () => {
    expect(extractParameters('{{{ date | }}}')).toEqual(['date']);
  });
});

describe('extractDocumentedParameters', () => {
  test('reads names out of a templatedata block', () => {
    const doc = `<templatedata>{"params":{"date":{},"bordercolor":{}}}</templatedata>`;
    expect(extractDocumentedParameters(doc).sort()).toEqual(['bordercolor', 'date']);
  });

  test('reads names mentioned in prose as code', () => {
    expect(extractDocumentedParameters('use <code>force-uptodate=yes</code>')).toEqual(['force-uptodate']);
  });

  test('survives malformed templatedata without throwing', () => {
    expect(() => extractDocumentedParameters('<templatedata>{not json}</templatedata>')).not.toThrow();
  });

  test('returns empty for an empty doc', () => {
    expect(extractDocumentedParameters('')).toEqual([]);
  });
});

describe('scoreDoc', () => {
  const base = { doc: undefined as string | undefined, source: '', hasStylesPage: false };

  test('marks a missing doc', () => {
    const s = scoreDoc(base);
    expect(s.hasDoc).toBe(false);
    expect(s.sizeTier).toBe('none');
  });

  test('tiers doc size', () => {
    expect(scoreDoc({ ...base, doc: 'x'.repeat(100) }).sizeTier).toBe('stub');
    expect(scoreDoc({ ...base, doc: 'x'.repeat(400) }).sizeTier).toBe('thin');
    expect(scoreDoc({ ...base, doc: 'x'.repeat(1000) }).sizeTier).toBe('adequate');
    expect(scoreDoc({ ...base, doc: 'x'.repeat(3000) }).sizeTier).toBe('rich');
  });

  test('detects templatedata and the house header', () => {
    const s = scoreDoc({ ...base, doc: '{{Documentation/Header}} <templatedata>{}</templatedata>' });
    expect(s.hasTemplateData).toBe(true);
    expect(s.hasHeader).toBe(true);
  });

  test('flags a stylesheet the doc never mentions', () => {
    const s = scoreDoc({ ...base, doc: 'nothing about styling', hasStylesPage: true });
    expect(s.mentionsStyles).toBe(false);
  });

  test('accepts a doc that does mention its stylesheet', () => {
    const s = scoreDoc({ ...base, doc: 'styling lives in /styles.css', hasStylesPage: true });
    expect(s.mentionsStyles).toBe(true);
  });

  test('counts undocumented parameters', () => {
    const s = scoreDoc({ ...base, source: '{{{date|}}} {{{color|}}} {{{size|}}}', doc: 'only <code>date=</code> here' });
    expect(s.undocumentedParams.sort()).toEqual(['color', 'size']);
  });

  test('gap is higher for a rich doc missing many params than a short complete one', () => {
    const missingMany = scoreDoc({ ...base, source: '{{{a|}}}{{{b|}}}{{{c|}}}{{{d|}}}', doc: 'x'.repeat(3000) });
    const shortComplete = scoreDoc({ ...base, source: '{{{a|}}}', doc: 'covers <code>a=</code>' });
    expect(missingMany.gap).toBeGreaterThan(shortComplete.gap);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest dev-utils/wiki-audit/analyze/docquality.test.ts`
Expected: FAIL — cannot find module `./docquality.js`.

- [ ] **Step 3: Write the implementation**

Create `dev-utils/wiki-audit/analyze/docquality.ts`:

```ts
export type SizeTier = 'none' | 'stub' | 'thin' | 'adequate' | 'rich';

export interface DocScoreInput {
  /** The /doc page wikitext, or undefined when there is no doc. */
  doc: string | undefined;
  /** The template's own source, used to extract its real parameter set. */
  source: string;
  /** True when a Template:X/styles.css page exists for this template. */
  hasStylesPage: boolean;
}

export interface DocScore {
  hasDoc: boolean;
  sizeTier: SizeTier;
  hasTemplateData: boolean;
  hasHeader: boolean;
  /** True when there is no stylesheet, or there is one and the doc mentions it. */
  mentionsStyles: boolean;
  undocumentedParams: string[];
  /** Priority signal: higher means a bigger documentation gap. */
  gap: number;
}

const PARAM_RX = /\{\{\{\s*([^|{}]+?)\s*[|}]/g;

export function extractParameters(wikitext: string): string[] {
  const out = new Set<string>();
  for (const m of wikitext.matchAll(PARAM_RX)) out.add(m[1].trim());
  return [...out];
}

export function extractDocumentedParameters(doc: string): string[] {
  const out = new Set<string>();

  const td = doc.match(/<templatedata>([\s\S]*?)<\/templatedata>/i);
  if (td) {
    try {
      const parsed = JSON.parse(td[1]);
      for (const k of Object.keys(parsed?.params ?? {})) out.add(k);
    } catch {
      // Malformed TemplateData is itself a finding, not a crash.
    }
  }

  for (const m of doc.matchAll(/<code>\s*([A-Za-z0-9_-]+)\s*=/g)) out.add(m[1]);
  return [...out];
}

function tierOf(len: number): SizeTier {
  if (len === 0) return 'none';
  if (len < 200) return 'stub';
  if (len < 600) return 'thin';
  if (len < 2000) return 'adequate';
  return 'rich';
}

export function scoreDoc(input: DocScoreInput): DocScore {
  const doc = input.doc ?? '';
  const hasDoc = input.doc !== undefined && doc.length > 0;

  const actual = extractParameters(input.source);
  const documented = new Set(extractDocumentedParameters(doc));
  const undocumentedParams = actual.filter((p) => !documented.has(p));

  const mentionsStyles = !input.hasStylesPage || /styles\.css/i.test(doc);

  // Missing params dominate; a missing doc is a flat penalty; unmentioned
  // styles and a missing house header are small nudges.
  const gap =
    undocumentedParams.length * 10 +
    (hasDoc ? 0 : 25) +
    (mentionsStyles ? 0 : 5) +
    (hasDoc && !/\{\{Documentation\/Header\}\}/i.test(doc) ? 3 : 0);

  return {
    hasDoc,
    sizeTier: tierOf(doc.length),
    hasTemplateData: /<templatedata>/i.test(doc),
    hasHeader: /\{\{Documentation\/Header\}\}/i.test(doc),
    mentionsStyles,
    undocumentedParams,
    gap,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest dev-utils/wiki-audit/analyze/docquality.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dev-utils/wiki-audit/analyze/docquality.ts dev-utils/wiki-audit/analyze/docquality.test.ts
git commit -m "feat(wiki-audit): doc quality scoring driven by undocumented parameters

Byte length is recorded but does not drive priority; the gap score is
dominated by parameters the template accepts but the doc never explains."
```

---

### Task 8: Analyze — documentation plumbing findings

**Files:**
- Create: `dev-utils/wiki-audit/analyze/plumbing.ts`
- Test: `dev-utils/wiki-audit/analyze/plumbing.test.ts`

**Interfaces:**
- Consumes: `Manifest` (Task 1).
- Produces:
  - `type PlumbingKind = 'doc-redirect-circular' | 'doc-redirect-to-template' | 'doc-in-userspace' | 'doc-redirect-rename' | 'doc-on-redirect' | 'doc-subject-missing' | 'doc-shared' | 'double-redirect' | 'redirect-broken'`
  - `interface Finding { kind: PlumbingKind; title: string; detail: string }`
  - `findPlumbingIssues(m: Manifest): Finding[]`

- [ ] **Step 1: Write the failing test**

Create `dev-utils/wiki-audit/analyze/plumbing.test.ts`:

```ts
import { findPlumbingIssues } from './plumbing.js';
import type { Manifest } from '../lib/types.js';

function m(entries: any[]): Manifest {
  return { fetchedAt: '', apiUrl: '', entries };
}
const kinds = (f: any[]) => f.map((x) => x.kind);

describe('findPlumbingIssues', () => {
  test('flags a /doc redirecting to its own template as circular', () => {
    const f = findPlumbingIssues(m([
      { title: 'Template:Cclang', redirect: false },
      { title: 'Template:Cclang/doc', redirect: true, redirectTarget: 'Template:Cclang' },
    ]));
    expect(kinds(f)).toContain('doc-redirect-circular');
  });

  test('flags a /doc redirecting to a template that is not a doc', () => {
    const f = findPlumbingIssues(m([
      { title: 'Template:Tabs/doc', redirect: true, redirectTarget: 'Template:CustomTabs' },
      { title: 'Template:CustomTabs', redirect: false },
    ]));
    expect(kinds(f)).toContain('doc-redirect-to-template');
  });

  test('flags documentation living in userspace', () => {
    const f = findPlumbingIssues(m([
      { title: 'Template:SingerType2/doc', redirect: true, redirectTarget: 'User:Someone/Sandbox/old/doc' },
    ]));
    expect(kinds(f)).toContain('doc-in-userspace');
  });

  test('records deliberate doc-sharing as its own kind, not a fault', () => {
    const f = findPlumbingIssues(m([
      { title: 'Template:Singer/doc', redirect: true, redirectTarget: 'Template:Youtaite/doc' },
      { title: 'Template:Youtaite/doc', redirect: false },
    ]));
    expect(kinds(f)).toContain('doc-shared');
    expect(kinds(f)).not.toContain('doc-redirect-to-template');
  });

  test('flags a doc attached to a redirect page', () => {
    const f = findPlumbingIssues(m([
      { title: 'Template:Mbox', redirect: true, redirectTarget: 'Template:Ambox' },
      { title: 'Template:Mbox/doc', redirect: false },
      { title: 'Template:Ambox', redirect: false },
    ]));
    expect(kinds(f)).toContain('doc-on-redirect');
  });

  test('flags a doc whose subject page does not exist', () => {
    const f = findPlumbingIssues(m([{ title: 'Template:Main page/doc', redirect: false }]));
    expect(kinds(f)).toContain('doc-subject-missing');
  });

  test('flags a double redirect', () => {
    const f = findPlumbingIssues(m([
      { title: 'Template:A', redirect: true, redirectTarget: 'Template:B' },
      { title: 'Template:B', redirect: true, redirectTarget: 'Template:C' },
      { title: 'Template:C', redirect: false },
    ]));
    expect(kinds(f)).toContain('double-redirect');
  });

  test('flags a redirect whose target does not exist', () => {
    const f = findPlumbingIssues(m([{ title: 'Template:A', redirect: true, redirectTarget: 'Template:Gone' }]));
    expect(kinds(f)).toContain('redirect-broken');
  });

  test('returns nothing for a healthy wiki', () => {
    const f = findPlumbingIssues(m([
      { title: 'Template:Uptodate', redirect: false },
      { title: 'Template:Uptodate/doc', redirect: false },
    ]));
    expect(f).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest dev-utils/wiki-audit/analyze/plumbing.test.ts`
Expected: FAIL — cannot find module `./plumbing.js`.

- [ ] **Step 3: Write the implementation**

Create `dev-utils/wiki-audit/analyze/plumbing.ts`:

```ts
import type { Manifest } from '../lib/types.js';

export type PlumbingKind =
  | 'doc-redirect-circular'
  | 'doc-redirect-to-template'
  | 'doc-in-userspace'
  | 'doc-shared'
  | 'doc-on-redirect'
  | 'doc-subject-missing'
  | 'double-redirect'
  | 'redirect-broken';

export interface Finding {
  kind: PlumbingKind;
  title: string;
  detail: string;
}

const isDoc = (t: string) => t.endsWith('/doc');
const subjectOf = (t: string) => t.slice(0, -'/doc'.length);

export function findPlumbingIssues(m: Manifest): Finding[] {
  const out: Finding[] = [];
  const byTitle = new Map(m.entries.map((e) => [e.title, e]));

  for (const e of m.entries) {
    // A /doc page that is itself a redirect.
    if (isDoc(e.title) && e.redirect && e.redirectTarget) {
      const target = e.redirectTarget;
      if (target === subjectOf(e.title)) {
        out.push({ kind: 'doc-redirect-circular', title: e.title, detail: `redirects to its own subject ${target}` });
      } else if (/^User:/.test(target)) {
        out.push({ kind: 'doc-in-userspace', title: e.title, detail: `documentation lives at ${target}` });
      } else if (isDoc(target)) {
        out.push({ kind: 'doc-shared', title: e.title, detail: `shares documentation with ${target}` });
      } else {
        out.push({ kind: 'doc-redirect-to-template', title: e.title, detail: `points at ${target}, which is not a /doc page` });
      }
    }

    // A /doc attached to a page that is itself a redirect.
    if (isDoc(e.title) && !e.redirect) {
      const subject = byTitle.get(subjectOf(e.title));
      if (!subject) {
        out.push({ kind: 'doc-subject-missing', title: e.title, detail: `${subjectOf(e.title)} does not exist` });
      } else if (subject.redirect) {
        out.push({ kind: 'doc-on-redirect', title: e.title, detail: `${subject.title} is a redirect to ${subject.redirectTarget}` });
      }
    }

    // Redirect health.
    if (e.redirect && e.redirectTarget) {
      const target = byTitle.get(e.redirectTarget);
      if (!target) {
        if (/^(Template|Module):/.test(e.redirectTarget)) {
          out.push({ kind: 'redirect-broken', title: e.title, detail: `target ${e.redirectTarget} does not exist` });
        }
      } else if (target.redirect) {
        out.push({ kind: 'double-redirect', title: e.title, detail: `${e.redirectTarget} is itself a redirect to ${target.redirectTarget}` });
      }
    }
  }

  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest dev-utils/wiki-audit/analyze/plumbing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dev-utils/wiki-audit/analyze/plumbing.ts dev-utils/wiki-audit/analyze/plumbing.test.ts
git commit -m "feat(wiki-audit): documentation plumbing findings

Groups redirect and /doc problems by kind. Deliberate doc-sharing is
recorded as its own kind rather than reported as a fault."
```

---

### Task 9: Analyze orchestrator

**Files:**
- Create: `dev-utils/wiki-audit/analyze.ts`
- Test: `dev-utils/wiki-audit/analyze.test.ts`
- Modify: `package.json` (add the four scripts)

**Interfaces:**
- Consumes: everything from Tasks 1, 3, 6, 7, 8.
- Produces:
  - `interface AuditRow { title, ns, isRoot, tier, needsManualReview, transclusions, doc, provenance, isUpstream }`
  - `interface Audit { fetchedAt, coverage, rows, findings, provenanceSummary }`
  - `buildAudit(m: Manifest, contents: Map<string,string>, transclusions: Map<string,{count:number,capped:boolean,from:string[]}>, gadgetText: string): Audit`

- [ ] **Step 1: Write the failing test**

Create `dev-utils/wiki-audit/analyze.test.ts`:

```ts
import { buildAudit } from './analyze.js';
import type { Manifest } from './lib/types.js';

const empty = new Map<string, { count: number; capped: boolean; from: string[] }>();

function manifest(entries: any[]): Manifest {
  return { fetchedAt: '2026-08-30T00:00:00Z', apiUrl: '', entries };
}

describe('buildAudit', () => {
  test('computes coverage over real roots only, excluding redirects', () => {
    const m = manifest([
      { title: 'Template:A', ns: 10, redirect: false, model: 'wikitext', path: 'p1' },
      { title: 'Template:A/doc', ns: 10, redirect: false, model: 'wikitext', path: 'p2' },
      { title: 'Template:B', ns: 10, redirect: false, model: 'wikitext', path: 'p3' },
      { title: 'Template:C', ns: 10, redirect: true, redirectTarget: 'Template:A', model: 'wikitext', path: 'p4' },
    ]);
    const audit = buildAudit(m, new Map(), empty, '');
    expect(audit.coverage.template.roots).toBe(2);
    expect(audit.coverage.template.documented).toBe(1);
    expect(audit.coverage.template.missing).toBe(1);
  });

  test('splits the backlog by provenance', () => {
    const m = manifest([
      { title: 'Module:Native', ns: 828, redirect: false, model: 'Scribunto', path: 'a', firstRevision: { user: 'Ark', timestamp: '', comment: '', sourceWiki: '' } },
      { title: 'Module:Imported', ns: 828, redirect: false, model: 'Scribunto', path: 'b', firstRevision: { user: 'mw>X', timestamp: '', comment: '', sourceWiki: 'mw' } },
    ]);
    const audit = buildAudit(m, new Map(), empty, '');
    const undocumented = audit.rows.filter((r) => r.isRoot && !r.doc.hasDoc);
    expect(undocumented.filter((r) => r.isUpstream)).toHaveLength(1);
    expect(undocumented.filter((r) => !r.isUpstream)).toHaveLength(1);
  });

  test('a module required by another module is INTERNAL, not UNUSED', () => {
    const m = manifest([
      { title: 'Module:Yesno', ns: 828, redirect: false, model: 'Scribunto', path: 'a' },
      { title: 'Module:Caller', ns: 828, redirect: false, model: 'Scribunto', path: 'b' },
    ]);
    const contents = new Map([['Module:Caller', "require('Module:Yesno')"], ['Module:Yesno', 'return {}']]);
    const audit = buildAudit(m, contents, empty, '');
    expect(audit.rows.find((r) => r.title === 'Module:Yesno')!.tier).toBe('INTERNAL');
  });

  test('a template referenced only by a gadget is USED', () => {
    const m = manifest([{ title: 'Template:Uptodate', ns: 10, redirect: false, model: 'wikitext', path: 'a' }]);
    const audit = buildAudit(m, new Map(), empty, "api.edit('Template:Uptodate')");
    expect(audit.rows.find((r) => r.title === 'Template:Uptodate')!.tier).toBe('USED');
  });

  test('includes plumbing findings', () => {
    const m = manifest([
      { title: 'Template:X', ns: 10, redirect: false, model: 'wikitext', path: 'a' },
      { title: 'Template:X/doc', ns: 10, redirect: true, redirectTarget: 'Template:X', model: 'wikitext', path: 'b' },
    ]);
    expect(buildAudit(m, new Map(), empty, '').findings.map((f) => f.kind)).toContain('doc-redirect-circular');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest dev-utils/wiki-audit/analyze.test.ts`
Expected: FAIL — cannot find module `./analyze.js`.

- [ ] **Step 3: Write the implementation**

Create `dev-utils/wiki-audit/analyze.ts`:

```ts
import { readFile, writeFile, readdir } from 'fs/promises';
import { resolve, join } from 'path';
import { createClient, queryAll, chunk } from './lib/api.js';
import { resolveRedirects, extractRequires, extractGadgetRefs, classify } from './analyze/usage.js';
import type { UsageTier } from './analyze/usage.js';
import { scoreDoc } from './analyze/docquality.js';
import type { DocScore } from './analyze/docquality.js';
import { findPlumbingIssues, type Finding } from './analyze/plumbing.js';
import { describeSource, isUpstream } from './analyze/provenance.js';
import type { Manifest } from './lib/types.js';

export interface AuditRow {
  title: string;
  ns: 10 | 828;
  isRoot: boolean;
  tier: UsageTier;
  needsManualReview: boolean;
  transclusions: number;
  transclusionsCapped: boolean;
  doc: DocScore;
  provenance: string;
  isUpstream: boolean;
}

export interface Audit {
  fetchedAt: string;
  coverage: {
    template: { roots: number; documented: number; missing: number };
    module: { roots: number; documented: number; missing: number };
  };
  rows: AuditRow[];
  findings: Finding[];
  provenanceSummary: Record<string, number>;
}

const isRootTitle = (t: string) => !t.slice(t.indexOf(':') + 1).includes('/');

export function buildAudit(
  m: Manifest,
  contents: Map<string, string>,
  transclusions: Map<string, { count: number; capped: boolean; from: string[] }>,
  gadgetText: string,
): Audit {
  const byTitle = new Map(m.entries.map((e) => [e.title, e]));
  const canonical = resolveRedirects(m);

  // Reverse index: which modules require which.
  const requiredBy = new Map<string, string[]>();
  for (const e of m.entries) {
    if (e.model !== 'Scribunto') continue;
    for (const dep of extractRequires(contents.get(e.title) ?? '')) {
      const target = canonical.get(dep) ?? dep;
      if (!requiredBy.has(target)) requiredBy.set(target, []);
      requiredBy.get(target)!.push(e.title);
    }
  }

  const gadgetRefTargets = new Set(extractGadgetRefs(gadgetText).map((t) => canonical.get(t) ?? t));

  const rows: AuditRow[] = m.entries
    .filter((e) => !e.redirect)
    .map((e) => {
      const tr = transclusions.get(e.title) ?? { count: 0, capped: false, from: [] };
      const source = contents.get(e.title) ?? '';
      const doc = scoreDoc({
        doc: contents.get(`${e.title}/doc`),
        source,
        hasStylesPage: byTitle.has(`${e.title}/styles.css`),
      });
      const { tier, needsManualReview } = classify({
        transclusions: tr.count,
        transcludedFrom: tr.from,
        requiredBy: requiredBy.get(e.title) ?? [],
        gadgetRefs: gadgetRefTargets.has(e.title) ? ['gadget'] : [],
        dynamic: /\.\s*\.\s*|\bconcat\b/.test(source) && e.model === 'Scribunto',
      });
      return {
        title: e.title,
        ns: e.ns,
        isRoot: isRootTitle(e.title),
        tier,
        needsManualReview,
        transclusions: tr.count,
        transclusionsCapped: tr.capped,
        doc,
        provenance: describeSource(e.firstRevision?.sourceWiki ?? ''),
        isUpstream: isUpstream(e.firstRevision),
      };
    });

  function coverageFor(ns: 10 | 828) {
    const roots = rows.filter((r) => r.ns === ns && r.isRoot);
    const documented = roots.filter((r) => r.doc.hasDoc).length;
    return { roots: roots.length, documented, missing: roots.length - documented };
  }

  const provenanceSummary: Record<string, number> = {};
  for (const r of rows.filter((x) => x.isRoot)) {
    provenanceSummary[r.provenance] = (provenanceSummary[r.provenance] ?? 0) + 1;
  }

  return {
    fetchedAt: m.fetchedAt,
    coverage: { template: coverageFor(10), module: coverageFor(828) },
    rows,
    findings: findPlumbingIssues(m),
    provenanceSummary,
  };
}

async function loadContents(m: Manifest): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const e of m.entries) {
    try { out.set(e.title, await readFile(e.path, 'utf8')); } catch { /* absent */ }
  }
  return out;
}

async function loadGadgetText(dir: string): Promise<string> {
  let all = '';
  try {
    for (const f of await readdir(dir)) {
      if (/\.(js|css)$/.test(f)) all += await readFile(join(dir, f), 'utf8') + '\n';
    }
  } catch { /* snapshot absent — gadget edges simply unavailable */ }
  return all;
}

async function fetchTransclusions(apiUrl: string, titles: string[]) {
  const client = createClient(apiUrl, 'UtaiteWikiDocAudit/1.0 (read-only)');
  const out = new Map<string, { count: number; capped: boolean; from: string[] }>();
  for (const [i, batch] of chunk(titles, 50).entries()) {
    process.stdout.write(`\r  transclusions batch ${i + 1}`);
    const pages = await queryAll(
      client,
      { action: 'query', prop: 'transcludedin', titles: batch.join('|'), tilimit: '500' },
      (d) => d.query.pages ?? [],
    );
    for (const p of pages) {
      const from = (p.transcludedin ?? []).map((x: any) => x.title);
      const prev = out.get(p.title) ?? { count: 0, capped: false, from: [] };
      prev.from.push(...from);
      prev.count = prev.from.length;
      prev.capped = prev.count >= 500;
      out.set(p.title, prev);
    }
  }
  process.stdout.write('\n');
  return out;
}

if (import.meta.filename === process.argv[1]) {
  const root = resolve(import.meta.dirname, '../..');
  const manifest: Manifest = JSON.parse(await readFile(resolve(root, 'wiki/_manifest.json'), 'utf8'));
  const contents = await loadContents(manifest);
  const gadgetText = await loadGadgetText(resolve(root, 'live-snapshot.local'));
  const apiUrl = process.env.WIKI_API_URL;
  if (!apiUrl) throw new Error('WIKI_API_URL is not set');
  console.log('Fetching transclusion counts...');
  const transclusions = await fetchTransclusions(apiUrl, manifest.entries.filter((e) => !e.redirect).map((e) => e.title));
  const audit = buildAudit(manifest, contents, transclusions, gadgetText);
  await writeFile(resolve(root, 'wiki-audit.json'), JSON.stringify(audit, null, 2) + '\n', 'utf8');
  console.log(`Wrote wiki-audit.json — ${audit.rows.length} rows, ${audit.findings.length} findings.`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest dev-utils/wiki-audit/analyze.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the package scripts**

In `package.json`, add to `"scripts"`:

```json
    "wiki:fetch": "node --env-file=.env dev-utils/wiki-audit/fetch.ts",
    "wiki:analyze": "node --env-file=.env dev-utils/wiki-audit/analyze.ts",
    "wiki:report": "node dev-utils/wiki-audit/report.ts",
    "wiki:audit": "npm run wiki:fetch && npm run wiki:analyze && npm run wiki:report"
```

- [ ] **Step 6: Run the real analysis**

```bash
pnpm run wiki:analyze
```

Verify the spec's two spot-checks — these are the cases naive analysis gets wrong:

```bash
node -e "
const a=require('./wiki-audit.json');
const f=t=>a.rows.find(r=>r.title===t);
console.log('coverage', JSON.stringify(a.coverage));
console.log('Module:Yesno   ->', f('Module:Yesno')?.tier, '(expect USED or INTERNAL, never UNUSED)');
console.log('Template:Uptodate ->', f('Template:Uptodate')?.tier, '(expect USED)');
console.log('findings', a.findings.length);
"
```

Expected: template coverage roughly 483 roots / 377 documented; module roughly 83 / 38. `Module:Yesno` is not `UNUSED`. `Template:Uptodate` is `USED`.

- [ ] **Step 7: Commit**

```bash
git add dev-utils/wiki-audit/analyze.ts dev-utils/wiki-audit/analyze.test.ts package.json
git commit -m "feat(wiki-audit): analysis orchestrator and pipeline scripts"
git add wiki-audit.json
git commit -m "chore(wiki): add audit analysis output"
```

---

### Task 10: Report

**Files:**
- Create: `dev-utils/wiki-audit/report.ts`
- Test: `dev-utils/wiki-audit/report.test.ts`

**Interfaces:**
- Consumes: `Audit`, `AuditRow` (Task 9).
- Produces:
  - `rankPriority(rows: AuditRow[]): AuditRow[]`
  - `splitBacklog(rows: AuditRow[]): { write: AuditRow[]; source: AuditRow[] }`
  - `deletionCandidates(rows: AuditRow[]): AuditRow[]`
  - `renderReport(a: Audit): string`

**Before writing the HTML, load the `artifact-design` skill.** The page is published as an Artifact and the design pass is required, not optional.

- [ ] **Step 1: Write the failing test**

Create `dev-utils/wiki-audit/report.test.ts`:

```ts
import { rankPriority, splitBacklog, deletionCandidates, renderReport } from './report.js';
import type { AuditRow, Audit } from './analyze.js';

function row(over: Partial<AuditRow> = {}): AuditRow {
  return {
    title: 'Template:X', ns: 10, isRoot: true, tier: 'USED', needsManualReview: false,
    transclusions: 0, transclusionsCapped: false, provenance: 'written on this wiki', isUpstream: false,
    doc: { hasDoc: false, sizeTier: 'none', hasTemplateData: false, hasHeader: false, mentionsStyles: true, undocumentedParams: [], gap: 25 },
    ...over,
  };
}

describe('rankPriority — usage x doc-gap', () => {
  test('ranks a heavily used undocumented template above a rarely used one', () => {
    const ranked = rankPriority([
      row({ title: 'Template:Rare', transclusions: 1 }),
      row({ title: 'Template:Common', transclusions: 900 }),
    ]);
    expect(ranked[0].title).toBe('Template:Common');
  });

  test('ranks a bigger doc gap above a smaller one at equal usage', () => {
    const ranked = rankPriority([
      row({ title: 'Template:Small', transclusions: 10, doc: { ...row().doc, gap: 5 } }),
      row({ title: 'Template:Big', transclusions: 10, doc: { ...row().doc, gap: 80 } }),
    ]);
    expect(ranked[0].title).toBe('Template:Big');
  });

  test('excludes fully documented rows with no gap', () => {
    const ranked = rankPriority([row({ doc: { ...row().doc, hasDoc: true, gap: 0 } })]);
    expect(ranked).toHaveLength(0);
  });

  test('excludes non-root pages', () => {
    expect(rankPriority([row({ isRoot: false })])).toHaveLength(0);
  });
});

describe('splitBacklog — write vs source', () => {
  test('separates native from upstream', () => {
    const { write, source } = splitBacklog([
      row({ title: 'Module:Utaite', isUpstream: false }),
      row({ title: 'Module:Yesno', isUpstream: true }),
    ]);
    expect(write.map((r) => r.title)).toEqual(['Module:Utaite']);
    expect(source.map((r) => r.title)).toEqual(['Module:Yesno']);
  });
});

describe('deletionCandidates', () => {
  test('includes UNUSED and DOC-ONLY', () => {
    const got = deletionCandidates([
      row({ title: 'Template:Dead', tier: 'UNUSED' }),
      row({ title: 'Template:DocOnly', tier: 'DOC-ONLY' }),
    ]);
    expect(got.map((r) => r.title).sort()).toEqual(['Template:DocOnly', 'Template:Dead'].sort());
  });

  test('never includes INTERNAL, which is alive but invisible', () => {
    expect(deletionCandidates([row({ tier: 'INTERNAL' })])).toHaveLength(0);
  });

  test('never includes USED', () => {
    expect(deletionCandidates([row({ tier: 'USED' })])).toHaveLength(0);
  });

  test('sorts rows needing manual review last, so confident candidates lead', () => {
    const got = deletionCandidates([
      row({ title: 'Template:Unsure', tier: 'UNUSED', needsManualReview: true }),
      row({ title: 'Template:Confident', tier: 'UNUSED', needsManualReview: false }),
    ]);
    expect(got[0].title).toBe('Template:Confident');
  });
});

describe('renderReport', () => {
  const audit: Audit = {
    fetchedAt: '2026-08-30T00:00:00Z',
    coverage: { template: { roots: 483, documented: 377, missing: 106 }, module: { roots: 83, documented: 38, missing: 45 } },
    rows: [row({ title: 'Template:Dead', tier: 'UNUSED' })],
    findings: [{ kind: 'doc-redirect-circular', title: 'Template:X/doc', detail: 'circular' }],
    provenanceSummary: { 'written on this wiki': 19, 'mediawiki.org': 16 },
  };

  test('produces a complete standalone HTML document', () => {
    const html = renderReport(audit);
    expect(html).toContain('<title>');
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+href="http/);
  });

  test('shows the headline coverage numbers', () => {
    const html = renderReport(audit);
    expect(html).toContain('483');
    expect(html).toContain('106');
  });

  test('escapes titles so wiki markup cannot break the page', () => {
    const html = renderReport({ ...audit, rows: [row({ title: 'Template:<script>' })] });
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest dev-utils/wiki-audit/report.test.ts`
Expected: FAIL — cannot find module `./report.js`.

- [ ] **Step 3: Write the ranking and split logic**

Create `dev-utils/wiki-audit/report.ts` with the pure logic first:

```ts
import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';
import type { Audit, AuditRow } from './analyze.js';

/** Usage x doc-gap. Log-damped usage so the top of the curve does not swamp the gap term. */
export function rankPriority(rows: AuditRow[]): AuditRow[] {
  return rows
    .filter((r) => r.isRoot && r.doc.gap > 0)
    .map((r) => ({ r, score: Math.log10(r.transclusions + 1) * 10 + r.doc.gap }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.r);
}

export function splitBacklog(rows: AuditRow[]): { write: AuditRow[]; source: AuditRow[] } {
  return {
    write: rows.filter((r) => !r.isUpstream),
    source: rows.filter((r) => r.isUpstream),
  };
}

export function deletionCandidates(rows: AuditRow[]): AuditRow[] {
  return rows
    .filter((r) => r.tier === 'UNUSED' || r.tier === 'DOC-ONLY')
    .sort((a, b) => Number(a.needsManualReview) - Number(b.needsManualReview));
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
```

- [ ] **Step 4: Load the artifact-design skill, then write `renderReport`**

Invoke the `artifact-design` skill before writing any HTML. Then append `renderReport(a: Audit): string` to `report.ts`, returning one self-contained document with the six sections from the spec:

1. At a glance — four numbers only (template coverage, module coverage, deletion candidates, snapshot date)
2. Coverage — documented / thin / missing, split Template vs Module
3. Priority queue — `rankPriority` output, split by `splitBacklog` into "write" and "source" tables
4. Deletion candidates — `deletionCandidates` output with tier, evidence and a manual-review flag
5. Doc plumbing — `a.findings` grouped by `kind`, linking to `wiki/_redirects.tsv` rather than listing every redirect
6. Provenance summary — `a.provenanceSummary`

Colour rules from the spec, which the tests do not enforce and the implementer must honour:
- One hue plus a gradient within any single figure; magnitude is a ramp, not a palette.
- A second hue only for a genuinely different *kind* of thing (Template vs Module, broken vs missing), never to enumerate categories that differ only by label.
- One reserved accent for "needs attention"; red means broken, never "the fourth category".
- Theme-tokened for light and dark per the artifact-design guidance.
- Every title passed through `escapeHtml`.
- No external scripts, stylesheets or images — the page must be fully self-contained.

Add the CLI entry point at the end:

```ts
if (import.meta.filename === process.argv[1]) {
  const root = resolve(import.meta.dirname, '../..');
  const audit: Audit = JSON.parse(await readFile(resolve(root, 'wiki-audit.json'), 'utf8'));
  const out = resolve(root, 'wiki-audit-report.html');
  await writeFile(out, renderReport(audit), 'utf8');
  console.log(`Wrote ${out}`);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest dev-utils/wiki-audit/report.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full pipeline and check the report**

```bash
pnpm run wiki:report
```

Open `wiki-audit-report.html` and confirm: the four headline numbers match `wiki-audit.json`, the priority queue is split into write/source, no deletion candidate is tier `INTERNAL`, and the page renders in both light and dark.

- [ ] **Step 7: Run the whole suite**

Run: `pnpm run tests`
Expected: PASS, including the five pre-existing UptodateEditor test files.

- [ ] **Step 8: Publish as an Artifact and commit**

Publish `wiki-audit-report.html` with the Artifact tool (favicon `📊`), then:

```bash
git add dev-utils/wiki-audit/report.ts dev-utils/wiki-audit/report.test.ts
git commit -m "feat(wiki-audit): insight report

Priority queue split by provenance into work that must be authored and
work that can be sourced upstream. Deletion candidates carry evidence and
a manual-review flag; INTERNAL pages are never listed as candidates."
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: layout and read-only construction → Tasks 2, 4; path encoding hazards → Task 1; redirects derived to TSV → Task 4; provenance purpose, method and limits → Tasks 3, 5; usage graph with four edge sources → Tasks 6, 9; orphan tiers → Task 6; doc quality and parameter diffing → Task 7; plumbing findings → Task 8; the six report sections and colour rules → Task 10; the spec's two spot-checks (`Module:Yesno`, `Template:Uptodate`) → Task 9 Step 6; coverage totals reproducing ground truth → Task 9 Step 6.

**Deliberately deferred.** Wanted-templates (referenced but nonexistent) is specified in the design as a fourth edge source but is not implemented as its own task — it is a report-only signal with no consumer in the current pipeline. If the executing engineer wants it, it belongs in Task 8 as an additional `Finding` kind. Flagged rather than silently dropped.

**Type consistency.** `ManifestEntry`/`Manifest` (Task 1) are used unchanged in Tasks 4, 5, 6, 8, 9. `UsageTier` (Task 6) flows into `AuditRow` (Task 9) and `deletionCandidates` (Task 10). `DocScore` (Task 7) is the `doc` field of `AuditRow`. `Finding`/`PlumbingKind` (Task 8) are `Audit.findings`. `WikiQuery` (Task 2) is the injected dependency in Tasks 4, 5 and 9, which is what makes them testable without network.

**One known rough edge.** `buildAudit`'s `dynamic` heuristic (`/\.\s*\.\s*|\bconcat\b/` on Lua source) is crude and will over-flag `needsManualReview`. That direction is the safe one — it moves pages out of confident deletion rather than into it — but the executing engineer should expect noise there and may tighten it.
