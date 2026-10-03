import { loadLuaModule, type LuaModule } from './lua-harness';

const MODULE = 'wiki/modules/Album.lua';

function luaTable(o: Record<string, string>): string {
  return `{${Object.entries(o).map(([k, v]) => `['${k}']=${JSON.stringify(v)}`).join(',')}}`;
}

/**
 * Parameters restored from the pre-module AlbumType2 (tsp/tss, imagealt*) and
 * the optional extras that replace Template:Track/o (length, bonus/hidden,
 * otherprod, intro/notes).
 */
describe('Module:Album extras', () => {
  let m: LuaModule;
  beforeEach(() => {
    m = loadLuaModule(MODULE);
  });

  const build = (o: Record<string, string>) => `M._build(${luaTable(o)}, "Test Singer")`;
  const base = { albumtitle: 'A', t1title: 'Melt', t1composer: 'ryo' };
  const tracklist = (o: Record<string, string>) => m.eval(`${build(o)}.tabs[1].content`);
  const tabLabels = (o: Record<string, string>) =>
    m.eval(`table.concat((function() local t={} for _,x in ipairs(${build(o)}.tabs) do t[#t+1]=x.label end return t end)(), '|')`);

  describe('tsp / tss', () => {
    it('puts tsp before and tss after the tracklist, inside the Tracklist tab', () => {
      const html = tracklist({ ...base, tsp: '<h2>CD</h2>', tss: 'BONUS-DVD' });
      expect(html.indexOf('<h2>CD</h2>')).toBeLessThan(html.indexOf('album-tracklist'));
      expect(html.indexOf('BONUS-DVD')).toBeGreaterThan(html.indexOf('album-tracklist'));
    });

    it('accepts the long names, which win over the short ones like the old template', () => {
      const html = tracklist({ ...base, tracksectionprefix: 'LONG', tsp: 'SHORT' });
      expect(html).toContain('LONG');
      expect(html).not.toContain('SHORT');
    });

    it('adds nothing when unset', () => {
      expect(tracklist(base)).not.toContain('album-track-prefix');
      expect(tracklist(base)).not.toContain('album-track-suffix');
    });
  });

  describe('intro / notes', () => {
    it('returns intro and notes for the wrapper to place around the tabs', () => {
      expect(m.eval(`${build({ ...base, intro: 'Hello' })}.intro`)).toContain('Hello');
      expect(m.eval(`${build({ ...base, notes: 'Bye' })}.notes`)).toContain('Bye');
    });

    it('starts the text on its own line so wikitext lists and headings parse', () => {
      expect(m.eval(`${build({ ...base, intro: '* a' })}.intro`)).toMatch(/>\n\* a/);
    });

    it('is empty when unset', () => {
      expect(m.eval(`${build(base)}.intro`)).toBe('');
      expect(m.eval(`${build(base)}.notes`)).toBe('');
    });
  });

  describe('t<N>length', () => {
    it('adds a Length column last, only when some track has a length', () => {
      expect(tracklist(base)).not.toContain('>Length<');
      const html = tracklist({ ...base, t1length: '4:16', t1arranger: 'x' });
      expect(html).toMatch(/>Arranger<\/th><th scope="col">Length<\/th>/);
      expect(html).toContain('<td>4:16</td>');
    });

    it('shows the length in the mobile credit line too, since that column is hidden on phones', () => {
      expect(tracklist({ ...base, t1length: '4:16' })).toMatch(/album-track-credit">4:16 · music: ryo/);
    });
  });

  describe('t<N>bonus / t<N>hidden', () => {
    it('badges a bonus or hidden track', () => {
      expect(tracklist({ ...base, t1bonus: 'true' })).toContain('album-track-flag">Bonus</span>');
      expect(tracklist({ ...base, t1hidden: 'yes' })).toContain('album-track-flag">Hidden</span>');
    });

    it('ignores a false-ish value', () => {
      expect(tracklist({ ...base, t1bonus: 'false' })).not.toContain('album-track-flag');
      expect(tracklist({ ...base, t1bonus: 'no' })).not.toContain('album-track-flag');
    });

    it('does not count a lone flag as a track', () => {
      expect(m.eval(`#M._collectTracks(${luaTable({ t1title: 'A', t2bonus: 'true' })})`)).toBe('1');
    });
  });

  describe('t<N>otherprod', () => {
    it('adds the extra credits under the title, visible on every screen', () => {
      expect(tracklist({ ...base, t1otherprod: 'Bass: X' })).toContain('<span class="album-track-extra">Bass: X</span>');
    });
  });

  describe('TOC anchor', () => {
    const anchor = (o: Record<string, string>) => m.eval(`${build(o)}.anchor`);

    it('emits a level-3 heading with the plain album title', () => {
      expect(anchor({ ...base, albumtitle: 'Yumeiro Signal' })).toBe('<h3 class="album-anchor">Yumeiro Signal</h3>');
    });

    it('drops ruby readings, links and formatting from the TOC text', () => {
      const title = "<ruby>夢色シグナル<rt>ゆめいろ</rt></ruby> [[Foo|Bar]] [https://x.example Ext] '''B'''";
      expect(anchor({ ...base, albumtitle: title })).toBe('<h3 class="album-anchor">夢色シグナル Bar Ext B</h3>');
    });

    it('falls back to the official titles like the card does', () => {
      expect(anchor({ t1title: 'x', officialromtitle: 'Romaji' })).toContain('>Romaji<');
    });

    it('honours toctitle, headinglevel and notoc', () => {
      expect(anchor({ ...base, toctitle: 'Custom' })).toContain('>Custom<');
      expect(anchor({ ...base, headinglevel: '4' })).toMatch(/^<h4 .*<\/h4>$/);
      expect(anchor({ ...base, headinglevel: '9' })).toMatch(/^<h3 /);
      expect(anchor({ ...base, notoc: 'yes' })).toBe('');
    });

    it('emits nothing when the album has no title at all', () => {
      expect(anchor({ t1title: 'x' })).toBe('');
    });
  });

  describe('imagealt*', () => {
    it('lists the main and alternate covers in the Cover Art tab', () => {
      const o = { ...base, image: 'main.png', imagealt: 'alt1.png', imagealt2: 'File:alt2.png' };
      expect(tabLabels(o)).toContain('Cover Art');
      const art = m.eval(`(function() for _,x in ipairs(${build(o)}.tabs) do if x.label=='Cover Art' then return x.content end end end)()`);
      expect(art).toContain('main.png|Main cover');
      expect(art).toContain('alt1.png|Alternate cover 1');
      expect(art).toContain('\nalt2.png|Alternate cover 2');
    });

    it('keeps an existing gallery and appends the alternates after it', () => {
      const o = { ...base, image: 'main.png', gallery: 'GALLERY', imagealt: 'alt.png' };
      const art = m.eval(`(function() for _,x in ipairs(${build(o)}.tabs) do if x.label=='Cover Art' then return x.content end end end)()`);
      expect(art.indexOf('GALLERY')).toBeLessThan(art.indexOf('alt.png'));
    });

    it('still honours suppressacg', () => {
      expect(tabLabels({ ...base, imagealt: 'alt.png', suppressacg: 'true' })).not.toContain('Cover Art');
    });
  });
});
