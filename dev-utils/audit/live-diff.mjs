#!/usr/bin/env node
/**
 * Compare the built dist/ against a snapshot of the live wiki's code pages.
 *
 * Usage: node dev-utils/audit/live-diff.mjs <snapshot-dir> [--only=<substring>]
 *
 * <snapshot-dir> holds one file per page, named like the page without "MediaWiki:"
 * (e.g. "Gadget-userblog.js", "Gadgets-definition", "Common.css").
 *
 * Both sides are normalised before comparing, so build-formatting churn doesn't count:
 *  - the auto-generated "/*! ... *\/" banner is stripped
 *  - JS and CSS go through esbuild (whitespace + syntax minification, names kept,
 *    target es2018, so `?.` on the live side is lowered the same way Vite lowers it)
 *  - JSON is parsed and re-serialised
 *
 * SAME_MODULO_LOCALS means identical once a leading `_` on identifiers is ignored
 * (unused parameters are renamed `e` -> `_e` for the type checker); everything
 * else still has to match.
 *
 * Writes <snapshot-dir>/_diff-report.json and, for every DIFF, readable
 * <snapshot-dir>/_diffs/<page>.{built,live}.txt (esbuild-formatted) to diff by eye.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { createRequire } from 'node:module';

// esbuild isn't a direct dependency (pnpm doesn't hoist it); borrow Vite's copy
const requireFromVite = createRequire(createRequire(import.meta.url).resolve('vite'));
const { transformSync } = requireFromVite('esbuild');

const args = process.argv.slice(2);
const snapDir = args.find(a => !a.startsWith('--'));
const only = (args.find(a => a.startsWith('--only=')) || '').slice('--only='.length);
if (!snapDir) {
  console.error('usage: node dev-utils/audit/live-diff.mjs <snapshot-dir> [--only=<substring>]');
  process.exit(1);
}
const distDir = 'dist';

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** page name (without "MediaWiki:") -> built file path, mirroring dev-sync/sync.ts */
function builtPages() {
  const map = new Map();
  const gadgetsDir = join(distDir, 'gadgets');
  for (const file of walk(gadgetsDir)) {
    const rel = file.slice(gadgetsDir.length + 1).split(/[\\/]/);
    if (rel.length === 1) {
      if (rel[0] === 'gadgets-definition.wikitext') map.set('Gadgets-definition', file);
      continue;
    }
    // dist/gadgets/<section>/<gadget>/<file>
    if (rel.length === 3) map.set(`Gadget-${rel[2]}`, file);
  }
  const mwDir = join(distDir, 'mediawiki');
  if (existsSync(mwDir)) {
    for (const file of walk(mwDir)) map.set(basename(file), file);
  }
  return map;
}

function stripBanner(src) {
  return src.replace(/^﻿?\s*\/\*![\s\S]*?\*\/\s*/, '');
}

function normalise(page, src, pretty = false, renameLocals = false) {
  src = stripBanner(src.replace(/\r\n/g, '\n'));
  const ext = extname(page);
  // unused parameters get a `_` prefix for the type checker; ignore just that rename
  if (renameLocals) src = src.replace(/(?<![\w$.])_([A-Za-z$][\w$]*)/g, '$1');
  try {
    if (ext === '.js') {
      return transformSync(src, {
        loader: 'js', target: 'es2018', legalComments: 'none',
        minifyWhitespace: !pretty, minifySyntax: true, keepNames: true,
      }).code;
    }
    if (ext === '.css') {
      return transformSync(src, {
        loader: 'css', legalComments: 'none', minifyWhitespace: !pretty, minifySyntax: true,
      }).code;
    }
    if (ext === '.json') {
      return JSON.stringify(JSON.parse(src), null, pretty ? 2 : 0);
    }
  } catch (e) {
    return `/* NORMALISE-ERROR ${e.message.split('\n')[0]} */\n` + src;
  }
  // wikitext (Gadgets-definition): compare line by line, ignoring trailing space and blank lines
  return src.split('\n').map(l => l.trimEnd()).filter(Boolean).join('\n');
}

const built = builtPages();
const livePages = new Set(readdirSync(snapDir).filter(f => !f.startsWith('_')));
const definition = existsSync(join(snapDir, 'Gadgets-definition'))
  ? readFileSync(join(snapDir, 'Gadgets-definition'), 'utf8') : '';
// "* name[ResourceLoader|...]|a.js|b.css" lines; commented-out gadgets don't count
const registered = new Set(
  definition.split('\n')
    .filter(line => line.startsWith('*'))
    .flatMap(line => line.slice(line.indexOf(']') + 1).split('|').map(f => f.trim()).filter(Boolean))
    .map(f => `Gadget-${f}`)
);

const report = { generated: new Date().toISOString(), snapshot: snapDir, pages: [] };
// stale diffs from an earlier run would look like current ones
if (!only) rmSync(join(snapDir, '_diffs'), { recursive: true, force: true });
mkdirSync(join(snapDir, '_diffs'), { recursive: true });

const names = new Set([...built.keys(), ...livePages]);
for (const page of [...names].sort()) {
  if (only && !page.includes(only)) continue;
  const builtFile = built.get(page);
  const isLive = livePages.has(page);
  let status;
  if (builtFile && isLive) {
    const b = normalise(page, readFileSync(builtFile, 'utf8'));
    const l = normalise(page, readFileSync(join(snapDir, page), 'utf8'));
    status = b === l ? 'SAME' : 'DIFF';
    if (status === 'DIFF' && extname(page) === '.js'
      && normalise(page, readFileSync(builtFile, 'utf8'), false, true)
        === normalise(page, readFileSync(join(snapDir, page), 'utf8'), false, true)) {
      status = 'SAME_MODULO_LOCALS';
    }
    if (status === 'DIFF') {
      const safe = page.replace(/[\\/:]/g, '_');
      writeFileSync(join(snapDir, '_diffs', `${safe}.built.txt`), normalise(page, readFileSync(builtFile, 'utf8'), true));
      writeFileSync(join(snapDir, '_diffs', `${safe}.live.txt`), normalise(page, readFileSync(join(snapDir, page), 'utf8'), true));
    }
  } else if (builtFile) {
    status = 'MISSING_ON_LIVE';
  } else {
    status = registered.has(page) || page === 'Gadgets-definition' ? 'LIVE_ONLY' : 'LIVE_ONLY_UNREGISTERED';
  }
  report.pages.push({ page, status, built: builtFile || null });
}

writeFileSync(join(snapDir, '_diff-report.json'), JSON.stringify(report, null, 1));
const counts = {};
for (const p of report.pages) counts[p.status] = (counts[p.status] || 0) + 1;
for (const status of ['SAME_MODULO_LOCALS', 'DIFF', 'MISSING_ON_LIVE', 'LIVE_ONLY', 'LIVE_ONLY_UNREGISTERED']) {
  const list = report.pages.filter(p => p.status === status).map(p => p.page);
  if (list.length) console.log(`\n${status} (${list.length}):\n  ${list.join('\n  ')}`);
}
console.log('\nTotals:', counts);
