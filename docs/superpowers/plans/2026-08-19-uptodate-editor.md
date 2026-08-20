# UptodateEditor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a button on the rendered `{{Uptodate}}` freshness box that opens a modal to safely edit the template's parameters, including a `force-uptodate` flag suggested by detecting singer inactivity from the infobox.

**Architecture:** Two `mw`-free pure modules (wikitext parser, status detector) carry all the hard logic and get full jest coverage. A thin `mw.Api` layer resolves which page holds the wikitext and saves it. A standalone modal (not the admin-gated shared `ModalBuilder`) renders the form. One entry file wires them together and injects the button.

**Tech Stack:** TypeScript → ES2018 JS (Vite + Rollup), LESS → CSS, jest + ts-jest + jsdom, MediaWiki `mw.Api`.

**Spec:** `docs/superpowers/specs/2026-08-19-uptodate-editor-design.md`

## Global Constraints

- Gadget folder is `src/gadgets/contents/UptodateEditor/` (section `contents`, per spec §6).
- Only `UptodateEditor.ts` and `UptodateEditor.less` are declared in `code:`. Helper modules are **imported**, not declared — rollup bundles them into the entry. Declaring them would emit separate wiki pages.
- **Import paths must use the `.js` extension** (`import { x } from './foo.js'`). tsconfig is `"module": "nodenext"`; jest maps `.js` → `.ts` via `moduleNameMapper`.
- **Never `@import` another gadget's LESS.** Commit `e05de9f` fixed a build break caused by exactly that. Re-declare the handful of `ModalBuilder.less` tokens locally instead.
- tsconfig has `noUnusedLocals: true`, `noUnusedParameters: true`, `noImplicitAny: true`, `strictNullChecks: true`, `strict: false`. Unused variables are build errors.
- Build target ES2018, unminified. Build with `node node_modules/vite/bin/vite.js build` — `pnpm run build` fails because `pnpm-workspace.yaml` holds literal `set this to true or false` placeholders (roadmap Phase 0, out of scope).
- Run tests with `npx jest <path>`. Two ts-jest deprecation warnings are pre-existing and expected; ignore them.
- **Never run `pnpm run sync`.** Nothing is pushed to prod by this work.
- Dark mode selector used across this codebase is `.skin-theme-clientpref-night`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/gadgets/contents/UptodateEditor/uptodate-params.ts` | Brace-aware locate / parse / surgical re-serialize of `{{Uptodate\|…}}`. Pure. |
| `src/gadgets/contents/UptodateEditor/uptodate-params.test.ts` | Round-trip and edit tests. |
| `src/gadgets/contents/UptodateEditor/status-detect.ts` | Infobox `status` free text → activity + confidence. Pure. |
| `src/gadgets/contents/UptodateEditor/status-detect.test.ts` | Detection tests across the real corpus. |
| `src/gadgets/contents/UptodateEditor/page-target.ts` | Resolve edit/root page (pure) + fetch/save via an injected api. |
| `src/gadgets/contents/UptodateEditor/page-target.test.ts` | Resolution + stubbed-api tests. |
| `src/gadgets/contents/UptodateEditor/uptodate-modal.ts` | Standalone modal DOM and form state. |
| `src/gadgets/contents/UptodateEditor/UptodateEditor.ts` | Entry: gate, button injection, wiring. |
| `src/gadgets/contents/UptodateEditor/UptodateEditor.less` | Button + modal styling. |
| `src/gadgets/gadgets-definition.yaml` | Register the gadget. |

---

## Task 1: Wikitext parameter parser

**Files:**
- Create: `src/gadgets/contents/UptodateEditor/uptodate-params.ts`
- Test: `src/gadgets/contents/UptodateEditor/uptodate-params.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `normalizeTemplateName(name: string): string`, `splitTopLevel(body: string): string[]`, `findTemplateCall(wikitext: string, names: string[]): TemplateCall | null`, `findUptodateCall(wikitext: string): TemplateCall | null`, `applyEdits(wikitext: string, edits: UptodateEdits): string | null`, and the types `UptodateParam`, `TemplateCall`, `UptodateEdits`.

- [ ] **Step 1: Write the failing test**

Create `src/gadgets/contents/UptodateEditor/uptodate-params.test.ts`:

```typescript
import {
  normalizeTemplateName,
  findUptodateCall,
  applyEdits
} from './uptodate-params.js';

// Real shapes surveyed from live /Songs pages (spec §4).
const LIVE_SHAPES = [
  '{{Uptodate|February 6, 2026}}',
  '{{uptodate|February 6, 2026}}',
  '{{Uptodate|October 31, 2023|||bordercolor=#A97A3F}}',
  '{{Uptodate|March 3, 2024|nocat=true}}',
  '{{Uptodate|May 1, 2022|||12:30|nocat=true}}',
  '{{Uptodate|May 1, 2022|||12:30|bordercolor=#fff|nocat=true}}',
  '{{Uptodate|June 9, 2021|bordercolor=#abcdef|utdcolor=#000}}',
  '{{Uptodate | July 4, 2020 | bordercolor = #123456 }}',
  '{{Uptodate|August 2, 2019|discography=yes}}',
  '{{Uptodate|2021-05-04}}',
  '{{Uptodate|2021年5月4日}}'
];

describe('normalizeTemplateName', () => {
  test('uppercases only the first character', () => {
    expect(normalizeTemplateName('uptodate')).toBe('Uptodate');
    expect(normalizeTemplateName('Uptodate')).toBe('Uptodate');
  });

  test('does not fold interior case', () => {
    expect(normalizeTemplateName('UpToDate')).toBe('UpToDate');
  });

  test('treats underscores as spaces and trims', () => {
    expect(normalizeTemplateName('  status_templates ')).toBe('Status templates');
  });

  test('strips a Template: prefix and leading colon', () => {
    expect(normalizeTemplateName(':Template:uptodate')).toBe('Uptodate');
  });
});

describe('findUptodateCall', () => {
  test('finds a bare call', () => {
    const call = findUptodateCall('{{Uptodate|February 6, 2026}}');
    expect(call).not.toBeNull();
    expect(call!.params).toHaveLength(1);
    expect(call!.params[0].index).toBe(1);
    expect(call!.params[0].value).toBe('February 6, 2026');
  });

  test('matches a lowercase first character', () => {
    expect(findUptodateCall('{{uptodate|X}}')).not.toBeNull();
  });

  test('does not match Uptodate/sync', () => {
    expect(findUptodateCall('{{Uptodate/sync}}')).toBeNull();
  });

  test('does not match the legacy Outdated template', () => {
    expect(findUptodateCall('{{Outdated|May 1, 2020}}')).toBeNull();
  });

  test('does not match an interior case variant', () => {
    expect(findUptodateCall('{{UpToDate|X}}')).toBeNull();
  });

  test('separates positional from named parameters', () => {
    const call = findUptodateCall('{{Uptodate|D|||12:30|bordercolor=#fff|nocat=true}}')!;
    const positional = call.params.filter(p => p.index !== null);
    const named = call.params.filter(p => p.name !== null);
    expect(positional.map(p => p.index)).toEqual([1, 2, 3, 4]);
    expect(named.map(p => p.name)).toEqual(['bordercolor', 'nocat']);
    expect(named[1].value).toBe('true');
  });

  test('does not split on a pipe nested inside a template', () => {
    const call = findUptodateCall('{{Uptodate|{{#if:x|a|b}}|nocat=true}}')!;
    expect(call.params).toHaveLength(2);
    expect(call.params[0].value).toBe('{{#if:x|a|b}}');
  });

  test('does not split on a pipe nested inside a wikilink', () => {
    const call = findUptodateCall('{{Uptodate|D|reason=see [[A|B]] please}}')!;
    expect(call.params).toHaveLength(2);
    expect(call.params[1].value).toBe('see [[A|B]] please');
  });

  test('does not split on a pipe inside an HTML comment', () => {
    const call = findUptodateCall('{{Uptodate|D<!-- a|b -->|nocat=true}}')!;
    expect(call.params).toHaveLength(2);
  });

  test('reports offsets that bound the call', () => {
    const text = 'lead\n{{Uptodate|D}}\ntail';
    const call = findUptodateCall(text)!;
    expect(text.slice(call.start, call.end)).toBe('{{Uptodate|D}}');
  });
});

describe('applyEdits round-trip', () => {
  test.each(LIVE_SHAPES)('no-op edit is byte-identical: %s', (shape) => {
    expect(applyEdits(shape, {})).toBe(shape);
  });

  test('returns null when there is no call', () => {
    expect(applyEdits('no template here', { date: 'X' })).toBeNull();
  });
});

describe('applyEdits mutations', () => {
  test('replaces the date in place', () => {
    expect(applyEdits('{{Uptodate|February 6, 2026}}', { date: 'March 1, 2026' }))
      .toBe('{{Uptodate|March 1, 2026}}');
  });

  test('preserves legacy empty positionals when editing the date', () => {
    expect(applyEdits('{{Uptodate|Old|||12:30|nocat=true}}', { date: 'New' }))
      .toBe('{{Uptodate|New|||12:30|nocat=true}}');
  });

  test('preserves the dead utdcolor parameter', () => {
    const input = '{{Uptodate|Old|bordercolor=#abcdef|utdcolor=#000}}';
    expect(applyEdits(input, { date: 'New' }))
      .toBe('{{Uptodate|New|bordercolor=#abcdef|utdcolor=#000}}');
  });

  test('preserves whitespace around a replaced named value', () => {
    expect(applyEdits('{{Uptodate | D | bordercolor = #123456 }}', { bordercolor: '#ffffff' }))
      .toBe('{{Uptodate | D | bordercolor = #ffffff }}');
  });

  test('appends a named parameter that is not present', () => {
    expect(applyEdits('{{Uptodate|D}}', { 'force-uptodate': 'yes' }))
      .toBe('{{Uptodate|D|force-uptodate=yes}}');
  });

  test('updates an existing named parameter rather than appending', () => {
    expect(applyEdits('{{Uptodate|D|nocat=true}}', { nocat: 'false' }))
      .toBe('{{Uptodate|D|nocat=false}}');
  });

  test('removes a named parameter when the edit value is null', () => {
    expect(applyEdits('{{Uptodate|D|force-uptodate=yes|nocat=true}}', { 'force-uptodate': null }))
      .toBe('{{Uptodate|D|nocat=true}}');
  });

  test('removing an absent parameter is a no-op', () => {
    expect(applyEdits('{{Uptodate|D}}', { 'force-uptodate': null }))
      .toBe('{{Uptodate|D}}');
  });

  test('prefers a named updated-at over positional 1 for the date', () => {
    expect(applyEdits('{{Uptodate|updated-at=Old|nocat=true}}', { date: 'New' }))
      .toBe('{{Uptodate|updated-at=New|nocat=true}}');
  });

  test('edits only the call, leaving surrounding wikitext untouched', () => {
    const input = '{{Uptodate|Old}}\n== Songs ==\ntext';
    expect(applyEdits(input, { date: 'New' }))
      .toBe('{{Uptodate|New}}\n== Songs ==\ntext');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/gadgets/contents/UptodateEditor/uptodate-params.test.ts`
