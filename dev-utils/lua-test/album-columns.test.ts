import { loadLuaModule, type LuaModule } from './lua-harness';

const MODULE = 'wiki/modules/Album.lua';

function tracks(rows: Record<string, string>[]): string {
  const items = rows.map(
    (r) => `{${Object.entries(r).map(([k, v]) => `['${k}']=${JSON.stringify(v)}`).join(',')}}`,
  );
  return `{${items.join(',')}}`;
}

describe('Module:Album columns and credits', () => {
  let m: LuaModule;
  beforeEach(() => {
    m = loadLuaModule(MODULE);
  });

  const join = (t: string) => `table.concat(M._columns(${t}), '|')`;

  it('always renders the five-column spine', () => {
    expect(m.eval(join(tracks([{ title: 'A' }])))).toBe('#|Title|Utaite|Lyricist|Composer');
  });

  it('adds Arranger only when some track fills it', () => {
    expect(m.eval(join(tracks([{ title: 'A' }, { title: 'B', arranger: 'Kz' }])))).toBe(
      '#|Title|Utaite|Lyricist|Composer|Arranger',
    );
  });

  it('adds Group only when some track fills it', () => {
    expect(m.eval(join(tracks([{ title: 'A', group: 'Disc 1' }])))).toBe(
      '#|Title|Utaite|Lyricist|Composer|Group',
    );
  });

  it('keeps Utaite even when every track leaves it blank', () => {
    expect(m.eval(join(tracks([{ title: 'A' }, { title: 'B' }])))).toContain('Utaite');
  });

  it('merges roles that share a person', () => {
    expect(m.eval(`M._credit({lyricist='ryo', composer='ryo'})`)).toBe('lyrics, music: ryo');
  });

  it('merges all three roles', () => {
    expect(m.eval(`M._credit({lyricist='ryo', composer='ryo', arranger='ryo'})`)).toBe(
      'lyrics, music, arrange: ryo',
    );
  });

  it('separates distinct people', () => {
    expect(m.eval(`M._credit({lyricist='ryo', composer='ryo', arranger='Kz'})`)).toBe(
      'lyrics, music: ryo · arrange: Kz',
    );
  });

  it('omits absent roles', () => {
    expect(m.eval(`M._credit({composer='ryo'})`)).toBe('music: ryo');
  });

  it('returns empty when no credits exist', () => {
    expect(m.eval(`M._credit({title='A'})`)).toBe('');
  });

  it('ignores N/A credits', () => {
    expect(m.eval(`M._credit({lyricist='N/A', composer='ryo'})`)).toBe('music: ryo');
  });
});
