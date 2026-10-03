import { loadLuaModule, type LuaModule } from './lua-harness';

const MODULE = 'wiki/modules/Album.lua';
// U+241E / U+241F as Lua byte escapes; see the RS/FS comment in Album.lua.
// Real C0 control characters cannot be used because MediaWiki replaces them.
const RS = '\\226\\144\\158';
const FS = '\\226\\144\\159';

/** Builds a Lua string literal for a record blob. */
function blob(rows: string[][]): string {
  return rows.map((r) => RS + r.join(FS)).join('');
}

describe('Module:Album {{Track}} record parsing', () => {
  let m: LuaModule;
  beforeEach(() => {
    m = loadLuaModule(MODULE);
  });

  it('parses a single record into fields', () => {
    const b = blob([['1', 'Melt', 'TV size', 'Soraru', 'ryo', 'ryo', 'Kz', 'Disc 1']]);
    expect(m.eval(`#M._parseRecords("${b}")`)).toBe('1');
    expect(m.eval(`M._parseRecords("${b}")[1].title`)).toBe('Melt');
    expect(m.eval(`M._parseRecords("${b}")[1].n`)).toBe('1');
    expect(m.eval(`M._parseRecords("${b}")[1].group`)).toBe('Disc 1');
  });

  it('parses many records', () => {
    const b = blob([
      ['1', 'A', '', '', 'ryo', 'ryo', '', ''],
      ['2', 'B', '', '', 'Neru', 'Neru', 'Neru', ''],
      ['3', 'C', '', '', '', '', '', ''],
    ]);
    expect(m.eval(`#M._parseRecords("${b}")`)).toBe('3');
    expect(m.eval(`M._parseRecords("${b}")[2].arranger`)).toBe('Neru');
    expect(m.eval(`M._parseRecords("${b}")[3].title`)).toBe('C');
  });

  it('normalises N/A inside records', () => {
    const b = blob([['1', 'A', '', '', 'N/A', 'ryo', '', '']]);
    expect(m.eval(`M._parseRecords("${b}")[1].lyricist`)).toBe('');
  });

  it('preserves suffixed track numbers verbatim', () => {
    const b = blob([['12-a', 'A', '', '', '', '', '', '']]);
    expect(m.eval(`M._parseRecords("${b}")[1].n`)).toBe('12-a');
  });

  it('keeps wikitext and nested template output intact in a field', () => {
    const b = blob([['1', '[[Melt]] {{VW|abc}}', '', '', '', '', '', '']]);
    expect(m.eval(`M._parseRecords("${b}")[1].title`)).toBe('[[Melt]] {{VW|abc}}');
  });

  it('detects legacy <tr> output', () => {
    expect(m.eval(`tostring(M._isLegacyHtml('<tr><td>1</td></tr>'))`)).toBe('true');
    expect(m.eval(`tostring(M._isLegacyHtml("${blob([['1', 'A', '', '', '', '', '', '']])}"))`)).toBe('false');
    expect(m.eval(`tostring(M._isLegacyHtml(''))`)).toBe('false');
  });
});