Expected: FAIL — `Cannot find module './uptodate-params.js'`

- [ ] **Step 3: Write the implementation**

Create `src/gadgets/contents/UptodateEditor/uptodate-params.ts`:

```typescript
/**
 * Brace-aware parsing and surgical re-serialization of {{Uptodate|...}} calls.
 *
 * The on-wiki Lua uses `{{%s*[Uu]ptodate%s*|([^}]*)}}`, which breaks on any
 * nested {{...}}. This module scans with a depth counter instead, so nested
 * templates, [[links]] and HTML comments inside values survive intact.
 *
 * Pure: no `mw` dependency, unit-tested without a wiki.
 */

export interface UptodateParam {
    /** Raw slice between pipes, including original surrounding whitespace. */
    raw: string;
    /** Trimmed parameter name; null for positional parameters. */
    name: string | null;
    /** 1-based positional index; null for named parameters. */
    index: number | null;
    /** Trimmed parameter value. */
    value: string;
}

export interface TemplateCall {
    /** Offset of the opening '{{' in the source wikitext. */
    start: number;
    /** Offset just past the closing '}}'. */
    end: number;
    /**
     * The name slice exactly as written, INCLUDING original surrounding
     * whitespace. Kept untrimmed so that re-serializing
     * `{{Uptodate | date }}` preserves the space before the first pipe.
     */
    rawName: string;
    params: UptodateParam[];
}

/**
 * Edits to apply. A string value sets the parameter; `null` removes it;
 * an absent key leaves the parameter untouched.
 *
 * `date` is special: it targets the named `updated-at` parameter when one
 * exists, otherwise positional 1.
 */
export interface UptodateEdits {
    date?: string;
    'force-uptodate'?: string | null;
    'force-outdated'?: string | null;
    reason?: string | null;
    discography?: string | null;
    needrom?: string | null;
    nocat?: string | null;
    bordercolor?: string | null;
}

const TARGET_NAME = 'Uptodate';
const DATE_ALIAS = 'updated-at';

/**
 * Applies MediaWiki title normalization: underscores become spaces, the name
 * is trimmed and internally collapsed, an optional leading colon and
 * `Template:` prefix are stripped, and only the FIRST character is
 * case-folded. Interior case is significant, so `UpToDate` != `Uptodate`.
 */
export function normalizeTemplateName(name: string): string {
    let n = name.replace(/_/g, ' ').trim().replace(/\s+/g, ' ');
    n = n.replace(/^:\s*/, '');
    n = n.replace(/^[Tt]emplate\s*:\s*/, '');
    if (n.length === 0) return n;
    return n.charAt(0).toUpperCase() + n.slice(1);
}

/** Index of the first top-level '=' in a raw parameter slice, or -1. */
function indexOfTopLevelEquals(raw: string): number {
    let depth = 0;
    for (let i = 0; i < raw.length; i++) {
        if (raw.startsWith('<!--', i)) {
            const close = raw.indexOf('-->', i);
            i = close === -1 ? raw.length : close + 2;
            continue;
        }
        const two = raw.substr(i, 2);
        if (two === '{{' || two === '[[') { depth++; i++; continue; }
        if (two === '}}' || two === ']]') { depth--; i++; continue; }
        if (raw[i] === '=' && depth <= 0) return i;
    }
    return -1;
}

/** Splits a template body on top-level pipes, preserving raw slices. */
export function splitTopLevel(body: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let buf = '';
    for (let i = 0; i < body.length; i++) {
        if (body.startsWith('<!--', i)) {
            const close = body.indexOf('-->', i);
            const end = close === -1 ? body.length : close + 3;
            buf += body.slice(i, end);
            i = end - 1;
            continue;
        }
        const two = body.substr(i, 2);
        if (two === '{{' || two === '[[') { depth++; buf += two; i++; continue; }
        if (two === '}}' || two === ']]') { depth--; buf += two; i++; continue; }
        if (body[i] === '|' && depth <= 0) { out.push(buf); buf = ''; continue; }
        buf += body[i];
    }
    out.push(buf);
    return out;
}

/** Offset just past the '}}' closing the '{{' at `start`, or -1. */
function findMatchingClose(text: string, start: number): number {
    let depth = 0;
    for (let i = start; i < text.length; i++) {
        if (text.startsWith('<!--', i)) {
            const close = text.indexOf('-->', i);
            i = close === -1 ? text.length : close + 2;
            continue;
        }
        const two = text.substr(i, 2);
        if (two === '{{') { depth++; i++; continue; }
        if (two === '}}') { depth--; i++; if (depth === 0) return i + 1; continue; }
    }
    return -1;
}

function parseParams(slices: string[]): UptodateParam[] {
    const params: UptodateParam[] = [];
    let positional = 0;
    for (const raw of slices) {
        const eq = indexOfTopLevelEquals(raw);
        if (eq === -1) {
            positional++;
            params.push({ raw, name: null, index: positional, value: raw.trim() });
        } else {
            params.push({
                raw,
                name: raw.slice(0, eq).trim(),
                index: null,
                value: raw.slice(eq + 1).trim()
            });
        }
    }
    return params;
}

/**
 * Locates the first transclusion of any template in `names`. Names are compared
 * after normalization, so the first character is case-insensitive but interior
 * case is significant.
 *
 * Shared by the Uptodate parser and the infobox status reader — one scanner,
 * one set of brace-handling bugs to get right.
 */
export function findTemplateCall(wikitext: string, names: string[]): TemplateCall | null {
    for (let i = 0; i < wikitext.length - 1; i++) {
        if (wikitext.substr(i, 2) !== '{{') continue;
        const end = findMatchingClose(wikitext, i);
        if (end === -1) continue;

        const inner = wikitext.slice(i + 2, end - 2);
        const slices = splitTopLevel(inner);
        const rawName = slices[0];

        if (names.indexOf(normalizeTemplateName(rawName)) === -1) continue;

        return {
            start: i,
            end,
            // Untrimmed on purpose — see TemplateCall.rawName.
            rawName: rawName,
            params: parseParams(slices.slice(1))
        };
    }
    return null;
}

/**
 * Locates the first `{{Uptodate|...}}` call. Deliberately does NOT match
 * `{{Uptodate/sync}}` (a different template) or the legacy `{{Outdated}}`.
 */
export function findUptodateCall(wikitext: string): TemplateCall | null {
    return findTemplateCall(wikitext, [TARGET_NAME]);
}

/** Replaces a raw slice's value while preserving its original whitespace. */
function replaceValueInRaw(raw: string, newValue: string): string {
    const eq = indexOfTopLevelEquals(raw);
    const head = eq === -1 ? '' : raw.slice(0, eq + 1);
    const tail = eq === -1 ? raw : raw.slice(eq + 1);
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(tail);
    if (!m) return head + newValue;
    return head + m[1] + newValue + m[3];
}

function serialize(rawName: string, params: UptodateParam[]): string {
    const body = params.map(p => p.raw).join('|');
    return '{{' + rawName + (params.length ? '|' + body : '') + '}}';
}

/**
 * Applies `edits` to the first {{Uptodate}} call in `wikitext`.
 *
 * Untouched parameters are re-emitted byte-identically in their original
 * order, so legacy cruft (empty positionals, the dead `utdcolor=`) survives.
 * Returns null when no call is present.
 */
export function applyEdits(wikitext: string, edits: UptodateEdits): string | null {
    const call = findUptodateCall(wikitext);
    if (!call) return null;

    const params = call.params.map(p => ({ ...p }));

    const setNamed = (name: string, value: string | null): void => {
        const idx = params.findIndex(p => p.name === name);
        if (value === null) {
            if (idx !== -1) params.splice(idx, 1);
            return;
        }
        if (idx === -1) {
            params.push({ raw: name + '=' + value, name, index: null, value });
        } else {
            params[idx].raw = replaceValueInRaw(params[idx].raw, value);
            params[idx].value = value;
        }
    };

    for (const key of Object.keys(edits) as Array<keyof UptodateEdits>) {
        const value = edits[key];
        if (value === undefined) continue;

        if (key === 'date') {
            const dateValue = value as string;
            const alias = params.findIndex(p => p.name === DATE_ALIAS);
            if (alias !== -1) {
                params[alias].raw = replaceValueInRaw(params[alias].raw, dateValue);
                params[alias].value = dateValue;
                continue;
            }
            const first = params.findIndex(p => p.index === 1);
            if (first !== -1) {
                params[first].raw = replaceValueInRaw(params[first].raw, dateValue);
                params[first].value = dateValue;
            } else {
                params.unshift({ raw: dateValue, name: null, index: 1, value: dateValue });
            }
            continue;
        }

        setNamed(key, value);
    }

    return wikitext.slice(0, call.start)
        + serialize(call.rawName, params)
        + wikitext.slice(call.end);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/gadgets/contents/UptodateEditor/uptodate-params.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/gadgets/contents/UptodateEditor/uptodate-params.ts src/gadgets/contents/UptodateEditor/uptodate-params.test.ts
git commit -m "feat(UptodateEditor): brace-aware surgical parser for {{Uptodate}} params"
```

