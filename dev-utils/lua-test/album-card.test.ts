import { loadLuaModule, type LuaModule } from './lua-harness';

const MODULE = 'wiki/modules/Album.lua';

function luaTable(o: Record<string, string>): string {
  return `{${Object.entries(o).map(([k, v]) => `['${k}']=${JSON.stringify(v)}`).join(',')}}`;
}

describe('Module:Album card rendering', () => {
  let m: LuaModule;
  beforeEach(() => {
    m = loadLuaModule(MODULE);
  });

  const card = (o: Record<string, string>) => m.eval(`M._renderCard(${luaTable(o)})`);

  it('renders the album title', () => {
    expect(card({ albumtitle: 'Aoi Kioku', datereleased: '2024-08-14' })).toContain('Aoi Kioku');
  });

  it('prefers albumtitle over the official title fields', () => {
    const html = card({ albumtitle: 'Chosen', officialjaptitle: 'Ignored', datereleased: 'x' });
    expect(html).toContain('Chosen');
    expect(html).not.toContain('Ignored');
  });

  it('falls back through jap, rom, then eng titles', () => {
    expect(card({ officialromtitle: 'Sekai-iro', datereleased: 'x' })).toContain('Sekai-iro');
    expect(card({ officialengtitle: 'Universe', datereleased: 'x' })).toContain('Universe');
  });

  it('emits metadata as a definition list, not bold-labelled divs', () => {
    const html = card({ albumtitle: 'A', datereleased: '2024-08-14', label: 'Balloon Rec.' });
    expect(html).toContain('<dl class="album-meta">');
    expect(html).toContain('<dt>Released</dt><dd>2024-08-14</dd>');
    expect(html).toContain('<dt>Label</dt><dd>Balloon Rec.</dd>');
    expect(html).not.toContain('<strong>Label');
  });

  it('omits metadata rows that have no value', () => {
    const html = card({ albumtitle: 'A', datereleased: '2024-08-14' });
    expect(html).not.toContain('<dt>Label</dt>');
    expect(html).not.toContain('<dt>Featuring</dt>');
  });

  it('renders the cover with an explicit width, not thumb', () => {
    const html = card({ albumtitle: 'A', datereleased: 'x', image: 'cover.png' });
    expect(html).toContain('[[File:cover.png');
    expect(html).toContain('220px');
    expect(html).not.toContain('|thumb');
  });

  it('renders a placeholder when no image is given', () => {
    expect(card({ albumtitle: 'A', datereleased: 'x' })).toContain('Template doc.png');
  });

  it('includes the artist as metadata rather than a caption', () => {
    const html = card({ albumtitle: 'A', datereleased: 'x', image: 'c.png', albumartist: 'Chachagoma' });
    expect(html).toContain('<dt>Artwork</dt><dd>Chachagoma</dd>');
  });
});
