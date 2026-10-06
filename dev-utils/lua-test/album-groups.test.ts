import { loadLuaModule, type LuaModule } from './lua-harness.ts';

const MODULE = 'wiki/modules/Album.lua';

/** Builds a Lua track list from a list of group labels. */
function byGroups(groups: string[]): string {
  const items = groups.map((g, i) => `{title='T${i + 1}', group=${JSON.stringify(g)}}`);
  return `{${items.join(',')}}`;
}

describe('Module:Album group partitioning', () => {
  let m: LuaModule;
  beforeEach(() => {
    m = loadLuaModule(MODULE);
  });

  it('reports none when no track has a group', () => {
    expect(m.eval(`M._groupMode({{title='A'},{title='B'}})`)).toBe('none');
  });

  it('chooses section when each value is one contiguous run', () => {
    const t = byGroups(['Disc 1', 'Disc 1', 'Disc 2', 'Disc 2', 'Disc 3']);
    expect(m.eval(`M._groupMode(${t})`)).toBe('section');
  });

  it('chooses badge when values interleave', () => {
    const t = byGroups(['All editions', 'Type A', 'All editions', 'Type B']);
    expect(m.eval(`M._groupMode(${t})`)).toBe('badge');
  });

  it('honours an explicit override', () => {
    const t = byGroups(['Disc 1', 'Disc 1', 'Disc 2']);
    expect(m.eval(`M._groupMode(${t}, 'badge')`)).toBe('badge');
    expect(m.eval(`M._groupMode(${t}, 'column')`)).toBe('column');
  });

  it('ignores an override when no track has a group', () => {
    expect(m.eval(`M._groupMode({{title='A'}}, 'section')`)).toBe('none');
  });

  it('splits contiguous groups into sections in source order', () => {
    const t = byGroups(['Disc 1', 'Disc 1', 'Disc 2']);
    expect(m.eval(`#M._sections(${t})`)).toBe('2');
    expect(m.eval(`M._sections(${t})[1].label`)).toBe('Disc 1');
    expect(m.eval(`#M._sections(${t})[1].tracks`)).toBe('2');
    expect(m.eval(`M._sections(${t})[2].label`)).toBe('Disc 2');
    expect(m.eval(`#M._sections(${t})[2].tracks`)).toBe('1');
  });

  it('models the real Sekaiiro shape: 17 / 17 / 10', () => {
    const groups = ([] as string[])
      .concat(Array(17).fill('Disc 1'))
      .concat(Array(17).fill('Disc 2'))
      .concat(Array(10).fill('Disc 3 (Limited Edition A only)'));
    const t = byGroups(groups);
    expect(m.eval(`M._groupMode(${t})`)).toBe('section');
    expect(m.eval(`#M._sections(${t})`)).toBe('3');
    expect(m.eval(`#M._sections(${t})[3].tracks`)).toBe('10');
  });
});