---

## Task 2: Status detection

**Files:**
- Create: `src/gadgets/contents/UptodateEditor/status-detect.ts`
- Test: `src/gadgets/contents/UptodateEditor/status-detect.test.ts`

**Interfaces:**
- Consumes: `findTemplateCall`, `normalizeTemplateName` from `./uptodate-params.js` (Task 1).
- Produces: `extractStatusParam(wikitext: string): string | null`, `detectStatus(wikitext: string): StatusDetection`, and the types `Activity`, `Confidence`, `StatusDetection`.

- [ ] **Step 1: Write the failing test**

Create `src/gadgets/contents/UptodateEditor/status-detect.test.ts`:

```typescript
import { extractStatusParam, detectStatus } from './status-detect.js';

const infobox = (status: string, name = 'Utaite'): string =>
  `{{${name}\n|officialjapname=OO\n|gender=male\n|status=${status}\n|years=2010-\n}}\n\nBody text.`;

describe('extractStatusParam', () => {
  test('reads status from {{Utaite}}', () => {
    expect(extractStatusParam(infobox('{{Active}}'))).toBe('{{Active}}');
  });

  test('reads status from {{Youtaite}}', () => {
    expect(extractStatusParam(infobox('{{Inactive}}', 'Youtaite'))).toBe('{{Inactive}}');
  });

  test('reads status from {{Singer}}, the Youtaite redirect', () => {
    expect(extractStatusParam(infobox('{{Active}}', 'Singer'))).toBe('{{Active}}');
  });

  test('matches a lowercase template first character', () => {
    expect(extractStatusParam(infobox('{{Active}}', 'utaite'))).toBe('{{Active}}');
  });

  test('keeps a multi-line status value intact', () => {
    const raw = extractStatusParam(infobox('{{Graduated}} as Utaite<br/>\n{{Active}} as pro'));
    expect(raw).toBe('{{Graduated}} as Utaite<br/>\n{{Active}} as pro');
  });

  test('returns null when there is no status parameter', () => {
    expect(extractStatusParam('{{Utaite\n|gender=male\n}}')).toBeNull();
  });

  test('returns null when there is no infobox', () => {
    expect(extractStatusParam('Just prose.')).toBeNull();
  });
});

describe('detectStatus — confident template cases', () => {
  test('single {{Active}} does not suggest pinning', () => {
    const d = detectStatus(infobox('{{Active}}'));
    expect(d.activity).toBe('active');
    expect(d.confidence).toBe('confident');
    expect(d.suggestPin).toBe(false);
  });

  test('single {{Inactive}} suggests pinning', () => {
    const d = detectStatus(infobox('{{Inactive}}'));
    expect(d.activity).toBe('inactive');
    expect(d.confidence).toBe('confident');
    expect(d.suggestPin).toBe(true);
  });

  test('single {{Graduated}} suggests pinning', () => {
    const d = detectStatus(infobox('{{Graduated}}'));
    expect(d.activity).toBe('graduated');
    expect(d.suggestPin).toBe(true);
  });

  test('{{Hiatus}} is confident but does NOT suggest pinning', () => {
    const d = detectStatus(infobox('{{Hiatus}}'));
    expect(d.activity).toBe('hiatus');
    expect(d.confidence).toBe('confident');
    expect(d.suggestPin).toBe(false);
  });

  test('ignores {{cite}} noise alongside a status template', () => {
    const d = detectStatus(infobox('{{Inactive}}{{cite}}'));
    expect(d.activity).toBe('inactive');
    expect(d.confidence).toBe('confident');
  });

  test('ignores a <ref> alongside a status template', () => {
    const d = detectStatus(infobox('{{Inactive}}<ref>[https://x.example y]</ref>'));
    expect(d.activity).toBe('inactive');
    expect(d.confidence).toBe('confident');
  });
});

describe('detectStatus — multi-template cases', () => {
  test('mixed active and inactive is ambiguous', () => {
    const d = detectStatus(infobox('{{Graduated}} as Utaite<br/>{{Active}} as pro singer'));
    expect(d.confidence).toBe('ambiguous');
    expect(d.suggestPin).toBe(false);
    expect(d.raw).toContain('{{Graduated}}');
  });

  test('several inactive-ish templates stay confident', () => {
    const d = detectStatus(infobox('{{Graduated}} and {{Inactive}}'));
    expect(d.confidence).toBe('confident');
    expect(d.suggestPin).toBe(true);
  });
});

describe('detectStatus — bare text', () => {
  test.each([
    ['Active', 'active', false],
    ['Inactive', 'inactive', true],
    ['inactive', 'inactive', true],
    ['Deceased', 'deceased', true],
    ['Retired', 'retired', true],
    ['Graduated', 'graduated', true],
    ['Hiatus', 'hiatus', false]
  ])('recognises %s', (text, activity, pin) => {
    const d = detectStatus(infobox(text));
    expect(d.activity).toBe(activity);
    expect(d.confidence).toBe('confident');
    expect(d.suggestPin).toBe(pin);
  });
});

describe('detectStatus — the unreadable tail', () => {
  test.each([
    'Semi-active',
    'Active (on hiatus)',
    'Inctive',
    'active occasionally',
    'Revived'
  ])('%s is unknown and never pins', (text) => {
    const d = detectStatus(infobox(text));
    expect(d.confidence).toBe('unknown');
    expect(d.suggestPin).toBe(false);
    expect(d.raw).toBe(text);
  });

  test('a missing status parameter is unknown with null raw', () => {
    const d = detectStatus('{{Utaite\n|gender=male\n}}');
    expect(d.confidence).toBe('unknown');
    expect(d.raw).toBeNull();
    expect(d.suggestPin).toBe(false);
  });

  test('every result carries non-empty evidence text', () => {
    for (const text of ['{{Active}}', 'Semi-active', '{{Graduated}} and {{Active}}']) {
      expect(detectStatus(infobox(text)).evidence.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/gadgets/contents/UptodateEditor/status-detect.test.ts`
Expected: FAIL — `Cannot find module './status-detect.js'`

- [ ] **Step 3: Write the implementation**

Create `src/gadgets/contents/UptodateEditor/status-detect.ts`:

