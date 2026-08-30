import type { ContentModel } from './types.ts';

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

const hex = (c: string) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');

export function encodeSegment(seg: string): string {
  const out = seg.replace(ILLEGAL, hex);
  // Windows also refuses trailing dots and spaces.
  return out.replace(/[. ]$/, hex);
}

export function decodeSegment(seg: string): string {
  return seg.replace(/%([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
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
  const groups = new Map<string, { title: string; natural: string }[]>();
  for (const e of sorted) {
    const natural = titleToPath(e.title, e.model);
    const key = natural.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ title: e.title, natural });
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
