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
});
