/**
 * Renders every AlbumType2 page twice — as it currently stands, and against a
 * sandbox template — and reports any page whose track set changes.
 *
 * Requests are issued one at a time with a delay between them: batching
 * uncached action=parse calls against these pages returned HTTP 503 during
 * research, and these are among the most expensive pages on the wiki.
 *
 * Read-only. No write method is imported.
 *
 * Usage:
 *   node --env-file=.env dev-utils/wiki-audit/album-parity-cli.ts [pageListJson]
 */
import { readFile, writeFile } from 'fs/promises';
import { createClient } from './lib/api.ts';
import { extractTrackFacts, compare } from './album-parity.ts';

const UA = 'UtaiteWikiAlbumParity/1.0 (repo tooling; read-only)';
const DELAY_MS = 1500;
const SANDBOX = 'AlbumType2/sandbox';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface Failure {
  page: string;
  diffs: string[];
}

async function main(): Promise<void> {
  const apiUrl = process.env.WIKI_API_URL;
  if (!apiUrl) {
    console.error('WIKI_API_URL is not set. Run with: node --env-file=.env …');
    process.exitCode = 1;
    return;
  }

  const listPath = process.argv[2] ?? '.scratch/data/embeddedin-Template_AlbumType2.json';
  const titles: string[] = JSON.parse(await readFile(listPath, 'utf8'));
  const client = createClient(apiUrl, UA);

  const failures: Failure[] = [];
  const errors: Failure[] = [];

  for (const [i, page] of titles.entries()) {
    const label = `[${i + 1}/${titles.length}] ${page}`;

    try {
      const current = await client.query({ action: 'parse', page, prop: 'text' });
      await sleep(DELAY_MS);

      const source = await client.query({
        action: 'query',
        prop: 'revisions',
        rvprop: 'content',
        rvslots: 'main',
        titles: page,
      });
      const wikitext: string = source.query.pages[0].revisions[0].slots.main.content;

      const candidate = await client.query({
        action: 'parse',
        title: page,
        text: wikitext.replace(/\{\{\s*AlbumType2\s*(?=[|}])/g, `{{${SANDBOX}`),
        prop: 'text',
        contentmodel: 'wikitext',
      });
      await sleep(DELAY_MS);

      const diffs = compare(
        extractTrackFacts(current.parse.text),
        extractTrackFacts(candidate.parse.text),
      );
      if (diffs.length) failures.push({ page, diffs });
      console.log(`${label} ${diffs.length ? `DIFF (${diffs.length})` : 'ok'}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ page, diffs: [message] });
      console.log(`${label} ERROR ${message}`);
      // A 503 means we are pushing too hard; back off before continuing.
      await sleep(DELAY_MS * 4);
    }
  }

  await writeFile('album-parity.json', JSON.stringify({ failures, errors }, null, 1));

  console.log(`\n${failures.length} of ${titles.length} pages differ`);
  if (errors.length) console.log(`${errors.length} pages could not be checked`);
  for (const f of failures) {
    console.log(`\n${f.page}`);
    for (const d of f.diffs) console.log(`  ${d}`);
  }

  if (failures.length || errors.length) process.exitCode = 1;
}

await main();
