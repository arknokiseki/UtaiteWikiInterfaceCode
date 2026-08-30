import type { FirstRevision } from '../lib/types.ts';

/**
 * Transwiki import preserves the original revision history with interwiki-
 * prefixed usernames, so the first revision's user IS the provenance.
 *
 * Special:Import log events are deliberately not consulted: they are redundant
 * with this signal (import preserves the prefix anyway) and strictly narrower,
 * missing anything imported outside a logged Special:Import. The only thing the
 * log adds is when a page landed on this wiki, which this audit does not need.
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
 * its doc SOURCED rather than AUTHORED.
 *
 * Unknown provenance is never assumed upstream — that would wrongly move work
 * out of the write queue, where the cost of being wrong is a page nobody
 * documents because everyone assumed someone else already had.
 */
export function isUpstream(rev: FirstRevision | undefined): boolean {
  return !!rev && rev.sourceWiki !== '';
}
