import { loadLuaModule, type LuaModule } from './lua-harness';

const MODULE = 'wiki/modules/Album.lua';

describe('Module:Album normalisation', () => {
  let m: LuaModule;
  beforeEach(() => {
    m = loadLuaModule(MODULE);
  });

  it('trims surrounding whitespace', () => {
    expect(m.eval(`M._clean('  ryo  ')`)).toBe('ryo');
  });

  it('treats N/A and - as empty', () => {
    expect(m.eval(`M._clean('N/A')`)).toBe('');
    expect(m.eval(`M._clean('  -  ')`)).toBe('');
  });

  it('passes nil through as empty', () => {
    expect(m.eval(`M._clean(nil)`)).toBe('');
  });

  it('does not eat legitimate values containing N/A', () => {
    expect(m.eval(`M._clean('N/A Project')`)).toBe('N/A Project');
  });

  it('maps observed track typos to canonical names', () => {
    expect(m.eval(`M._canonical('trac9arranger')`)).toBe('track9arranger');
    expect(m.eval(`M._canonical('track4lyrcist')`)).toBe('track4lyricist');
    expect(m.eval(`M._canonical('trakk6info')`)).toBe('track6info');
    expect(m.eval(`M._canonical('tracl7composer')`)).toBe('track7composer');
  });

  it('maps observed album-level typos', () => {
    expect(m.eval(`M._canonical('crossfadeYTID')`)).toBe('crossfadeyt');
    expect(m.eval(`M._canonical('daterealeased')`)).toBe('datereleased');
    expect(m.eval(`M._canonical('albumArtist')`)).toBe('albumartist');
    expect(m.eval(`M._canonical('JPshops')`)).toBe('jpshops');
    expect(m.eval(`M._canonical('spotifyalbumID')`)).toBe('spotifyalbumid');
  });

  it('leaves unknown keys untouched', () => {
    expect(m.eval(`M._canonical('albumtitle')`)).toBe('albumtitle');
    expect(m.eval(`M._canonical('completely_unknown')`)).toBe('completely_unknown');
  });
});
