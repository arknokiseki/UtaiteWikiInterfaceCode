import { loadLuaModule, type LuaModule } from './lua-harness';

const MODULE = 'wiki/modules/Album.lua';

function luaTable(o: Record<string, string>): string {
  return `{${Object.entries(o).map(([k, v]) => `['${k}']=${JSON.stringify(v)}`).join(',')}}`;
}

/** |variant=legacy reproduces the look of the old Template:Album. */
describe('Module:Album legacy variant', () => {
  let m: LuaModule;
  beforeEach(() => {
    m = loadLuaModule(MODULE);
  });

  const credit = (o: Record<string, string>) => m.eval(`M._legacyCredit(${luaTable(o)})`);
  const B = '<br>&nbsp;&nbsp;&nbsp;&nbsp;';

  describe('credit line (same wording as the old template)', () => {
    it('merges a lyricist who also composed and arranged', () => {
      expect(credit({ lyricist: 'X', composer: 'X', arranger: 'X' })).toBe(`${B}(lyrics,&nbsp;music,&nbsp;arrange: X)`);
    });
    it('names a different arranger separately', () => {
      expect(credit({ lyricist: 'X', composer: 'X', arranger: 'Y' })).toBe(`${B}(lyrics,&nbsp;music: X,&nbsp;arrange: Y)`);
    });
    it('merges composer and arranger after a different lyricist', () => {
      expect(credit({ lyricist: 'X', composer: 'Y', arranger: 'Y' })).toBe(`${B}(lyrics: X,&nbsp;music,&nbsp;arrange: Y)`);
    });
    it('lists three different people', () => {
      expect(credit({ lyricist: 'X', composer: 'Y', arranger: 'Z' })).toBe(`${B}(lyrics: X,&nbsp;music: Y,&nbsp;arrange: Z)`);
    });
    it('handles lyricist and arranger without a composer', () => {
      expect(credit({ lyricist: 'X', arranger: 'Z' })).toBe(`${B}(lyrics: X,&nbsp;arrange: Z)`);
      expect(credit({ lyricist: 'X', arranger: 'X' })).toBe(`${B}(lyrics,&nbsp;arrange: X)`);
    });
    it('starts from music or arrange when there is no lyricist', () => {
      expect(credit({ composer: 'Y', arranger: 'Y' })).toBe(`${B}(music,&nbsp;arrange: Y)`);
      expect(credit({ composer: 'Y', arranger: 'Z' })).toBe(`${B}(music: Y,&nbsp;arrange: Z)`);
      expect(credit({ arranger: 'Z' })).toBe(`${B}(arrange: Z)`);
    });
    it('is empty without credits', () => {
      expect(credit({})).toBe('');
    });
  });

  describe('track line', () => {
    const line = (o: Record<string, string>) => m.eval(`M._legacyTrackLine(M._collectTracks(${luaTable(o)})[1])`);
    it('matches the old format', () => {
      expect(line({ t1title: 'Song B', t1info: '(TV size)', t1utaite: 'Someone' }))
        .toBe('1. "Song B" <small>(TV size)&nbsp;<strong>(Someone)</strong></small><small></small>');
    });
    it('uses the displayed number', () => {
      expect(line({ t1title: 'X', t1n: 'B' })).toMatch(/^B\. "X"/);
    });
    it('keeps the new extras, small, after the info', () => {
      expect(line({ t1title: 'X', t1length: '4:16', t1bonus: 'true' })).toContain('<small> [4:16] (Bonus)</small>');
    });
  });

  describe('layout', () => {
    const legacy = (o: Record<string, string>) => m.eval(`M._legacy(${luaTable(o)})`);
    const base = { albumtitle: 'Test~Album (x)', datereleased: 'Jan 1, 2020', t1title: 'A' };

    it('draws the two floated infoboxes and clears them', () => {
      const html = legacy(base);
      expect(html).toContain('<infobox theme="album">');
      expect(html).toContain('<infobox theme="tracklist">');
      expect(html).toContain('{{clr}}');
      expect(html.indexOf('theme="album"')).toBeLessThan(html.indexOf('theme="tracklist"'));
    });

    it('keeps the old link anchors', () => {
      const html = legacy(base);
      expect(html).toContain('{{anchor|Test}}{{anchor|Test~Album }}{{anchor|Test~Album (x)}}');
    });

    it('shows the placeholders the old template showed', () => {
      const html = legacy(base);
      expect(html).toContain('No streaming media available yet');
      expect(html).toContain('No shops available yet');
      expect(html).toContain('No downloads available yet');
      expect(html).toContain('[[File:NoYt.png|link=]][[File:NoNv.png|link=]]');
    });

    it('reads every track dialect, with no 30-track cap', () => {
      const o: Record<string, string> = { albumtitle: 'A' };
      for (let i = 1; i <= 35; i++) o[`t${i}title`] = `S${i}`;
      expect(legacy(o)).toContain('35. "S35"');
      expect(legacy({ albumtitle: 'A', track1title: 'Old' })).toContain('1. "Old"');
    });

    it('turns disc groups into headers inside the tracklist box', () => {
      const html = legacy({ albumtitle: 'A', t1title: 'x', t1group: 'CD', t2title: 'y', t2group: 'DVD' });
      expect(html).toContain('<header>CD</header>');
      expect(html).toContain('<header>DVD</header>');
    });

    it('collects alternate covers from both templates\' parameter names', () => {
      const html = legacy({ ...base, imagealt: 'a.png', image3: 'b.png', imagealt2: 'c.png' });
      expect(html).toContain('<header>Alternative CD covers</header>');
      for (const f of ['a.png', 'b.png', 'c.png']) expect(html).toContain(`<default>${f}</default>`);
    });

    it('is a TOC entry too, like the main design', () => {
      expect(legacy(base)).toContain('<h3 class="album-anchor">');
    });
  });
});
