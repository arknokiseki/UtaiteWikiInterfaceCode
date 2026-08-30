import { buildAudit } from './analyze.ts';
import type { Manifest } from './lib/types.ts';

const empty = new Map<string, { count: number; capped: boolean; from: string[] }>();

function manifest(entries: any[]): Manifest {
  return { fetchedAt: '2026-08-30T00:00:00Z', apiUrl: '', entries };
}

describe('buildAudit', () => {
  test('computes coverage over real roots only, excluding redirects', () => {
    const m = manifest([
      { title: 'Template:A', ns: 10, redirect: false, model: 'wikitext', path: 'p1' },
      { title: 'Template:A/doc', ns: 10, redirect: false, model: 'wikitext', path: 'p2' },
      { title: 'Template:B', ns: 10, redirect: false, model: 'wikitext', path: 'p3' },
      { title: 'Template:C', ns: 10, redirect: true, redirectTarget: 'Template:A', model: 'wikitext', path: 'p4' },
    ]);
    const audit = buildAudit(m, new Map(), empty, '');
    expect(audit.coverage.template.roots).toBe(2);
    expect(audit.coverage.template.documented).toBe(1);
    expect(audit.coverage.template.missing).toBe(1);
  });

  test('counts module coverage separately from template coverage', () => {
    const m = manifest([
      { title: 'Template:A', ns: 10, redirect: false, model: 'wikitext', path: 'p1' },
      { title: 'Module:B', ns: 828, redirect: false, model: 'Scribunto', path: 'p2' },
      { title: 'Module:B/doc', ns: 828, redirect: false, model: 'wikitext', path: 'p3' },
    ]);
    const audit = buildAudit(m, new Map(), empty, '');
    expect(audit.coverage.module).toEqual({ roots: 1, documented: 1, missing: 0 });
    expect(audit.coverage.template).toEqual({ roots: 1, documented: 0, missing: 1 });
  });

  test('splits the backlog by provenance', () => {
    const m = manifest([
      {
        title: 'Module:Native', ns: 828, redirect: false, model: 'Scribunto', path: 'a',
        firstRevision: { user: 'Ark', timestamp: '', comment: '', sourceWiki: '' },
      },
      {
        title: 'Module:Imported', ns: 828, redirect: false, model: 'Scribunto', path: 'b',
        firstRevision: { user: 'mw>X', timestamp: '', comment: '', sourceWiki: 'mw' },
      },
    ]);
    const audit = buildAudit(m, new Map(), empty, '');
    const undocumented = audit.rows.filter((r) => r.isRoot && !r.doc.hasDoc);
    expect(undocumented.filter((r) => r.isUpstream)).toHaveLength(1);
    expect(undocumented.filter((r) => !r.isUpstream)).toHaveLength(1);
  });

  test('a module required by another module is INTERNAL, not UNUSED', () => {
    const m = manifest([
      { title: 'Module:Yesno', ns: 828, redirect: false, model: 'Scribunto', path: 'a' },
      { title: 'Module:Caller', ns: 828, redirect: false, model: 'Scribunto', path: 'b' },
    ]);
    const contents = new Map([
      ['Module:Caller', "require('Module:Yesno')"],
      ['Module:Yesno', 'return {}'],
    ]);
    const audit = buildAudit(m, contents, empty, '');
    expect(audit.rows.find((r) => r.title === 'Module:Yesno')!.tier).toBe('INTERNAL');
  });

  test('a template referenced only by a gadget is USED', () => {
    const m = manifest([{ title: 'Template:Uptodate', ns: 10, redirect: false, model: 'wikitext', path: 'a' }]);
    const audit = buildAudit(m, new Map(), empty, "api.edit('Template:Uptodate')");
    expect(audit.rows.find((r) => r.title === 'Template:Uptodate')!.tier).toBe('USED');
  });

  test('a gadget reference to a redirect credits the target', () => {
    const m = manifest([
      { title: 'Template:Yt', ns: 10, redirect: false, model: 'wikitext', path: 'a' },
      { title: 'Template:YT', ns: 10, redirect: true, redirectTarget: 'Template:Yt', model: 'wikitext', path: 'b' },
    ]);
    const audit = buildAudit(m, new Map(), empty, "'Template:YT'");
    expect(audit.rows.find((r) => r.title === 'Template:Yt')!.tier).toBe('USED');
  });

  test('excludes redirects from the rows', () => {
    const m = manifest([
      { title: 'Template:A', ns: 10, redirect: false, model: 'wikitext', path: 'a' },
      { title: 'Template:B', ns: 10, redirect: true, redirectTarget: 'Template:A', model: 'wikitext', path: 'b' },
    ]);
    expect(buildAudit(m, new Map(), empty, '').rows.map((r) => r.title)).toEqual(['Template:A']);
  });

  test('carries transclusion counts and the cap flag', () => {
    const m = manifest([{ title: 'Template:A', ns: 10, redirect: false, model: 'wikitext', path: 'a' }]);
    const tr = new Map([['Template:A', { count: 500, capped: true, from: ['Article'] }]]);
    const row = buildAudit(m, new Map(), tr, '').rows[0];
    expect(row.transclusions).toBe(500);
    expect(row.transclusionsCapped).toBe(true);
  });

  test('notes a stylesheet the doc does not mention', () => {
    const m = manifest([
      { title: 'Template:A', ns: 10, redirect: false, model: 'wikitext', path: 'a' },
      { title: 'Template:A/styles.css', ns: 10, redirect: false, model: 'sanitized-css', path: 'b' },
      { title: 'Template:A/doc', ns: 10, redirect: false, model: 'wikitext', path: 'c' },
    ]);
    const contents = new Map([['Template:A/doc', 'says nothing about styling']]);
    expect(buildAudit(m, contents, empty, '').rows.find((r) => r.title === 'Template:A')!.doc.mentionsStyles).toBe(false);
  });

  test('includes plumbing findings', () => {
    const m = manifest([
      { title: 'Template:X', ns: 10, redirect: false, model: 'wikitext', path: 'a' },
      { title: 'Template:X/doc', ns: 10, redirect: true, redirectTarget: 'Template:X', model: 'wikitext', path: 'b' },
    ]);
    expect(buildAudit(m, new Map(), empty, '').findings.map((f) => f.kind)).toContain('doc-redirect-circular');
  });

  test('summarises provenance by human label', () => {
    const m = manifest([
      {
        title: 'Module:A', ns: 828, redirect: false, model: 'Scribunto', path: 'a',
        firstRevision: { user: 'mw>X', timestamp: '', comment: '', sourceWiki: 'mw' },
      },
    ]);
    expect(buildAudit(m, new Map(), empty, '').provenanceSummary['mediawiki.org']).toBe(1);
  });
});
