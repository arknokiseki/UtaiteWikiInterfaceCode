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
/**
 * The old utaite Fandom wiki appears under several interwiki spellings —
 * `utaite>`, `wikia:utaite>` and `:wikia:utaite>` (the leading colon is a
 * formatting artifact). They are one source and are folded together here.
 * The raw username is still kept in FirstRevision.user, so nothing is lost.
 */
const CANONICAL: Record<string, string> = {
  utaite: 'wikia:utaite',
  'wikia:utaite': 'wikia:utaite',
};

export function parseSourceWiki(user: string): string {
  const i = user.indexOf('>');
  if (i === -1) return '';
  const raw = user.slice(0, i).replace(/^:+/, '');
  return CANONICAL[raw] ?? raw;
}

const LABELS: Record<string, string> = {
  mw: 'mediawiki.org',
  wp: 'Wikipedia',
  meta: 'Meta-Wiki',
  wikia: 'Fandom (wiki not identified)',
  'wikia:utaite': 'Fandom — old utaite wiki',
  'wikia:vocaloidlyrics': 'Fandom — Vocaloid Lyrics wiki',
  'wikia:virtualyoutuber': 'Fandom — Virtual YouTuber wiki',
  dev: 'Fandom Dev wiki',
  mh: 'Miraheze',
  'mh:dev': 'Miraheze Dev',
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
