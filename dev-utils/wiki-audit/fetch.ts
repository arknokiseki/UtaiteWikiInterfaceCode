import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { assignPaths } from './lib/titles.ts';
import { queryAll, chunk } from './lib/api.ts';
import type { WikiQuery } from './lib/api.ts';
import { parseSourceWiki } from './analyze/provenance.ts';
import type { ContentModel, Manifest, ManifestEntry } from './lib/types.ts';

export const EXCLUDED_TITLES = ['Template:Utaite Spotlight/*natsuki'];

export const USER_AGENT = 'UtaiteWikiDocAudit/1.0 (repo tooling; read-only)';

const NAMESPACES = [10, 828] as const;

export interface RawPage {
  title: string;
  ns: number;
  model: ContentModel;
  length: number;
  sha1: string;
  revid: number;
  timestamp: string;
  redirect: boolean;
  redirectTarget?: string;
  content: string;
}

export function buildManifest(pages: RawPage[]): Manifest {
  const kept = pages.filter((p) => !EXCLUDED_TITLES.includes(p.title));
  const paths = assignPaths(kept.map((p) => ({ title: p.title, model: p.model })));

  const entries: ManifestEntry[] = kept.map((p) => ({
    title: p.title,
    path: paths.get(p.title)!,
    ns: p.ns as 10 | 828,
    model: p.model,
    length: p.length,
    sha1: p.sha1,
    revid: p.revid,
    timestamp: p.timestamp,
    redirect: p.redirect,
    ...(p.redirectTarget ? { redirectTarget: p.redirectTarget } : {}),
  }));

  entries.sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
  return { fetchedAt: new Date().toISOString(), apiUrl: process.env.WIKI_API_URL ?? '', entries };
}

export function renderRedirectsTsv(m: Manifest): string {
  return m.entries
    .filter((e) => e.redirect && e.redirectTarget)
    .map((e) => `${e.title}\t${e.redirectTarget}`)
    .sort()
    .map((l) => l + '\n')
    .join('');
}

async function enumeratePages(client: WikiQuery): Promise<Map<string, { ns: number; redirect: boolean }>> {
  const out = new Map<string, { ns: number; redirect: boolean }>();
  for (const ns of NAMESPACES) {
    for (const filter of ['redirects', 'nonredirects'] as const) {
      const pages = await queryAll(
        client,
        {
          action: 'query',
          list: 'allpages',
          apnamespace: String(ns),
          aplimit: '500',
          apfilterredir: filter,
        },
        (d) => d.query.allpages,
      );
      for (const p of pages) out.set(p.title, { ns, redirect: filter === 'redirects' });
    }
  }
  return out;
}

async function fetchContent(
  client: WikiQuery,
  titles: string[],
  meta: Map<string, { ns: number; redirect: boolean }>,
): Promise<RawPage[]> {
  const out: RawPage[] = [];
  const batches = chunk(titles, 50);
  for (const [i, batch] of batches.entries()) {
    process.stdout.write(`\r  content ${i + 1}/${batches.length}`);
    const d = await client.query({
      action: 'query',
      prop: 'revisions|info',
      rvprop: 'content|ids|timestamp|sha1',
      rvslots: 'main',
      titles: batch.join('|'),
    });
    for (const p of d.query.pages ?? []) {
      const rev = p.revisions?.[0];
      if (!rev) continue;
      const slot = rev.slots.main;
      const info = meta.get(p.title)!;
      out.push({
        title: p.title,
        ns: info.ns,
        model: slot.contentmodel as ContentModel,
        length: p.length ?? slot.content.length,
        sha1: rev.sha1 ?? '',
        revid: rev.revid,
        timestamp: rev.timestamp,
        redirect: info.redirect,
        content: slot.content ?? '',
      });
    }
  }
  process.stdout.write('\n');
  return out;
}

async function resolveRedirectTargets(client: WikiQuery, redirects: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const batch of chunk(redirects, 50)) {
    const d = await client.query({ action: 'query', titles: batch.join('|'), redirects: '1' });
    for (const r of d.query.redirects ?? []) out.set(r.from, r.to);
  }
  return out;
}

/**
 * Fetches each root page's FIRST revision, whose interwiki-prefixed username
 * carries the page's provenance.
 *
 * Per-page rvdir=newer is used deliberately. A list=allrevisions&arvdir=newer
 * sweep was measured and rejected: it walks the namespace's entire revision
 * history from 2013 forward and spent 122 requests to resolve only 32 pages.
 * Per-page costs ~568 ms, so ~5.4 minutes for 566 roots, cached by revid.
 */
