import { rankPriority, splitBacklog, deletionCandidates, escapeHtml, renderReport } from './report.ts';
import type { AuditRow, Audit } from './analyze.ts';

function row(over: Partial<AuditRow> = {}): AuditRow {
  return {
    title: 'Template:X',
    ns: 10,
    isRoot: true,
    tier: 'USED',
    needsManualReview: false,
    transclusions: 0,
    transclusionsCapped: false,
    provenance: 'written on this wiki',
    isUpstream: false,
    doc: {
      hasDoc: false,
      sizeTier: 'none',
      hasTemplateData: false,
      hasHeader: false,
      mentionsStyles: true,
      undocumentedParams: [],
      gap: 25,
    },
    ...over,
  };
}

describe('rankPriority — usage x doc-gap', () => {
  test('ranks a heavily used undocumented template above a rarely used one', () => {
    const ranked = rankPriority([
      row({ title: 'Template:Rare', transclusions: 1 }),
      row({ title: 'Template:Common', transclusions: 900 }),
    ]);
    expect(ranked[0].title).toBe('Template:Common');
  });

  test('ranks a bigger doc gap above a smaller one at equal usage', () => {
    const ranked = rankPriority([
      row({ title: 'Template:Small', transclusions: 10, doc: { ...row().doc, gap: 5 } }),
      row({ title: 'Template:Big', transclusions: 10, doc: { ...row().doc, gap: 80 } }),
    ]);
    expect(ranked[0].title).toBe('Template:Big');
  });

  test('excludes fully documented rows with no gap', () => {
    const ranked = rankPriority([row({ doc: { ...row().doc, hasDoc: true, gap: 0 } })]);
    expect(ranked).toHaveLength(0);
  });

  test('excludes non-root pages', () => {
    expect(rankPriority([row({ isRoot: false })])).toHaveLength(0);
  });
});

describe('splitBacklog — write vs source', () => {
  test('separates native from upstream', () => {
    const { write, source } = splitBacklog([
      row({ title: 'Module:Utaite', isUpstream: false }),
      row({ title: 'Module:Yesno', isUpstream: true }),
    ]);
    expect(write.map((r) => r.title)).toEqual(['Module:Utaite']);
    expect(source.map((r) => r.title)).toEqual(['Module:Yesno']);
  });

  test('keeps the incoming order within each half', () => {
    const { write } = splitBacklog([
      row({ title: 'Template:First' }),
      row({ title: 'Template:Second' }),
    ]);
    expect(write.map((r) => r.title)).toEqual(['Template:First', 'Template:Second']);
  });
});

describe('deletionCandidates', () => {
  test('includes UNUSED and DOC-ONLY', () => {
    const got = deletionCandidates([
      row({ title: 'Template:Dead', tier: 'UNUSED' }),
      row({ title: 'Template:DocOnly', tier: 'DOC-ONLY' }),
    ]);
    expect(got.map((r) => r.title).sort()).toEqual(['Template:DocOnly', 'Template:Dead'].sort());
  });

  test('never includes INTERNAL, which is alive but invisible', () => {
    expect(deletionCandidates([row({ tier: 'INTERNAL' })])).toHaveLength(0);
  });

  test('never includes USED', () => {
    expect(deletionCandidates([row({ tier: 'USED' })])).toHaveLength(0);
  });

  test('excludes non-root pages', () => {
    expect(deletionCandidates([row({ tier: 'UNUSED', isRoot: false })])).toHaveLength(0);
  });

  test('sorts rows needing manual review last, so confident candidates lead', () => {
    const got = deletionCandidates([
      row({ title: 'Template:Unsure', tier: 'UNUSED', needsManualReview: true }),
      row({ title: 'Template:Confident', tier: 'UNUSED', needsManualReview: false }),
    ]);
    expect(got[0].title).toBe('Template:Confident');
  });
});

describe('escapeHtml', () => {
  test('escapes the characters that could break out of markup', () => {
    expect(escapeHtml('<script>&"\'')).toBe('&lt;script&gt;&amp;&quot;&#39;');
  });

  test('leaves ordinary text alone', () => {
    expect(escapeHtml('Template:Uptodate')).toBe('Template:Uptodate');
  });
});

describe('renderReport', () => {
  const audit: Audit = {
    fetchedAt: '2026-08-30T00:00:00Z',
    coverage: {
      template: { roots: 483, documented: 377, missing: 106 },
      module: { roots: 83, documented: 38, missing: 45 },
    },
    rows: [row({ title: 'Template:Dead', tier: 'UNUSED' })],
    findings: [{ kind: 'doc-redirect-circular', title: 'Template:X/doc', detail: 'circular' }],
    provenanceSummary: { 'written on this wiki': 19, 'mediawiki.org': 16 },
  };

  test('produces a standalone document with a title', () => {
    const html = renderReport(audit);
    expect(html).toContain('<title>');
  });

  test('references no external scripts or images', () => {
    const html = renderReport(audit);
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<img[^>]+src="http/);
  });

  test('links nothing external except the two permitted Google Fonts hosts', () => {
    const html = renderReport(audit);
    const external = [...html.matchAll(/<link[^>]+href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
    expect(external.length).toBeGreaterThan(0);
    for (const url of external) {
      expect(url).toMatch(/^https:\/\/fonts\.(googleapis|gstatic)\.com/);
    }
  });

  test('shows the headline coverage numbers', () => {
    const html = renderReport(audit);
    expect(html).toContain('483');
    expect(html).toContain('106');
  });

  test('escapes titles so wiki markup cannot break the page', () => {
    const html = renderReport({ ...audit, rows: [row({ title: 'Template:<script>alert(1)</script>' })] });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('defines its palette on bare :root so light is the default', () => {
    expect(renderReport(audit)).toMatch(/:root\s*\{/);
  });

  test('adapts to both dark-mode signals', () => {
    const html = renderReport(audit);
    expect(html).toContain('prefers-color-scheme: dark');
    expect(html).toContain('[data-theme="dark"]');
  });
});
