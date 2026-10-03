/**
 * Render-parity gate for the album template migration.
 *
 * Compares the *facts* a tracklist asserts — how many tracks and what they are
 * called — before and after the module cutover. Presentation is expected to
 * change completely; the track set is not. A page whose tracks change is a
 * regression and blocks deployment.
 *
 * Read-only, like everything else under dev-utils/wiki-audit: no mwn write
 * method is imported here. See the header of lib/api.ts.
 */

export interface TrackFacts {
  count: number;
  titles: string[];
}

/**
 * Decoration the new renderer folds into the title cell, which the old
 * markup carried in separate columns or not at all. Removed before comparison
 * so a restructured cell does not read as a renamed track.
 */
const DECORATION =
  /<span class="album-track-(?:info|badge|credit)"[^>]*>[\s\S]*?<\/span>/gi;

/** Strips tags and collapses whitespace, leaving comparable text. */
function text(html: string): string {
  return html
    .replace(DECORATION, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&mdash;/g, '—')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pulls the track rows out of rendered album HTML.
 *
 * Only `<td>` rows are considered, so header rows are skipped, and the title
 * is taken from the second cell — the first is the track number, which the
 * module preserves verbatim but which is not what we are comparing.
 */
/**
 * Only tables the album templates tag as tracklists.
 *
 * Both the old template and the module emit `album-track-table`. Without this
 * filter the comparison also picks up shop, streaming and navbox tables, whose
 * markup the rewrite legitimately restructures — which made four pages report
 * lost tracks while their tracklists were identical.
 */
function trackTables(html: string): string[] {
  return (html.match(/<table[^>]*>[\s\S]*?<\/table>/gi) ?? []).filter((t) =>
    /<table[^>]*class="[^"]*album-track-table/i.test(t),
  );
}

export function extractTrackFacts(html: string): TrackFacts {
  const titles: string[] = [];

  for (const table of trackTables(html)) {
    const bodies = table.match(/<tbody[\s\S]*?<\/tbody>/gi) ?? [table];
    for (const body of bodies) {
      for (const row of body.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
        const cells = row.match(/<td[\s\S]*?<\/td>/gi);
        if (!cells || cells.length < 2) continue;
        titles.push(text(cells[1]));
      }
    }
  }

  return { count: titles.length, titles };
}

/** Returns human-readable differences; empty means the renders are equivalent. */
export function compare(before: TrackFacts, after: TrackFacts): string[] {
  const diffs: string[] = [];

  if (before.count !== after.count) {
    diffs.push(`track count ${before.count} -> ${after.count}`);
  }

  const n = Math.min(before.titles.length, after.titles.length);
  for (let i = 0; i < n; i++) {
    if (before.titles[i] !== after.titles[i]) {
      diffs.push(`track ${i + 1} title "${before.titles[i]}" -> "${after.titles[i]}"`);
    }
  }

  return diffs;
}
