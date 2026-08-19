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
 * Applies MediaWiki title normalization: HTML comments are stripped,
 * underscores become spaces, the name is trimmed and internally collapsed,
 * an optional leading colon and `Template:` prefix are stripped, and only the
 * FIRST character is case-folded. Interior case is significant, so
 * `UpToDate` != `Uptodate`.
 *
 * Comment stripping is not cosmetic: live infoboxes are written as
 * `{{Utaite\n<!--Basic Information Section-->\n|cat=...}}`, so the name slice
 * up to the first top-level pipe genuinely contains a comment. MediaWiki
 * removes comments before resolving the name, and so must we.
 */
export function normalizeTemplateName(name: string): string {
    let n = name.replace(/<!--[\s\S]*?-->/g, '');
    n = n.replace(/_/g, ' ').trim().replace(/\s+/g, ' ');
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