```typescript
/**
 * Detects whether a singer is still active, by reading the free-text `status`
 * parameter of the {{Utaite}} / {{Youtaite}} / {{Singer}} infobox.
 *
 * `status` is genuinely free text. Roughly 94% of live articles resolve
 * cleanly; the remainder are reported as `unknown` so the editor decides,
 * rather than being guessed at.
 *
 * Pure: no `mw` dependency.
 */

import { findTemplateCall, normalizeTemplateName } from './uptodate-params.js';

export type Activity =
    | 'active' | 'inactive' | 'hiatus'
    | 'graduated' | 'deceased' | 'retired' | 'unknown';

export type Confidence = 'confident' | 'ambiguous' | 'unknown';

export interface StatusDetection {
    activity: Activity;
    confidence: Confidence;
    /** Human-readable justification, shown in the modal. */
    evidence: string;
    /** The status value verbatim, or null when absent. */
    raw: string | null;
    /** Whether the force-uptodate checkbox should be pre-ticked. */
    suggestPin: boolean;
}

/** Infobox templates carrying a `status` parameter. {{Singer}} redirects to {{Youtaite}}. */
const INFOBOXES = ['Utaite', 'Youtaite', 'Singer'];

/** Members of Category:Status Templates. */
const STATUS_TEMPLATES: Record<string, Activity> = {
    Active: 'active',
    Inactive: 'inactive',
    Hiatus: 'hiatus',
    Graduated: 'graduated'
};

/** Bare-text values recognised without a template. */
const LEXICON: Record<string, Activity> = {
    active: 'active',
    inactive: 'inactive',
    hiatus: 'hiatus',
    graduated: 'graduated',
    deceased: 'deceased',
    retired: 'retired'
};

/**
 * Activities meaning the song list is complete and will not grow.
 * `hiatus` is deliberately absent: a hiatus is temporary, so the list may
 * still receive updates and must not be pinned as fresh.
 */
const INACTIVE_ISH: Activity[] = ['inactive', 'graduated', 'deceased', 'retired'];

/**
 * Reads the raw `status` value out of an infobox transclusion, reusing the
 * shared brace-aware scanner so nested templates and multi-line values survive.
 */
export function extractStatusParam(wikitext: string): string | null {
    const call = findTemplateCall(wikitext, INFOBOXES);
    if (!call) return null;

    const status = call.params.filter(
        p => p.name !== null && p.name.toLowerCase() === 'status'
    )[0];

    return status ? status.value : null;
}

/** Removes refs, comments and citation noise before interpretation. */
function clean(value: string): string {
    return value
        .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
        .replace(/<ref[^>]*\/>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\{\{\s*[Cc]ite[^}]*\}\}/g, '')
        .trim();
}

/** Names of status templates transcluded in the value, in order. */
function statusTemplatesIn(value: string): Activity[] {
    const found: Activity[] = [];
    const re = /\{\{\s*([^|}]+?)\s*(?:\||\}\})/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(value)) !== null) {
        const activity = STATUS_TEMPLATES[normalizeTemplateName(m[1])];
        if (activity) found.push(activity);
    }
    return found;
}

function result(
    activity: Activity,
    confidence: Confidence,
    evidence: string,
    raw: string | null
): StatusDetection {
    return {
        activity,
        confidence,
        evidence,
        raw,
        suggestPin: confidence === 'confident' && INACTIVE_ISH.indexOf(activity) !== -1
    };
}

/** Classifies the singer's activity from the article wikitext. */
export function detectStatus(wikitext: string): StatusDetection {
    const raw = extractStatusParam(wikitext);
    if (raw === null) {
        return result('unknown', 'unknown', 'No status parameter found in the infobox.', null);
    }

    const value = clean(raw);
    const templates = statusTemplatesIn(value);

    if (templates.length === 1) {
        return result(
            templates[0],
            'confident',
            'Infobox status is {{' + capitalize(templates[0]) + '}}.',
            raw
        );
    }

    if (templates.length > 1) {
        const allInactive = templates.every(t => INACTIVE_ISH.indexOf(t) !== -1);
        if (allInactive) {
            return result(
                templates[0],
                'confident',
                'Infobox status lists only inactive states: ' + templates.join(', ') + '.',
                raw
            );
        }
        return result(
            'unknown',
            'ambiguous',
            'Infobox status mixes several states (' + templates.join(', ')
                + '), so activity cannot be determined automatically.',
            raw
        );
    }

    const bare = LEXICON[value.toLowerCase()];
    if (bare) {
        return result(bare, 'confident', 'Infobox status reads "' + value + '".', raw);
    }

    return result(
        'unknown',
        'unknown',
        'Infobox status is free text that could not be interpreted.',
        raw
    );
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/gadgets/contents/UptodateEditor/status-detect.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/gadgets/contents/UptodateEditor/status-detect.ts src/gadgets/contents/UptodateEditor/status-detect.test.ts
git commit -m "feat(UptodateEditor): detect singer activity from free-text infobox status"
```

---

## Task 3: Page targeting and wiki I/O

**Files:**
- Create: `src/gadgets/contents/UptodateEditor/page-target.ts`
- Test: `src/gadgets/contents/UptodateEditor/page-target.test.ts`

**Interfaces:**
- Consumes: `findUptodateCall` from `./uptodate-params.js` (Task 1).
- Produces: `resolveTarget(pageName: string, wikitext: string): PageTarget`, `formatJstDate(now: Date): string`, `fetchPage(api: WikiApi, title: string): Promise<FetchedPage | null>`, `savePage(api: WikiApi, page: FetchedPage, text: string, summary: string): Promise<void>`, and the types `PageTarget`, `FetchedPage`, `WikiApi`.

`WikiApi` is a narrow local interface (`get`, `postWithToken`) rather than the global `mw.Api` type, so tests can stub it with a plain object.

- [ ] **Step 1: Write the failing test**

Create `src/gadgets/contents/UptodateEditor/page-target.test.ts`:

```typescript
import { resolveTarget, formatJstDate, fetchPage, savePage } from './page-target.js';
import type { WikiApi, FetchedPage } from './page-target.js';

describe('resolveTarget', () => {
  test('a /Songs subpage edits itself and points at its root', () => {
    const t = resolveTarget('Kogeinu/Songs', '{{Uptodate|October 31, 2023}}');
    expect(t.editTitle).toBe('Kogeinu/Songs');
    expect(t.rootTitle).toBe('Kogeinu');
  });

  test('an article using {{Uptodate/sync}} edits the /Songs subpage', () => {
    const t = resolveTarget('Kogeinu', '{{Uptodate/sync}}\n{{Utaite\n|status={{Inactive}}\n}}');
    expect(t.editTitle).toBe('Kogeinu/Songs');
    expect(t.rootTitle).toBe('Kogeinu');
  });

  test('an article with a direct call edits itself', () => {
    const t = resolveTarget('Kogeinu', '{{Uptodate|October 31, 2023}}');
    expect(t.editTitle).toBe('Kogeinu');
    expect(t.rootTitle).toBe('Kogeinu');
  });

  test('an article with neither falls back to the /Songs subpage', () => {
    const t = resolveTarget('Kogeinu', 'Just prose.');
    expect(t.editTitle).toBe('Kogeinu/Songs');
    expect(t.rootTitle).toBe('Kogeinu');
  });

  test('a deeper subpage still resolves the root correctly', () => {
    expect(resolveTarget('A/B/Songs', '{{Uptodate|X}}').rootTitle).toBe('A/B');
  });
});

describe('formatJstDate', () => {
  test('formats as "Month D, YYYY"', () => {
    // 2026-03-01T00:00:00Z is 09:00 JST on the same day.
    expect(formatJstDate(new Date('2026-03-01T00:00:00Z'))).toBe('March 1, 2026');
  });

  test('rolls forward to the next JST day late in UTC', () => {
    // 2026-03-01T16:00:00Z is 01:00 JST on 2 March.
    expect(formatJstDate(new Date('2026-03-01T16:00:00Z'))).toBe('March 2, 2026');
  });
});

function stubApi(overrides: Partial<WikiApi> = {}): WikiApi {
  return {
    get: () => Promise.resolve({ query: { pages: [] } }),
    postWithToken: () => Promise.resolve({}),
    ...overrides
  } as WikiApi;
}

describe('fetchPage', () => {
  test('returns title, content and timestamp', async () => {
    const api = stubApi({
      get: () => Promise.resolve({
        query: {
          pages: [{
            title: 'Kogeinu/Songs',
            revisions: [{
              timestamp: '2026-01-01T00:00:00Z',
              slots: { main: { content: '{{Uptodate|X}}' } }
            }]
          }]
        }
      })
    });
    const page = await fetchPage(api, 'Kogeinu/Songs');
    expect(page).toEqual({
      title: 'Kogeinu/Songs',
      content: '{{Uptodate|X}}',
      timestamp: '2026-01-01T00:00:00Z'
    });
  });

  test('returns null for a missing page', async () => {
    const api = stubApi({
      get: () => Promise.resolve({ query: { pages: [{ title: 'X', missing: true }] } })
    });
    expect(await fetchPage(api, 'X')).toBeNull();
  });

  test('returns null when the response has no pages', async () => {
    expect(await fetchPage(stubApi(), 'X')).toBeNull();
  });
});

describe('savePage', () => {
  test('sends an edit carrying conflict-detection timestamps', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const api = stubApi({
      postWithToken: (token: string, params: Record<string, unknown>) => {
        calls.push({ token, ...params });
        return Promise.resolve({ edit: { result: 'Success' } });
      }
    });
    const page: FetchedPage = {
      title: 'Kogeinu/Songs',
      content: 'old',
      timestamp: '2026-01-01T00:00:00Z'
    };

    await savePage(api, page, 'new', 'summary text');

    expect(calls).toHaveLength(1);
    expect(calls[0].token).toBe('csrf');
    expect(calls[0].action).toBe('edit');
    expect(calls[0].title).toBe('Kogeinu/Songs');
    expect(calls[0].text).toBe('new');
    expect(calls[0].summary).toBe('summary text');
    expect(calls[0].basetimestamp).toBe('2026-01-01T00:00:00Z');
    expect(calls[0].starttimestamp).toBe('2026-01-01T00:00:00Z');
  });

  test('rejects when the API reports an edit conflict', async () => {
    const api = stubApi({
      postWithToken: () => Promise.reject({ error: { code: 'editconflict', info: 'Conflict.' } })
    });
    const page: FetchedPage = { title: 'X', content: 'old', timestamp: 'T' };
    await expect(savePage(api, page, 'new', 's')).rejects.toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/gadgets/contents/UptodateEditor/page-target.test.ts`
