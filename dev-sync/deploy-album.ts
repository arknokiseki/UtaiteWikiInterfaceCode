/**
 * Targeted deploy for the album work's wiki pages (Module:Album, AlbumType2,
 * Track), which live in wiki/ and which `sync.ts` does not handle.
 *
 * It used to push three gadget pages too (citizen-templates.css,
 * datatables-helper.js and an append-only block in Datatables.css), because
 * the repo's gadget source was behind live at the time. Since the 2026-10-03
 * reconciliation src/ matches live and those pages go through `sync.ts` like
 * every other gadget; pushing them here would bypass that check, and the
 * append-only block would be added a second time (the build strips the
 * comments that marked it).
 *
 * Runs a dry run by default. Pass --write to actually save.
 *
 *   node --env-file=.env dev-sync/deploy-album.ts
 *   node --env-file=.env dev-sync/deploy-album.ts --write
 */
import { Mwn } from 'mwn';
import { readFile } from 'fs/promises';

const WRITE = process.argv.includes('--write');

interface Target {
  page: string;
  file: string;
  /** 'replace' overwrites the page. */
  mode: 'replace';
  summary: string;
}

const TARGETS: Target[] = [
  {
    // The repo is authoritative for this one: it originated here and every
    // live revision so far was pasted from it. The dry run still reports any
    // line that would be lost, which would reveal an edit made on-wiki.
    page: 'Module:Album',
    file: 'wiki/modules/Album.lua',
    mode: 'replace',
    summary: 'Album: embed crossfades and Spotify, drop thead/tbody',
  },
  // ORDER MATTERS. AlbumType2 must land before Track.
  //
  // Module:Album passes pre-migration <tr> output straight through, so the new
  // template renders correctly while the old {{Track}} is still live. The
  // reverse is not true: the old AlbumType2 splices whatever |track= holds
  // into a <table> expecting rows, so records land as visible separator text.
  // That is exactly how the first attempt broke all 166 pages.
  {
    page: 'Template:AlbumType2',
    file: 'wiki/templates/AlbumType2.wikitext',
    mode: 'replace',
    summary: 'Album: render via Module:Album; Bucket collab index unchanged',
  },
  {
    page: 'Template:Track',
    file: 'wiki/templates/Track.wikitext',
    mode: 'replace',
    summary: 'Album: emit delimited records instead of <tr> markup',
  },
];

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

    const next = built;

    const liveLines = live.split('\n');
    const nextLines = next.split('\n');
    const nextSet = new Set(nextLines.map((l) => l.trimEnd()));
    const lost = liveLines.filter((l) => l.trim() !== '' && !nextSet.has(l.trimEnd()));

    console.log(`${target.page}`);
    console.log(`   mode ${target.mode}  live ${liveLines.length} -> ${nextLines.length} lines`);
    console.log(`   lines present live but not in the new text: ${lost.length}`);

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