export async function enrichFirstRevisions(
  client: WikiQuery,
  m: Manifest,
  prior?: Manifest,
): Promise<Manifest> {
  const cache = new Map((prior?.entries ?? []).map((e) => [e.title, e]));
  const isRoot = (t: string) => !t.slice(t.indexOf(':') + 1).includes('/');
  const roots = m.entries.filter((e) => isRoot(e.title));
  const failures: string[] = [];

  for (const [i, e] of roots.entries()) {
    const cached = cache.get(e.title);
    if (cached?.firstRevision && cached.revid === e.revid) {
      e.firstRevision = cached.firstRevision;
      continue;
    }
    if (i % 25 === 0) process.stdout.write(`\r  first revisions ${i}/${roots.length}`);

    // One bad page must not abort a five-minute pass. A page left without
    // firstRevision reads as unknown provenance, which isUpstream() treats as
    // native — keeping it in the write queue, the safe direction.
    let d: any;
    try {
      d = await queryWithRetry(client, {
        action: 'query',
        prop: 'revisions',
        titles: e.title,
        rvdir: 'newer',
        rvlimit: '1',
        rvprop: 'user|timestamp|comment',
      });
    } catch (err) {
      failures.push(`${e.title}: ${(err as Error).message}`);
      continue;
    }

    const rev = d.query?.pages?.[0]?.revisions?.[0];
    if (!rev) continue;
    e.firstRevision = {
      user: rev.user ?? '',
      timestamp: rev.timestamp ?? '',
      comment: rev.comment ?? '',
      sourceWiki: parseSourceWiki(rev.user ?? ''),
    };
  }

  if (failures.length) {
    process.stdout.write('\n');
    console.warn(`  ${failures.length} page(s) failed provenance lookup:`);
    for (const f of failures.slice(0, 10)) console.warn(`    ${f}`);
    if (failures.length > 10) console.warn(`    ...and ${failures.length - 10} more`);
  }
  return m;
}

/** Retries transient API/network failures with a short backoff. */
async function queryWithRetry(
  client: WikiQuery,
  params: Record<string, string>,
  attempts = 3,
): Promise<any> {
  let lastErr: unknown;
  for (let a = 0; a < attempts; a++) {
    try {
      return await client.query(params);
    } catch (err) {
      lastErr = err;
      if (a < attempts - 1) await new Promise((r) => setTimeout(r, 500 * (a + 1)));
    }
  }
  throw lastErr;
}

export async function runFetch(client: WikiQuery, outDir: string): Promise<Manifest> {
  console.log('Enumerating Template and Module namespaces...');
  const meta = await enumeratePages(client);
  console.log(`  ${meta.size} pages`);

  const titles = [...meta.keys()].filter((t) => !EXCLUDED_TITLES.includes(t));
  const pages = await fetchContent(client, titles, meta);

  const redirectTitles = pages.filter((p) => p.redirect).map((p) => p.title);
  const targets = await resolveRedirectTargets(client, redirectTitles);
  for (const p of pages) if (p.redirect) p.redirectTarget = targets.get(p.title);

  const manifest = buildManifest(pages);

  // Reuse the previous manifest's first-revision data where the page has not
  // been edited since, so a re-fetch does not repeat the ~5 minute pass.
  let prior: Manifest | undefined;
  try {
    prior = JSON.parse(await readFile(resolve(outDir, '_manifest.json'), 'utf8'));
  } catch {
    prior = undefined;
  }
  console.log('Collecting first revisions for provenance...');
  await enrichFirstRevisions(client, manifest, prior);
  process.stdout.write('\n');

  console.log('Writing mirror...');
  const byTitle = new Map(pages.map((p) => [p.title, p]));
  const repoRoot = resolve(outDir, '..');
  for (const e of manifest.entries) {
    const abs = resolve(repoRoot, e.path);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, byTitle.get(e.title)!.content, 'utf8');
  }
  await writeFile(resolve(outDir, '_manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  await writeFile(resolve(outDir, '_redirects.tsv'), renderRedirectsTsv(manifest), 'utf8');

  console.log(`Done: ${manifest.entries.length} pages mirrored.`);
  return manifest;
}