Expected: FAIL — `Cannot find module './page-target.js'`

- [ ] **Step 3: Write the implementation**

Create `src/gadgets/contents/UptodateEditor/page-target.ts`:

```typescript
/**
 * Resolves which page actually holds the {{Uptodate}} wikitext, and performs
 * the read/write against the MediaWiki API.
 *
 * The freshness box renders on both the article and its /Songs subpage, but
 * the editable source lives in exactly one of them.
 */

import { findUptodateCall } from './uptodate-params.js';

/** Narrow view of mw.Api — narrow enough to stub in tests. */
export interface WikiApi {
    get(params: Record<string, unknown>): Promise<Record<string, any>>;
    postWithToken(token: string, params: Record<string, unknown>): Promise<Record<string, any>>;
}

export interface PageTarget {
    /** Page whose wikitext contains the {{Uptodate}} call. */
    editTitle: string;
    /** Root article carrying the infobox `status` parameter. */
    rootTitle: string;
}

export interface FetchedPage {
    title: string;
    content: string;
    /** Revision timestamp, used for edit-conflict detection. */
    timestamp: string;
}

const SONGS_SUFFIX = '/Songs';

/** Decides which page to edit and which article carries the infobox. */
export function resolveTarget(pageName: string, wikitext: string): PageTarget {
    if (pageName.endsWith(SONGS_SUFFIX)) {
        return {
            editTitle: pageName,
            rootTitle: pageName.slice(0, -SONGS_SUFFIX.length)
        };
    }
    if (findUptodateCall(wikitext)) {
        return { editTitle: pageName, rootTitle: pageName };
    }
    return { editTitle: pageName + SONGS_SUFFIX, rootTitle: pageName };
}

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Formats a date as "Month D, YYYY" in JST. The wiki's templates use the
 * CURRENTJST* magic words throughout, so dates are Japan-time by convention.
 */
export function formatJstDate(now: Date): string {
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return MONTHS[jst.getUTCMonth()] + ' ' + jst.getUTCDate() + ', ' + jst.getUTCFullYear();
}

/** Reads a page's current wikitext, or null when it does not exist. */
export async function fetchPage(api: WikiApi, title: string): Promise<FetchedPage | null> {
    const data = await api.get({
        action: 'query',
        prop: 'revisions',
        rvprop: 'content|timestamp',
        rvslots: 'main',
        titles: title,
        formatversion: 2
    });

    const pages = data && data.query && data.query.pages;
    if (!pages || !pages.length) return null;

    const page = pages[0];
    if (page.missing || !page.revisions || !page.revisions.length) return null;

    const revision = page.revisions[0];
    return {
        title: page.title,
        content: revision.slots.main.content,
        timestamp: revision.timestamp
    };
}

/**
 * Writes new wikitext. `basetimestamp`/`starttimestamp` make the API reject
 * the edit if someone else saved in the meantime, rather than clobbering them.
 */
export async function savePage(
    api: WikiApi,
    page: FetchedPage,
    text: string,
    summary: string
): Promise<void> {
    await api.postWithToken('csrf', {
        action: 'edit',
        title: page.title,
        text: text,
        summary: summary,
        basetimestamp: page.timestamp,
        starttimestamp: page.timestamp,
        nocreate: 1,
        formatversion: 2
    });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/gadgets/contents/UptodateEditor/page-target.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Run the whole suite to confirm nothing regressed**

Run: `npx jest src/gadgets/contents/UptodateEditor`
Expected: 3 suites passed.

- [ ] **Step 6: Commit**

```bash
git add src/gadgets/contents/UptodateEditor/page-target.ts src/gadgets/contents/UptodateEditor/page-target.test.ts
git commit -m "feat(UptodateEditor): resolve edit target and read/write via mw.Api"
```

---

## Task 4: Modal component

**Files:**
- Create: `src/gadgets/contents/UptodateEditor/uptodate-modal.ts`

**Interfaces:**
- Consumes: `UptodateEdits` from `./uptodate-params.js` (Task 1); `StatusDetection` from `./status-detect.js` (Task 2).
- Produces: `openUptodateModal(options: ModalOptions): void` and the type `ModalOptions`.

No test: this is DOM assembly, verified manually in Task 6. The logic it depends on is already covered by Tasks 1–3.

- [ ] **Step 1: Write the implementation**

Create `src/gadgets/contents/UptodateEditor/uptodate-modal.ts`:

```typescript
/**
 * Standalone modal for editing {{Uptodate}} parameters.
 *
 * Deliberately NOT built on the shared ModalBuilder gadget: that one hard-gates
 * on admin groups and returns early for everyone else, which would lock out the
 * autoconfirmed editors this tool is for. Visual tokens are mirrored in
 * UptodateEditor.less so it still looks native.
 */

import type { UptodateEdits, TemplateCall } from './uptodate-params.js';
import type { StatusDetection } from './status-detect.js';

export interface ModalOptions {
    /** Page being edited, shown in the header. */
    editTitle: string;
    /** The parsed call, used to prefill the form. */
    call: TemplateCall;
    /** Inactivity detection result, used for the force-uptodate suggestion. */
    detection: StatusDetection;
    /** Date to prefill when the call has none. */
    fallbackDate: string;
    /** Renders the wikitext that the given edits would produce. */
    preview: (edits: UptodateEdits) => string;
    /** Invoked with the final edits when the user saves. */
    onSave: (edits: UptodateEdits) => Promise<void>;
}

const NAMED_FIELDS = [
    { key: 'reason', label: 'Reason', hint: 'Overrides the status line. Setting this forces "outdated".' },
    { key: 'discography', label: 'Discography', hint: 'Set to yes when the discography is covered too.' },
    { key: 'needrom', label: 'Needs romanization', hint: 'Adds the romanization-required category.' },
    { key: 'nocat', label: 'No categories', hint: 'Set to true to suppress categorization.' },
    { key: 'bordercolor', label: 'Border colour', hint: 'Hex value, e.g. #A97A3F.' }
] as const;

function el(tag: string, className?: string, text?: string): HTMLElement {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
}

/** Reads a named parameter's current value out of the parsed call. */
function currentValue(call: TemplateCall, name: string): string {
    const param = call.params.filter(p => p.name === name)[0];
    return param ? param.value : '';
}

/** Reads the current date: the named updated-at alias, else positional 1. */
function currentDate(call: TemplateCall): string {
    const alias = call.params.filter(p => p.name === 'updated-at')[0];
    if (alias) return alias.value;
    const first = call.params.filter(p => p.index === 1)[0];
    return first ? first.value : '';
}

