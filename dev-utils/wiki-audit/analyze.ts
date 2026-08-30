import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { createClient, queryAll, chunk } from './lib/api.ts';
import { resolveRedirects, extractRequires, extractGadgetRefs, classify } from './analyze/usage.ts';
import type { UsageTier } from './analyze/usage.ts';
import { scoreDoc } from './analyze/docquality.ts';
import type { DocScore } from './analyze/docquality.ts';
import { findPlumbingIssues } from './analyze/plumbing.ts';
import type { Finding } from './analyze/plumbing.ts';
import { describeSource, isUpstream } from './analyze/provenance.ts';
import type { Manifest } from './lib/types.ts';

export interface AuditRow {
  title: string;
  ns: 10 | 828;
  isRoot: boolean;
  tier: UsageTier;
  needsManualReview: boolean;
  transclusions: number;
  transclusionsCapped: boolean;
  doc: DocScore;
  provenance: string;
  isUpstream: boolean;
}

export interface Audit {
  fetchedAt: string;
  coverage: {
    template: { roots: number; documented: number; missing: number };
    module: { roots: number; documented: number; missing: number };
  };
  rows: AuditRow[];
  findings: Finding[];
  provenanceSummary: Record<string, number>;
}

const isRootTitle = (t: string) => !t.slice(t.indexOf(':') + 1).includes('/');

export function buildAudit(
  m: Manifest,
  contents: Map<string, string>,
  transclusions: Map<string, { count: number; capped: boolean; from: string[] }>,
  gadgetText: string,
): Audit {
  const byTitle = new Map(m.entries.map((e) => [e.title, e]));
  const canonical = resolveRedirects(m);

  // Reverse index: which modules require which, resolved through redirects.
  const requiredBy = new Map<string, string[]>();
  for (const e of m.entries) {
    if (e.model !== 'Scribunto') continue;
    for (const dep of extractRequires(contents.get(e.title) ?? '')) {
      const target = canonical.get(dep) ?? dep;
      if (!requiredBy.has(target)) requiredBy.set(target, []);
      requiredBy.get(target)!.push(e.title);
    }
  }

  const gadgetRefTargets = new Set(extractGadgetRefs(gadgetText).map((t) => canonical.get(t) ?? t));

  const rows: AuditRow[] = m.entries
    .filter((e) => !e.redirect)
    .map((e) => {
      const tr = transclusions.get(e.title) ?? { count: 0, capped: false, from: [] };
      const source = contents.get(e.title) ?? '';
      const doc = scoreDoc({
        doc: byTitle.has(`${e.title}/doc`) ? (contents.get(`${e.title}/doc`) ?? '') : undefined,
        source,
        hasStylesPage: byTitle.has(`${e.title}/styles.css`),
      });
      const { tier, needsManualReview } = classify({
        transclusions: tr.count,
        transcludedFrom: tr.from,
        requiredBy: requiredBy.get(e.title) ?? [],
        gadgetRefs: gadgetRefTargets.has(e.title) ? ['gadget'] : [],
        dynamic: e.model === 'Scribunto' && /\.\s*\.\s*|\bconcat\b/.test(source),
      });
      return {
        title: e.title,
        ns: e.ns,
        isRoot: isRootTitle(e.title),
        tier,
        needsManualReview,
        transclusions: tr.count,
        transclusionsCapped: tr.capped,
        doc,
        provenance: describeSource(e.firstRevision?.sourceWiki ?? ''),
        isUpstream: isUpstream(e.firstRevision),
      };
    });

  function coverageFor(ns: 10 | 828) {
    const roots = rows.filter((r) => r.ns === ns && r.isRoot);
    const documented = roots.filter((r) => r.doc.hasDoc).length;
    return { roots: roots.length, documented, missing: roots.length - documented };
  }

  const provenanceSummary: Record<string, number> = {};
  for (const r of rows.filter((x) => x.isRoot)) {
    provenanceSummary[r.provenance] = (provenanceSummary[r.provenance] ?? 0) + 1;
  }

  return {
    fetchedAt: m.fetchedAt,
    coverage: { template: coverageFor(10), module: coverageFor(828) },
    rows,
    findings: findPlumbingIssues(m),
    provenanceSummary,
  };
}

export async function loadContents(m: Manifest): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const e of m.entries) {
    try {
      out.set(e.title, await readFile(e.path, 'utf8'));
    } catch {
      // Absent file: the page simply contributes no content edges.
    }
  }
  return out;
}

export async function loadGadgetText(dir: string): Promise<string> {
  let all = '';
  try {
    for (const f of await readdir(dir)) {
      if (/\.(js|css)$/.test(f)) all += (await readFile(join(dir, f), 'utf8')) + '\n';
    }
  } catch {
    // Snapshot absent — gadget edges are simply unavailable.
  }
  return all;
}

export async function fetchTransclusions(apiUrl: string, titles: string[]) {
  const client = createClient(apiUrl, 'UtaiteWikiDocAudit/1.0 (read-only)');
  const out = new Map<string, { count: number; capped: boolean; from: string[] }>();
  const batches = chunk(titles, 50);
  for (const [i, batch] of batches.entries()) {
    process.stdout.write(`\r  transclusions ${i + 1}/${batches.length}`);
    const pages = await queryAll(
      client,
      { action: 'query', prop: 'transcludedin', titles: batch.join('|'), tilimit: '500' },
      (d) => d.query?.pages ?? [],
    );
    for (const p of pages) {
      const from = (p.transcludedin ?? []).map((x: any) => x.title);
      const prev = out.get(p.title) ?? { count: 0, capped: false, from: [] };
      prev.from.push(...from);
      prev.count = prev.from.length;
      prev.capped = prev.count >= 500;
      out.set(p.title, prev);
    }
  }
  process.stdout.write('\n');
  return out;
}
