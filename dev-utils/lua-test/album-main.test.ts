import { loadLuaModule, type LuaModule } from './lua-harness';

const MODULE = 'wiki/modules/Album.lua';

function luaTable(o: Record<string, string>): string {
  return `{${Object.entries(o).map(([k, v]) => `['${k}']=${JSON.stringify(v)}`).join(',')}}`;
}

describe('Module:Album assembly', () => {
  let m: LuaModule;
  beforeEach(() => {
    m = loadLuaModule(MODULE);
  });

  const build = (o: Record<string, string>, root = 'Test Singer') =>
    `M._build(${luaTable(o)}, ${JSON.stringify(root)})`;

  const base = { albumtitle: 'A', datereleased: '2024-01-01', t1title: 'Melt', t1composer: 'ryo' };

  it('always produces a Tracklist tab first', () => {
    expect(m.eval(`${build(base)}.tabs[1].label`)).toBe('Tracklist');
  });

  it('includes the card', () => {
    expect(m.eval(`${build(base)}.card`)).toContain('album-row');
  });

  it('omits the Cover Art tab when there is no gallery', () => {
    expect(m.eval(`table.concat((function() local t={} for _,x in ipairs(${build(base)}.tabs) do t[#t+1]=x.label end return t end)(), '|')`))
      .not.toContain('Cover Art');
  });

  it('adds the Cover Art tab when a gallery exists', () => {
    const o = { ...base, gallery: '{{Gallery|a.png}}' };
    expect(m.eval(`table.concat((function() local t={} for _,x in ipairs(${build(o)}.tabs) do t[#t+1]=x.label end return t end)(), '|')`))
      .toContain('Cover Art');
  });

  it('adds a YT Crossfade tab only when crossfadeyt is set', () => {
    const labels = (o: Record<string, string>) =>
      m.eval(`table.concat((function() local t={} for _,x in ipairs(${build(o)}.tabs) do t[#t+1]=x.label end return t end)(), '|')`);
    expect(labels(base)).not.toContain('YT Crossfade');
    expect(labels({ ...base, crossfadeyt: 'abc123' })).toContain('YT Crossfade');
  });

  it('threads the root name into the utaite fallback', () => {
    expect(m.eval(`${build(base, 'Mafumafu')}.tracklist`)).toContain('Mafumafu');
  });

  it('renders legacy <tr> passthrough unchanged', () => {
    const o = { albumtitle: 'A', datereleased: 'x', track: '<tr><td>1</td><td>Old</td></tr>' };
    const html = m.eval(`${build(o)}.tracklist`);
    expect(html).toContain('<td>Old</td>');
    expect(html).toContain('album-track-legacy');
  });

  // _build takes an `expand` callback so it stays frame-free and testable;
  // main passes frame:preprocess. #invoke output is not re-expanded for
  // parser functions, so generated {{#ev:}} wikitext must go through it.
  const buildX = (o: Record<string, string>) =>
    `M._build(${luaTable(o)}, 'Test Singer', function(s) return '<<' .. s .. '>>' end)`;

  const tabContent = (o: Record<string, string>, label: string) =>
    m.eval(
      `(function() for _,t in ipairs(${buildX(o)}.tabs) do if t.label == '${label}' then return t.content end end return '' end)()`,
    );

  it('embeds the YouTube crossfade rather than printing the id', () => {
    const html = tabContent({ ...base, crossfadeyt: 'oGOLMXW2E3Y' }, 'YT Crossfade');
    expect(html).toContain('<<{{#ev:youtube|oGOLMXW2E3Y||inline|}}>>');
  });

  it('passes the YouTube description through', () => {
    const html = tabContent(
      { ...base, crossfadeyt: 'abc', ytxfddesc: 'Official crossfade' },
      'YT Crossfade',
    );
    expect(html).toContain('{{#ev:youtube|abc||inline|Official crossfade}}');
  });

  it('embeds the NND crossfade', () => {
    const html = tabContent({ ...base, crossfadennd: 'sm12345' }, 'NND Crossfade');
    expect(html).toContain('<<{{#ev:niconico|sm12345||inline|}}>>');
  });

  it('embeds the Spotify album, which the first cut dropped', () => {
    const html = tabContent({ ...base, spotifyalbumid: '3oaULsMEJ1' }, 'Streaming');
    expect(html).toContain('<<{{#ev:spotifyalbum|3oaULsMEJ1}}>>');
  });

  it('still shows a Streaming tab with only streams and no spotify id', () => {
    const html = tabContent({ ...base, streams: '{{LType2|spotify|x}}' }, 'Streaming');
    expect(html).toContain('{{LType2|spotify|x}}');
    expect(html).not.toContain('#ev:spotifyalbum');
  });

  it('keeps the crossfade heading from the old template', () => {
    const html = tabContent({ ...base, crossfadeyt: 'abc' }, 'YT Crossfade');
    expect(html).toContain('Crossfade Preview');
  });
});