export function openUptodateModal(options: ModalOptions): void {
    const overlay = el('div', 'ute-overlay');
    const modal = el('div', 'ute-modal');
    overlay.appendChild(modal);

    // --- Header ---
    const header = el('div', 'ute-header');
    header.appendChild(el('h2', 'ute-title', 'Update song list freshness'));
    header.appendChild(el('div', 'ute-subtitle', 'Editing ' + options.editTitle));
    const closeBtn = el('button', 'ute-close', '×') as HTMLButtonElement;
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    header.appendChild(closeBtn);
    modal.appendChild(header);

    const body = el('div', 'ute-body');
    modal.appendChild(body);

    // --- Date ---
    const dateRow = el('div', 'ute-field');
    dateRow.appendChild(el('label', 'ute-label', 'Last updated'));
    const dateInput = el('input', 'ute-input') as HTMLInputElement;
    dateInput.type = 'text';
    dateInput.value = currentDate(options.call) || options.fallbackDate;
    dateRow.appendChild(dateInput);
    dateRow.appendChild(el('div', 'ute-hint', 'Date of the most recent upload, e.g. March 1, 2026.'));
    const dateError = el('div', 'ute-error');
    dateError.style.display = 'none';
    dateRow.appendChild(dateError);
    body.appendChild(dateRow);

    // --- force-uptodate ---
    const pinRow = el('div', 'ute-field ute-pin');
    const pinLabel = el('label', 'ute-check');
    const pinInput = el('input') as HTMLInputElement;
    pinInput.type = 'checkbox';
    pinInput.checked = options.detection.suggestPin;
    pinLabel.appendChild(pinInput);
    pinLabel.appendChild(el('span', undefined, 'Force up-to-date'));
    pinRow.appendChild(pinLabel);
    pinRow.appendChild(el(
        'div',
        'ute-hint',
        'Keeps the list marked up-to-date regardless of age. Use when the singer is no longer active, so the list is complete.'
    ));

    const evidence = el('div', 'ute-evidence ute-' + options.detection.confidence);
    evidence.appendChild(el('div', undefined, options.detection.evidence));
    if (options.detection.raw !== null && options.detection.confidence !== 'confident') {
        const raw = el('div', 'ute-raw');
        raw.appendChild(el('span', 'ute-raw-label', 'Status reads: '));
        // textContent, never innerHTML — this is unsanitized wiki input.
        raw.appendChild(el('code', undefined, options.detection.raw));
        evidence.appendChild(raw);
    }
    pinRow.appendChild(evidence);
    body.appendChild(pinRow);

    // --- Remaining named fields ---
    const inputs: Record<string, HTMLInputElement> = {};
    for (const field of NAMED_FIELDS) {
        const row = el('div', 'ute-field');
        row.appendChild(el('label', 'ute-label', field.label));
        const input = el('input', 'ute-input') as HTMLInputElement;
        input.type = 'text';
        input.value = currentValue(options.call, field.key);
        row.appendChild(input);
        row.appendChild(el('div', 'ute-hint', field.hint));
        body.appendChild(row);
        inputs[field.key] = input;
    }

    // --- Preview ---
    const previewWrap = el('div', 'ute-field');
    previewWrap.appendChild(el('label', 'ute-label', 'Resulting wikitext'));
    const previewBox = el('pre', 'ute-preview');
    previewWrap.appendChild(previewBox);
    body.appendChild(previewWrap);

    // --- Footer ---
    const footer = el('div', 'ute-footer');
    const status = el('div', 'ute-status');
    const cancelBtn = el('button', 'ute-btn ute-btn-secondary', 'Cancel') as HTMLButtonElement;
    cancelBtn.type = 'button';
    const saveBtn = el('button', 'ute-btn ute-btn-primary', 'Save') as HTMLButtonElement;
    saveBtn.type = 'button';
    footer.appendChild(status);
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
    modal.appendChild(footer);

    /** Collects the form into an edit set. Blank named fields become removals. */
    function collect(): UptodateEdits {
        const edits: UptodateEdits = { date: dateInput.value.trim() };
        for (const field of NAMED_FIELDS) {
            const value = inputs[field.key].value.trim();
            (edits as Record<string, string | null>)[field.key] = value === '' ? null : value;
        }
        edits['force-uptodate'] = pinInput.checked ? 'yes' : null;
        return edits;
    }

    function refresh(): void {
        previewBox.textContent = options.preview(collect());
        const empty = dateInput.value.trim() === '';
        saveBtn.disabled = empty;
        dateError.style.display = empty ? '' : 'none';
        dateError.textContent = empty ? 'A date is required.' : '';
    }

    function close(): void {
        document.removeEventListener('keydown', onKeydown);
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    function onKeydown(e: KeyboardEvent): void {
        if (e.key === 'Escape') close();
    }

    dateInput.addEventListener('input', refresh);
    pinInput.addEventListener('change', refresh);
    for (const field of NAMED_FIELDS) {
        inputs[field.key].addEventListener('input', refresh);
    }

    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e: MouseEvent) => {
        if (e.target === overlay) close();
    });
    document.addEventListener('keydown', onKeydown);

    saveBtn.addEventListener('click', () => {
        saveBtn.disabled = true;
        cancelBtn.disabled = true;
        status.className = 'ute-status';
        status.textContent = 'Saving…';
        options.onSave(collect()).then(
            () => { close(); window.location.reload(); },
            (err: unknown) => {
                saveBtn.disabled = false;
                cancelBtn.disabled = false;
                status.className = 'ute-status ute-status-error';
                status.textContent = 'Save failed: ' + describeError(err);
            }
        );
    });

    document.body.appendChild(overlay);
    refresh();
    dateInput.focus();
}

