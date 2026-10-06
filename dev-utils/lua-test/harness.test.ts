import { writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadLuaModule } from './lua-harness.ts';

const FIXTURE = `
local p = {}
function p._clean(v)
  v = mw.text.trim(v or '')
  if v == 'N/A' or v == '-' then return '' end
  return v
end
function p._root()
  return mw.title.getCurrentTitle().rootText
end
return p
`;

let modPath: string;

beforeAll(() => {
  const dir = join(tmpdir(), 'lua-harness-test');
  mkdirSync(dir, { recursive: true });
  modPath = join(dir, 'fixture.lua');
  writeFileSync(modPath, FIXTURE, 'utf8');
});

describe('lua harness', () => {
  it('loads a Scribunto-shaped module and calls a pure helper', () => {
    const m = loadLuaModule(modPath);
    expect(m.eval(`M._clean('  ryo ')`)).toBe('ryo');
  });

  it('applies the mw.text.trim stub', () => {
    const m = loadLuaModule(modPath);
    expect(m.eval(`M._clean('   ')`)).toBe('');
  });

  it('normalises N/A and - to empty', () => {
    const m = loadLuaModule(modPath);
    expect(m.eval(`M._clean('N/A')`)).toBe('');
    expect(m.eval(`M._clean('-')`)).toBe('');
  });

  it('resolves ROOTPAGENAME through the stub', () => {
    const m = loadLuaModule(modPath);
    m.setRoot('Mafumafu');
    expect(m.eval(`M._root()`)).toBe('Mafumafu');
  });

  it('surfaces Lua syntax errors as JS exceptions', () => {
    const dir = join(tmpdir(), 'lua-harness-test');
    const bad = join(dir, 'bad.lua');
    writeFileSync(bad, 'local p = {} function p.x( end return p', 'utf8');
    expect(() => loadLuaModule(bad)).toThrow(/Lua load error/);
  });
});
