import { loadLuaModule, type LuaModule } from './lua-harness';

const MODULE = 'wiki/modules/Album.lua';

function tracks(rows: Record<string, string>[]): string {
  const items = rows.map(
    (r) => `{${Object.entries(r).map(([k, v]) => `['${k}']=${JSON.stringify(v)}`).join(',')}}`,
  );
  return `{${items.join(',')}}`;
}

function many(n: number, group?: string): string {
  const rows = Array.from({ length: n }, (_, i) => ({
    title: `T${i + 1}`,
    n: String(i + 1),
    ...(group ? { group } : {}),
  }));
  return tracks(rows);
}

describe('Module:Album tracklist rendering', () => {
  let m: LuaModule;
  beforeEach(() => {
    m = loadLuaModule(MODULE);
  });

  const render = (t: string, opts = '{}') => m.eval(`M._renderTracklist(${t}, ${opts})`);

  it('emits one table for an unsectioned album', () => {
    const html = render(many(5));
    expect(html.match(/<table/g)).toHaveLength(1);
  });

  it('omits DataTables classes for a small table', () => {
    expect(render(many(5))).not.toContain('dataTable');
  });

  it('adds DataTables classes past the threshold', () => {
    expect(render(many(20))).toContain('dataTable');
  });

  it('respects tablefilter=never', () => {
    expect(render(many(20), `{tablefilter='never'}`)).not.toContain('dataTable');
  });

  it('emits one table per section', () => {
    const t = tracks([
      { title: 'A', n: '1', group: 'Disc 1' },
      { title: 'B', n: '2', group: 'Disc 1' },
      { title: 'C', n: '3', group: 'Disc 2' },
    ]);
    expect(render(t).match(/<table/g)).toHaveLength(2);
  });

  it('never puts a section header inside a table body', () => {
    const t = tracks([
      { title: 'A', n: '1', group: 'Disc 1' },
      { title: 'B', n: '2', group: 'Disc 2' },
    ]);
    const html = render(t);
    expect(html).toContain('album-track-section');
    expect(html).not.toMatch(/<tbody>(?:(?!<\/tbody>)[\s\S])*album-track-section/);
  });

  it('suppresses DataTables on a sectioned album even when large', () => {
    expect(render(many(20, 'Disc 1'))).not.toContain('dataTable');
  });

  it('falls back to the root page name for a blank utaite', () => {
    const t = tracks([{ title: 'A', n: '1' }]);
    expect(render(t, `{root='Mafumafu'}`)).toContain('Mafumafu');
  });

  it('renders a badge for interleaved groups', () => {
    const t = tracks([
      { title: 'A', n: '1', group: 'All editions' },
      { title: 'B', n: '2', group: 'Type A' },
      { title: 'C', n: '3', group: 'All editions' },
    ]);
    const html = render(t);
    expect(html).toContain('album-track-badge');
    expect(html.match(/<table/g)).toHaveLength(1);
  });

  it('escapes nothing in title values, so wikitext still expands', () => {
    const t = tracks([{ title: '[[Melt]]', n: '1' }]);
    expect(render(t)).toContain('[[Melt]]');
  });

  it('embeds the merged credit line in the title cell for mobile', () => {
    const t = tracks([{ title: 'Melt', n: '1', lyricist: 'ryo', composer: 'ryo' }]);
    expect(render(t)).toContain('<span class="album-track-credit">lyrics, music: ryo</span>');
  });

  it('omits the credit span when a track has no credits', () => {
    expect(render(tracks([{ title: 'Melt', n: '1' }]))).not.toContain('album-track-credit');
  });

  it('emits no thead or tbody, which MediaWiki strips and escapes', () => {
    const html = render(many(3));
    expect(html).not.toContain('<thead');
    expect(html).not.toContain('<tbody');
  });

  it('marks the header row so CSS and the filter can identify it', () => {
    // Without thead the header <tr> lands in MediaWiki's auto-inserted tbody
    // alongside the data rows, so it needs an explicit hook.
    const html = render(many(3));
    expect(html).toContain('<tr class="album-track-head">');
    expect((html.match(/album-track-head/g) ?? []).length).toBe(1);
  });

  it('still emits one header row per section table', () => {
    const t = tracks([
      { title: 'A', n: '1', group: 'Disc 1' },
      { title: 'B', n: '2', group: 'Disc 2' },
    ]);
    expect((render(t).match(/album-track-head/g) ?? []).length).toBe(2);
  });
});