function describeError(err: unknown): string {
    const e = err as { error?: { code?: string; info?: string } };
    if (e && e.error && e.error.code === 'editconflict') {
        return 'someone else edited the page. Reload and try again.';
    }
    if (e && e.error && e.error.info) return e.error.info;
    return 'unknown error.';
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors referencing `uptodate-modal.ts`.

Note: pre-existing errors elsewhere in the repo may appear. Only errors in `src/gadgets/contents/UptodateEditor/` are in scope. If there are none there, this passes.

- [ ] **Step 3: Commit**

```bash
git add src/gadgets/contents/UptodateEditor/uptodate-modal.ts
git commit -m "feat(UptodateEditor): standalone modal for editing Uptodate params"
```

---

## Task 5: Entry point, button injection and styling

**Files:**
- Create: `src/gadgets/contents/UptodateEditor/UptodateEditor.ts`
- Create: `src/gadgets/contents/UptodateEditor/UptodateEditor.less`

**Interfaces:**
- Consumes: `applyEdits`, `findUptodateCall` (Task 1); `detectStatus` (Task 2); `resolveTarget`, `fetchPage`, `savePage`, `formatJstDate` (Task 3); `openUptodateModal` (Task 4).
- Produces: nothing — this is the bundle entry.

- [ ] **Step 1: Write the entry point**

Create `src/gadgets/contents/UptodateEditor/UptodateEditor.ts`:

```typescript
/**
 * UptodateEditor — adds an "Update" button to the rendered freshness box and
 * opens a modal to edit the {{Uptodate}} parameters behind it.
 *
 * The box renders on both the article (via {{Uptodate/sync}}) and its /Songs
 * subpage, but the wikitext lives on only one of them; see page-target.ts.
 */

import { applyEdits, findUptodateCall } from './uptodate-params.js';
import { detectStatus } from './status-detect.js';
import {
    resolveTarget,
    fetchPage,
    savePage,
    formatJstDate
} from './page-target.js';
import type { WikiApi, FetchedPage } from './page-target.js';
import { openUptodateModal } from './uptodate-modal.js';
import type { UptodateEdits } from './uptodate-params.js';

interface MwApiConstructor {
    new (): WikiApi;
}

declare const mw: {
    config: { get: (key: string) => unknown };
    Api: MwApiConstructor;
};

declare global {
    interface Window {
        uptodateEditorLoaded?: boolean;
    }
}

(function (): void {
    'use strict';

    if (window.uptodateEditorLoaded) return;
    window.uptodateEditorLoaded = true;

    const SUMMARY = 'Update song list freshness via UptodateEditor';

    function isPermitted(): boolean {
        const groups = (mw.config.get('wgUserGroups') || []) as string[];
        const name = mw.config.get('wgUserName');
        if (!name) return false;
        return groups.indexOf('autoconfirmed') !== -1
            || groups.indexOf('sysop') !== -1;
    }

    function makeButton(): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ute-open';
        button.textContent = 'Update';
        button.setAttribute('aria-label', 'Update song list freshness');
        return button;
    }

    async function launch(button: HTMLButtonElement): Promise<void> {
        const api = new mw.Api();
        const pageName = mw.config.get('wgPageName') as string;

        button.disabled = true;
        button.textContent = 'Loading…';

        try {
            const current = await fetchPage(api, pageName);
            const target = resolveTarget(pageName, current ? current.content : '');

            const editPage: FetchedPage | null = target.editTitle === pageName
                ? current
                : await fetchPage(api, target.editTitle);

            if (!editPage) {
                window.alert(
                    'Could not load ' + target.editTitle
                    + '. The page may not exist, so there is nothing to update.'
                );
                return;
            }

            const call = findUptodateCall(editPage.content);
            if (!call) {
                window.alert(
                    'No {{Uptodate}} template found in ' + target.editTitle + '.'
                );
                return;
            }

            const rootPage = target.rootTitle === editPage.title
                ? editPage
                : await fetchPage(api, target.rootTitle);
            const detection = detectStatus(rootPage ? rootPage.content : '');

            openUptodateModal({
                editTitle: editPage.title,
                call: call,
                detection: detection,
                fallbackDate: formatJstDate(new Date()),
                preview: (edits: UptodateEdits): string => {
                    const next = applyEdits(editPage.content, edits);
                    if (!next) return '';
                    const nextCall = findUptodateCall(next);
                    return nextCall ? next.slice(nextCall.start, nextCall.end) : '';
                },
                onSave: async (edits: UptodateEdits): Promise<void> => {
                    // Re-fetch so a save always builds on the newest revision;
                    // basetimestamp still rejects a race that lands in between.
                    const fresh = await fetchPage(api, editPage.title);
                    if (!fresh) throw { error: { info: 'Page disappeared.' } };
                    const next = applyEdits(fresh.content, edits);
                    if (!next) throw { error: { info: 'Template no longer present.' } };
                    await savePage(api, fresh, next, SUMMARY);
                }
            });
        } catch (err) {
            const e = err as { error?: { info?: string } };
            window.alert('UptodateEditor failed: ' + ((e && e.error && e.error.info) || 'unknown error.'));
        } finally {
            button.disabled = false;
            button.textContent = 'Update';
        }
    }

    function init(): void {
        if (!isPermitted()) return;

        const boxes = document.querySelectorAll('.freshness-box');
        for (let i = 0; i < boxes.length; i++) {
            const box = boxes[i];
            if (box.querySelector('.ute-open')) continue;

            const cta = box.querySelector('.freshness-cta');
            const host = cta || box.querySelector('.freshness-body');
            if (!host) continue;

            const button = makeButton();
            button.addEventListener('click', () => { void launch(button); });
            host.appendChild(button);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
```

- [ ] **Step 2: Write the stylesheet**

Create `src/gadgets/contents/UptodateEditor/UptodateEditor.less`.

**Tokens are re-declared locally on purpose.** Do NOT `@import` `ModalBuilder.less` — commit `e05de9f` fixed a build break caused by cross-gadget `@import`.

```less
// Mirrors ModalBuilder.less tokens. Re-declared, never @imported:
// cross-gadget @import breaks the build (see commit e05de9f).
@ute-accent: #6366f1;
@ute-radius: 6px;
@ute-radius-lg: 12px;
@ute-transition: 0.15s ease;

@ute-text-primary: #18181b;
@ute-text-muted: #71717a;
@ute-bg: #ffffff;
@ute-bg-subtle: rgba(0, 0, 0, 0.04);
@ute-border: rgba(0, 0, 0, 0.1);
@ute-danger: #ef4444;
@ute-warn: #b45309;

@ute-dark-text-primary: #fafafa;
@ute-dark-text-muted: #a1a1aa;
@ute-dark-bg: #1f1f23;
@ute-dark-bg-subtle: rgba(255, 255, 255, 0.06);
@ute-dark-border: rgba(255, 255, 255, 0.1);

@ute-dark-mode: ~'.skin-theme-clientpref-night';

// --- Trigger button, inside the freshness box ---
.ute-open {
    display: inline-block;
    margin-left: 0.6em;
    padding: 2px 10px;
    font-size: 0.85em;
    font-weight: 600;
    color: @ute-text-primary;
    background: @ute-bg-subtle;
    border: 1px solid @ute-border;
    border-radius: @ute-radius;
    cursor: pointer;
    transition: background @ute-transition, border-color @ute-transition;

    &:hover:not(:disabled) {
        border-color: @ute-accent;
        background: fade(@ute-accent, 10%);
    }

    &:disabled {
        opacity: 0.6;
        cursor: default;
    }

    @{ute-dark-mode} & {
        color: @ute-dark-text-primary;
        background: @ute-dark-bg-subtle;
        border-color: @ute-dark-border;
    }
}

// --- Overlay and shell ---
.ute-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.5);
}

.ute-modal {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 520px;
    max-height: 90vh;
    color: @ute-text-primary;
    background: @ute-bg;
    border-radius: @ute-radius-lg;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);

    @{ute-dark-mode} & {
        color: @ute-dark-text-primary;
        background: @ute-dark-bg;
    }
}

.ute-header {
    position: relative;
    padding: 1rem 1.25rem 0.75rem;
    border-bottom: 1px solid @ute-border;

    @{ute-dark-mode} & { border-color: @ute-dark-border; }
}

.ute-title {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 700;
    border: 0;
}

.ute-subtitle {
    margin-top: 0.15rem;
    font-size: 0.8rem;
    color: @ute-text-muted;

    @{ute-dark-mode} & { color: @ute-dark-text-muted; }
}

.ute-close {
    position: absolute;
    top: 0.75rem;
    right: 0.9rem;
    padding: 0 0.3rem;
    font-size: 1.3rem;
    line-height: 1;
    color: @ute-text-muted;
    background: none;
    border: 0;
    cursor: pointer;

    &:hover { color: @ute-danger; }
}

.ute-body {
    flex: 1;
    padding: 1rem 1.25rem;
    overflow-y: auto;
}

// --- Fields ---
.ute-field { margin-bottom: 1rem; }

.ute-label {
    display: block;
    margin-bottom: 0.25rem;
    font-size: 0.85rem;
    font-weight: 600;
}

.ute-input {
    box-sizing: border-box;
    width: 100%;
    padding: 0.4rem 0.55rem;
    font-size: 0.9rem;
    color: inherit;
    background: transparent;
    border: 1px solid @ute-border;
    border-radius: @ute-radius;

    &:focus {
        outline: none;
        border-color: @ute-accent;
        box-shadow: 0 0 0 2px fade(@ute-accent, 20%);
    }

    @{ute-dark-mode} & { border-color: @ute-dark-border; }
}

.ute-hint {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: @ute-text-muted;

    @{ute-dark-mode} & { color: @ute-dark-text-muted; }
}

.ute-error {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: @ute-danger;
}

.ute-check {
    display: flex;
    gap: 0.45rem;
    align-items: center;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
}

// --- Detection evidence ---
.ute-evidence {
    margin-top: 0.5rem;
    padding: 0.5rem 0.65rem;
    font-size: 0.78rem;
    border-left: 3px solid @ute-border;
    border-radius: 0 @ute-radius @ute-radius 0;
    background: @ute-bg-subtle;

    @{ute-dark-mode} & {
        background: @ute-dark-bg-subtle;
        border-color: @ute-dark-border;
    }

    &.ute-confident { border-left-color: @ute-accent; }
    &.ute-ambiguous,
    &.ute-unknown { border-left-color: @ute-warn; }
}

.ute-raw {
    margin-top: 0.35rem;
    word-break: break-word;

    code { white-space: pre-wrap; }
}

.ute-raw-label { font-weight: 600; }

// --- Preview ---
.ute-preview {
    max-height: 8rem;
    margin: 0;
    padding: 0.5rem 0.65rem;
    overflow: auto;
    font-size: 0.78rem;
    white-space: pre-wrap;
    word-break: break-word;
    background: @ute-bg-subtle;
    border-radius: @ute-radius;

    @{ute-dark-mode} & { background: @ute-dark-bg-subtle; }
}

// --- Footer ---
.ute-footer {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: flex-end;
    padding: 0.75rem 1.25rem;
    border-top: 1px solid @ute-border;

    @{ute-dark-mode} & { border-color: @ute-dark-border; }
}

.ute-status {
    flex: 1;
    font-size: 0.78rem;
    color: @ute-text-muted;

    &.ute-status-error { color: @ute-danger; }
}

.ute-btn {
    padding: 0.4rem 0.9rem;
    font-size: 0.85rem;
    font-weight: 600;
    border: 1px solid transparent;
    border-radius: @ute-radius;
    cursor: pointer;
    transition: opacity @ute-transition;

    &:disabled { opacity: 0.55; cursor: default; }
}

.ute-btn-secondary {
    color: inherit;
    background: transparent;
    border-color: @ute-border;

    @{ute-dark-mode} & { border-color: @ute-dark-border; }
}

.ute-btn-primary {
    color: #ffffff;
    background: @ute-accent;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors under `src/gadgets/contents/UptodateEditor/`.

- [ ] **Step 4: Confirm the test suite still passes**

Run: `npx jest src/gadgets/contents/UptodateEditor`
Expected: 3 suites passed.

- [ ] **Step 5: Commit**

```bash
git add src/gadgets/contents/UptodateEditor/UptodateEditor.ts src/gadgets/contents/UptodateEditor/UptodateEditor.less
git commit -m "feat(UptodateEditor): entry point, button injection and styling"
```

---

## Task 6: Registration, build and deployment artifacts

**Files:**
- Modify: `src/gadgets/gadgets-definition.yaml` (add to the `contents:` section)
- Create: `docs/superpowers/deploy/2026-08-19-uptodate-editor/` (deploy bundle)

**Interfaces:**
- Consumes: all prior tasks.
- Produces: deployable `.js` / `.css` plus the wikitext patches, for manual application.

- [ ] **Step 1: Register the gadget**

In `src/gadgets/gadgets-definition.yaml`, inside the `contents:` section, add an entry alongside `spoiler` and `utacolle`, matching the surrounding indentation exactly (4 spaces for the gadget key, 6 for its properties):

```yaml
    UptodateEditor:
      description: "Button + modal to update {{Uptodate}} parameters on song lists."
      authors:
        - makudoumee
      code:
        - UptodateEditor.ts
        - UptodateEditor.less
      resourceLoader:
        default: true
        hidden: true
        actions:
          - view
        namespaces:
          - 0
        dependencies:
          - mediawiki.api
          - mediawiki.util
          - mediawiki.user
```

Only `UptodateEditor.ts` and `UptodateEditor.less` are listed. The helper modules are imported and get bundled by rollup; listing them would emit separate wiki pages.

- [ ] **Step 2: Build**

Run: `node node_modules/vite/bin/vite.js build`
Expected: build succeeds, and the output listing includes
`dist/gadgets/contents/UptodateEditor/UptodateEditor.js`.

- [ ] **Step 3: Verify the build output**

```bash
ls -la dist/gadgets/contents/UptodateEditor/
grep -c "freshness-box" dist/gadgets/contents/UptodateEditor/UptodateEditor.js
grep -c "ute-modal" dist/gadgets/contents/UptodateEditor/UptodateEditor.css
```

Expected: both `.js` and `.css` exist; both greps return at least 1. The `.js` must contain the bundled helper logic — confirm with:

```bash
grep -c "normalizeTemplateName\|Uptodate" dist/gadgets/contents/UptodateEditor/UptodateEditor.js
```

Expected: at least 1. If the helper modules were emitted as separate chunk files instead of being inlined, stop and re-check Step 1 — they must not be in the `code:` list.

- [ ] **Step 4: Verify the gadgets-definition delta**

First confirm the line is present and correctly placed:

```bash
grep -n "UptodateEditor" dist/gadgets/gadgets-definition.wikitext
```

Expected: one match, reading
`* UptodateEditor[ResourceLoader|default|hidden|actions=view|namespaces=0|dependencies=mediawiki.api,mediawiki.util,mediawiki.user]|UptodateEditor.js|UptodateEditor.css`
and appearing under the `== contents ==` heading.

Then diff the generated file against prod to prove it is the only delta. Fetch prod's copy directly:

```bash
curl -s -A "UptodateEditor-audit/1.0" \
  "https://utaite.wiki/w/api.php?action=parse&page=MediaWiki:Gadgets-definition&prop=wikitext&format=json&formatversion=2" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).parse.wikitext))" \
  > /tmp/prod-gadgets-definition.txt
