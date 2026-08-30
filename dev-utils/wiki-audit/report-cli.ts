import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { renderReport } from './report.ts';
import type { Audit } from './analyze.ts';

const root = resolve(import.meta.dirname, '../..');
const audit: Audit = JSON.parse(await readFile(resolve(root, 'wiki-audit.json'), 'utf8'));
const out = resolve(root, 'wiki-audit-report.html');
await writeFile(out, renderReport(audit), 'utf8');
console.log(`Wrote ${out}`);
