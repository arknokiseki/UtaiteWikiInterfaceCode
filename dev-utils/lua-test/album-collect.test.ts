import { loadLuaModule, type LuaModule } from './lua-harness';

const MODULE = 'wiki/modules/Album.lua';

/** Renders a JS object as a Lua table literal. */
function luaTable(o: Record<string, string>): string {
  const body = Object.entries(o)
    .map(([k, v]) => `['${k}']=${JSON.stringify(v).replace(/\\u001e/g, '\\030').replace(/\\u001f/g, '\\031')}`)
    .join(',');
  return `{${body}}`;
}

describe('Module:Album track collection', () => {
  let m: LuaModule;
  beforeEach(() => {
    m = loadLuaModule(MODULE);
  });

  it('collects the new t1* dialect', () => {
    const a = luaTable({
      t1title: 'Melt', t1lyricist: 'ryo', t1composer: 'ryo',
      t2title: 'Alone', t2lyricist: 'Foo',
    });
    expect(m.eval(`#M._collectTracks(${a})`)).toBe('2');
    expect(m.eval(`M._collectTracks(${a})[1].title`)).toBe('Melt');
    expect(m.eval(`M._collectTracks(${a})[2].lyricist`)).toBe('Foo');
  });

  it('uses the index as the track number', () => {
    const a = luaTable({ t1title: 'A', t2title: 'B' });
    expect(m.eval(`M._collectTracks(${a})[2].n`)).toBe('2');
  });

  it('collects the legacy track1* dialect', () => {
    const a = luaTable({
      track1title: 'Melt', track1utaite: 'Soraru', track1info: 'TV size',
      track2title: 'Alone',
    });
    expect(m.eval(`#M._collectTracks(${a})`)).toBe('2');
    expect(m.eval(`M._collectTracks(${a})[1].utaite`)).toBe('Soraru');
    expect(m.eval(`M._collectTracks(${a})[1].info`)).toBe('TV size');
  });

  it('accepts t1singers as an alias of t1utaite', () => {
    const a = luaTable({ t1title: 'A', t1singers: 'Soraru' });
    expect(m.eval(`M._collectTracks(${a})[1].utaite`)).toBe('Soraru');
  });

  it('does NOT stop at a gap in numbering', () => {
    const a = luaTable({ t1title: 'A', t3title: 'C', t5title: 'E' });
    expect(m.eval(`#M._collectTracks(${a})`)).toBe('3');
    expect(m.eval(`M._collectTracks(${a})[3].title`)).toBe('E');
    expect(m.eval(`M._collectTracks(${a})[3].n`)).toBe('5');
  });

  it('handles a very high index without truncating', () => {
    const a = luaTable({ t1title: 'first', t154title: 'last' });
    expect(m.eval(`#M._collectTracks(${a})`)).toBe('2');
    expect(m.eval(`M._collectTracks(${a})[2].title`)).toBe('last');
    expect(m.eval(`M._collectTracks(${a})[2].n`)).toBe('154');
  });

  it('repairs misspelled track parameters', () => {
    const a = luaTable({ track1title: 'A', trac1arranger: 'Kz' });
    expect(m.eval(`M._collectTracks(${a})[1].arranger`)).toBe('Kz');
  });

  it('prefers the |track= record dialect when present', () => {
    // U+241E / U+241F, not C0 controls — MediaWiki replaces the latter with
    // U+FFFD before Lua ever sees them. See the RS/FS comment in Album.lua.
    const a = luaTable({
      track: '␞1␟FromRecord␟␟␟␟␟␟',
      t1title: 'Ignored',
    });
    expect(m.eval(`#M._collectTracks(${a})`)).toBe('1');
    expect(m.eval(`M._collectTracks(${a})[1].title`)).toBe('FromRecord');
  });

  it('returns no tracks for legacy html, leaving passthrough to the renderer', () => {
    const a = luaTable({ track: '<tr><td>1</td><td>Old</td></tr>' });
    expect(m.eval(`#M._collectTracks(${a})`)).toBe('0');
  });
});