diff /tmp/prod-gadgets-definition.txt dist/gadgets/gadgets-definition.wikitext
```

Expected: the diff shows the added `UptodateEditor` line and nothing else.

Per the reconciliation roadmap, that one added line **must be the only delta**. If the diff shows other changes, they are pre-existing repo/prod divergence — record them in the handoff and do **not** "fix" them here; that is the roadmap's job, and silently absorbing them into this change would hide real drift.

- [ ] **Step 5: Assemble the deploy bundle**

```bash
mkdir -p docs/superpowers/deploy/2026-08-19-uptodate-editor
cp dist/gadgets/contents/UptodateEditor/UptodateEditor.js docs/superpowers/deploy/2026-08-19-uptodate-editor/
cp dist/gadgets/contents/UptodateEditor/UptodateEditor.css docs/superpowers/deploy/2026-08-19-uptodate-editor/
grep -n "UptodateEditor" dist/gadgets/gadgets-definition.wikitext > docs/superpowers/deploy/2026-08-19-uptodate-editor/gadgets-definition-line.txt
```

- [ ] **Step 6: Write the wikitext patches**

Create `docs/superpowers/deploy/2026-08-19-uptodate-editor/wikitext-patches.md`.

These are the spec §8 prerequisites for `force-uptodate`. They are applied **by the user**, not by this work. Content:

````markdown
# Wikitext patches — prerequisites for `force-uptodate`

Apply by hand. Until these land, the gadget's force-uptodate checkbox writes
`force-uptodate=yes` into the template and the parameter is simply ignored —
nothing breaks.

## 1. `Module:Freshness/core`

In `core.decide`, after the existing `forced` line, add a pin path. An explicit
outdated flag always wins over a pin.

Replace:

```lua
  local forced = (params.force == true) or (reason ~= nil) or (not dated)

  local tier = forced and "outdated" or core.classify(months)
```

with:

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

Then in the `state` table, make `color`, `meter` and `category` pin-aware:

```lua
    color = forced and core.GREY or (pinned and base or core.fade(base, months)),
    meter = forced and 3 or (pinned and 100 or core.meter(months)),
    category = (tier == "fresh") and "up-to-date" or "outdated",
```

and add `pinned = pinned,` to the table so `core.render` can read it.

In `core.render`, add a pinned branch to the `line` chain, before the final
`else`:

```lua
  elseif state.pinned then
    line = "Song list last updated <b>" .. esc_none(state.date)
        .. "</b>. Pinned as complete \u{2014} this singer is no longer active."
```

## 2. `Module:Freshness`

In `p.render`, add `pin` to the params table:

```lua
    pin = (a['force-uptodate'] == 'yes'),
```

## 3. `Template:Uptodate`

Current content:

```
<includeonly>{{Freshness|{{{1|}}}|base={{{bordercolor|{{{base|}}}}}}|discography={{{discography|}}}|needrom={{{needrom|}}}|nocat={{{nocat|}}}|customlatesteditor={{{customlatesteditor|}}}|lastedittext-nolink={{{lastedittext-nolink|}}}}}</includeonly><noinclude>{{documentation}}</noinclude>
```

Replace with (widened pass-through; the date gains a named `updated-at` alias
that falls back to positional 1 so existing live usage does not degrade;
`force-uptodate` is named-only and takes no positional slot, avoiding any
collision with the legacy empty `pos2`/`pos3`/`pos4` values still on live pages):

```
<includeonly>{{Freshness|{{{updated-at|{{{1|}}}}}}|base={{{bordercolor|{{{base|}}}}}}|discography={{{discography|}}}|needrom={{{needrom|}}}|nocat={{{nocat|}}}|customlatesteditor={{{customlatesteditor|}}}|lastedittext-nolink={{{lastedittext-nolink|}}}|force-uptodate={{{force-uptodate|}}}|force-outdated={{{force-outdated|}}}|status={{{status|}}}|reason={{{reason|}}}}}</includeonly><noinclude>{{documentation}}</noinclude>
```

## Verification after applying

1. On a sandbox page, `{{Uptodate|January 1, 2020}}` renders **Outdated**.
2. `{{Uptodate|January 1, 2020|force-uptodate=yes}}` renders **Up to date**.
3. `{{Uptodate|January 1, 2020|force-uptodate=yes|reason=Missing 2021 covers}}`
   renders **Outdated** — reason beats pin.
4. `{{Uptodate|updated-at=January 1, 2020}}` renders identically to the
   positional form.
5. **Check `{{Uptodate/sync}} propagation.** It runs through `Module:Uptodate`,
   NOT `Module:Freshness.fromSubpage`. Its rebuild loop forwards all named
   parameters except `nocat`, so `force-uptodate` should reach the article — but
   that is incidental rather than designed. Put `force-uptodate=yes` on a test
   `/Songs` subpage and confirm the article's box shows **Up to date**.
````

- [ ] **Step 7: Manual verification on the live wiki**

Read-only check, no saving:

1. Open a utaite article with an outdated box, e.g. `https://utaite.wiki/wiki/Kogeinu`.
2. In the browser console, paste the contents of the built `UptodateEditor.js`, then paste the built `.css` into a `<style>` element.
3. Confirm an **Update** button appears in the freshness box.
4. Click it. Confirm the modal opens, the date field is prefilled with `October 31, 2023`, and `bordercolor` is prefilled `#A97A3F`.
5. Confirm **force-uptodate is pre-ticked**, since `Kogeinu` has `|status = {{Inactive}}`.
6. Confirm the preview shows `{{Uptodate|October 31, 2023|||bordercolor=#A97A3F|force-uptodate=yes}}` — the legacy empty positionals preserved.
7. Untick force-uptodate; confirm the parameter disappears from the preview.
8. **Press Cancel. Do not save.**
9. Repeat on an article whose status is mixed and confirm the checkbox is unticked with the raw status shown.

- [ ] **Step 8: Commit**

```bash
git add src/gadgets/gadgets-definition.yaml docs/superpowers/deploy/2026-08-19-uptodate-editor/
git commit -m "feat(UptodateEditor): register gadget and add deploy bundle"
```

- [ ] **Step 9: Hand off**

Report to the user:
- Path to the deploy bundle.
- The four destinations from spec §9: `MediaWiki:Gadget-UptodateEditor.js`, `MediaWiki:Gadget-UptodateEditor.css`, the `MediaWiki:Gadgets-definition` line, and the §8 patches.
- Deployment order is flexible: the gadget degrades gracefully before the patches land, and the patches are harmless before the gadget exists.
- **Do not run `pnpm run sync`.**

---

## Definition of Done

- [ ] `npx jest src/gadgets/contents/UptodateEditor` — 3 suites pass.
- [ ] `npx tsc --noEmit -p tsconfig.json` — no errors under the gadget folder.
- [ ] `node node_modules/vite/bin/vite.js build` succeeds and emits `UptodateEditor.js` + `.css`.
- [ ] `dist/gadgets/gadgets-definition.wikitext` contains the `UptodateEditor` line under `== contents ==`, and that is the only intended delta.
- [ ] Deploy bundle contains `.js`, `.css`, the definition line, and `wikitext-patches.md`.
- [ ] Manual verification (Task 6 Step 7) done without saving to prod.
- [ ] Nothing synced to the live wiki.
