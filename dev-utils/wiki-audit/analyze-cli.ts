import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { buildAudit, loadContents, loadGadgetText, fetchTransclusions } from './analyze.ts';
import type { Manifest } from './lib/types.ts';

const root = resolve(import.meta.dirname, '../..');
const manifest: Manifest = JSON.parse(await readFile(resolve(root, 'wiki/_manifest.json'), 'utf8'));

const contents = await loadContents(manifest);
const gadgetText = await loadGadgetText(resolve(root, 'live-snapshot.local'));

const apiUrl = process.env.WIKI_API_URL;
if (!apiUrl) throw new Error('WIKI_API_URL is not set');

console.log('Fetching transclusion counts...');
const transclusions = await fetchTransclusions(
  apiUrl,
  manifest.entries.filter((e) => !e.redirect).map((e) => e.title),
);

const audit = buildAudit(manifest, contents, transclusions, gadgetText);
await writeFile(resolve(root, 'wiki-audit.json'), JSON.stringify(audit, null, 2) + '\n', 'utf8');
console.log(`Wrote wiki-audit.json — ${audit.rows.length} rows, ${audit.findings.length} findings.`);
