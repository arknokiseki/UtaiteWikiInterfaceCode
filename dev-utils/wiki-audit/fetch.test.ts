import { buildManifest, renderRedirectsTsv, EXCLUDED_TITLES } from './fetch.ts';
import type { RawPage } from './fetch.ts';

function page(over: Partial<RawPage> = {}): RawPage {
  return {
    title: 'Template:Uptodate',
    ns: 10,
    model: 'wikitext',
    length: 10,
    sha1: 'abc',
    revid: 1,
    timestamp: '2026-01-01T00:00:00Z',
    redirect: false,
    content: 'x',
    ...over,
  };
}

describe('buildManifest', () => {
  test('assigns a path to every page', () => {
    const m = buildManifest([page(), page({ title: 'Module:Yesno', ns: 828, model: 'Scribunto' })]);
    expect(m.entries).toHaveLength(2);
    expect(m.entries.find((e) => e.title === 'Module:Yesno')!.path).toBe('wiki/modules/Yesno.lua');
  });

  test('records redirect status and target', () => {
    const m = buildManifest([page({ title: 'Template:YT', redirect: true, redirectTarget: 'Template:Yt' })]);
    expect(m.entries[0].redirect).toBe(true);
    expect(m.entries[0].redirectTarget).toBe('Template:Yt');
  });

  test('omits redirectTarget for non-redirects', () => {
    const m = buildManifest([page()]);
    expect(m.entries[0].redirectTarget).toBeUndefined();
  });

  test('drops owner-excluded titles', () => {
    const m = buildManifest([page(), page({ title: 'Template:Utaite Spotlight/*natsuki' })]);
    expect(m.entries.map((e) => e.title)).not.toContain('Template:Utaite Spotlight/*natsuki');
    expect(EXCLUDED_TITLES).toContain('Template:Utaite Spotlight/*natsuki');
  });

  test('gives colliding titles distinct paths', () => {
    const m = buildManifest([page({ title: 'Template:Yt' }), page({ title: 'Template:YT' })]);
    const paths = m.entries.map((e) => e.path);
    expect(new Set(paths).size).toBe(2);
  });

  test('sorts entries by title', () => {
    const m = buildManifest([page({ title: 'Template:Zeta' }), page({ title: 'Template:Alpha' })]);
    expect(m.entries.map((e) => e.title)).toEqual(['Template:Alpha', 'Template:Zeta']);
  });

  test('stamps the fetch time', () => {
    const m = buildManifest([page()]);
    expect(m.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('carries revision metadata through', () => {
    const m = buildManifest([page({ revid: 42, sha1: 'deadbeef', length: 99 })]);
    expect(m.entries[0]).toMatchObject({ revid: 42, sha1: 'deadbeef', length: 99 });
  });
});

describe('renderRedirectsTsv', () => {
  test('emits sorted from-tab-to lines for redirects only', () => {
    const m = buildManifest([
      page({ title: 'Template:YT', redirect: true, redirectTarget: 'Template:Yt' }),
      page({ title: 'Template:Ytc', redirect: true, redirectTarget: 'Template:YtC' }),
      page({ title: 'Template:Uptodate' }),
    ]);
    expect(renderRedirectsTsv(m)).toBe('Template:YT\tTemplate:Yt\nTemplate:Ytc\tTemplate:YtC\n');
  });

  test('returns an empty string when there are no redirects', () => {
    expect(renderRedirectsTsv(buildManifest([page()]))).toBe('');
  });
});
