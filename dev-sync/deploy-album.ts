/**
 * Targeted deploy for the album work.
 *
 * `sync.ts` pushes every built gadget file, which is unsafe here: the live
 * MediaWiki:Gadget-Datatables.css has ~500 lines of design-token CSS that the
 * repo's Datatables.less never received, so a straight overwrite destroys it.
 * This script therefore pushes only the pages the album change touches, and
 * treats that one file as append-only.
 *
 * Runs a dry run by default. Pass --write to actually save.
 *
 *   node --env-file=.env dev-sync/deploy-album.ts
 *   node --env-file=.env dev-sync/deploy-album.ts --write
 */
import { Mwn } from 'mwn';
import { readFile } from 'fs/promises';

const WRITE = process.argv.includes('--write');

/** Marks the block this script manages inside an append-only page. */
const BLOCK_START = '/* === album filter bar (managed by deploy-album.ts) === */';
const BLOCK_END = '/* === end album filter bar === */';

interface Target {
  page: string;
  file: string;
  /** 'replace' overwrites the page; 'append-block' edits only our marked block. */
  mode: 'replace' | 'append-block';
  summary: string;
}

const TARGETS: Target[] = [
  {
    page: 'MediaWiki:Gadget-citizen-templates.css',
    file: 'dist/gadgets/styling/citizen/citizen-templates.css',
    mode: 'replace',
    summary: 'Album: fixed square cover, metadata grid, adaptive tracklist styles',
  },
  // MediaWiki:Gadget-datatables-helper.js is deliberately NOT deployed.
  //
  // The live gadget carries a ColVis dropdown (dt-colvis-btn / -panel /
  // -wrapper / -item) that the repo source has never had — live holds both
  // that dropdown and the inline toggles, so it is a superset and replacing
  // it would delete the dropdown. Porting it into datatables-helper.ts is
  // real reconciliation work, tracked separately.
  //
  // Consequence: the sectioned-tracklist filter bar stays inactive until then.
  // It degrades cleanly — the tracklist itself is rendered by Module:Album and
  // is unaffected.
  {
    page: 'MediaWiki:Gadget-Datatables.css',
    file: 'dist/gadgets/core/datatables/Datatables.css',
    mode: 'append-block',
    summary: 'Album: filter bar styles for sectioned tracklists',
  },
];

/** Pulls just the album-filter rules out of the built stylesheet. */
function albumFilterBlock(built: string): string {
  const rules = [...built.matchAll(/\.album-filter[^{]*\{[^}]*\}/g)].map((m) => m[0].trim());
  if (!rules.length) throw new Error('no .album-filter rules found in the built stylesheet');
  return [BLOCK_START, ...rules, BLOCK_END].join('\n');
}

/** Replaces our managed block if present, otherwise appends it. */
function applyBlock(live: string, block: string): string {
  const start = live.indexOf(BLOCK_START);
  if (start === -1) return live.trimEnd() + '\n\n' + block + '\n';
  const end = live.indexOf(BLOCK_END, start);
  if (end === -1) return live.trimEnd() + '\n\n' + block + '\n';
  return live.slice(0, start) + block + live.slice(end + BLOCK_END.length);
}

async function initBot(): Promise<Mwn> {
  const bot = new Mwn({
    apiUrl: process.env.WIKI_API_URL,
    username: process.env.BOT_USERNAME,
    password: process.env.BOT_PASSWORD,
    userAgent: process.env.BOT_USERAGENT,
    OAuth2AccessToken: process.env.BOT_OAUTH_ACCESS_TOKEN,
    silent: true,
    retryPause: 5000,
    maxRetries: 5,
  });

  if (process.env.BOT_USERNAME && process.env.BOT_PASSWORD) {
    await bot.login({
      apiUrl: process.env.WIKI_API_URL,
      username: process.env.BOT_USERNAME,
      password: process.env.BOT_PASSWORD,
    });
  } else {
    bot.initOAuth();
    await bot.getTokensAndSiteInfo();
  }
  return bot;
}

async function main(): Promise<void> {
  const bot = await initBot();
  console.log(`logged in as ${process.env.BOT_USERNAME}`);
  console.log(WRITE ? 'MODE: write\n' : 'MODE: dry run (pass --write to save)\n');

  for (const target of TARGETS) {
    const built = await readFile(target.file, 'utf8');
    const live = (await bot.read(target.page))?.revisions?.[0]?.content ?? '';

    const next =
      target.mode === 'replace' ? built : applyBlock(live, albumFilterBlock(built));

    const liveLines = live.split('\n');
    const nextLines = next.split('\n');
    const nextSet = new Set(nextLines.map((l) => l.trimEnd()));
    const lost = liveLines.filter((l) => l.trim() !== '' && !nextSet.has(l.trimEnd()));

    console.log(`${target.page}`);
    console.log(`   mode ${target.mode}  live ${liveLines.length} -> ${nextLines.length} lines`);
    console.log(`   lines present live but not in the new text: ${lost.length}`);
    if (target.mode === 'append-block' && lost.length) {
      console.log('   REFUSING: append-block must never drop live lines');
      for (const l of lost.slice(0, 10)) console.log(`     ${l}`);
      process.exitCode = 1;
      continue;
    }

    if (live.replace(/\r\n/g, '\n').trimEnd() === next.replace(/\r\n/g, '\n').trimEnd()) {
      console.log('   unchanged, skipping\n');
      continue;
    }

    if (!WRITE) {
      console.log('   would save\n');
      continue;
    }

    await bot.save(target.page, next, target.summary);
    console.log('   saved\n');
  }
}

await main();
