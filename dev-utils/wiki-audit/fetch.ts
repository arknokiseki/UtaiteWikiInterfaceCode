import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { assignPaths } from './lib/titles.ts';
import { queryAll, chunk } from './lib/api.ts';
import type { WikiQuery } from './lib/api.ts';
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
