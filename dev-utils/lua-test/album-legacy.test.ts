import { loadLuaModule, type LuaModule } from './lua-harness.ts';

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
    // parts = { anchor, before, boxes, after, values }: the boxes refer to values
    // by name; p.main parses them in a child frame whose arguments are `values`.
    const parts = (o: Record<string, string>) => `M._legacyParts(${luaTable(o)})`;
    const field = (o: Record<string, string>, f: string) => m.eval(`${parts(o)}.${f}`);
    const value = (o: Record<string, string>, k: string) => m.eval(`${parts(o)}.values['${k}'] or ''`);
    const base = { albumtitle: 'Test~Album (x)', datereleased: 'Jan 1, 2020', t1title: 'A' };

    it('draws the two floated infoboxes and clears them', () => {
      const boxes = field(base, 'boxes');
      expect(boxes).toContain('<infobox theme="album">');
      expect(boxes).toContain('<infobox theme="tracklist">');
      expect(boxes.indexOf('theme="album"')).toBeLessThan(boxes.indexOf('theme="tracklist"'));
      expect(field(base, 'after')).toContain('{{clr}}');
    });

    it('refers to every value by name instead of writing it into the infobox XML', () => {
      const o = { ...base, albumtitle: 'STAIN & RAIN', image: 'Stain & Rain.png' };
      const boxes = field(o, 'boxes');
      expect(boxes).not.toContain('STAIN & RAIN');
      expect(boxes).toContain('<header>{{{albumtitle}}}</header>');
      expect(boxes).toContain('<image source="image"/>');
      expect(value(o, 'albumtitle')).toBe('STAIN & RAIN');
      expect(value(o, 'image')).toBe('Stain & Rain.png');
    });

    it('keeps the old link anchors, built directly so "=" in a title cannot break them', () => {
      expect(field(base, 'before')).toContain('<div id="Test" class="hide"></div><div id="Test~Album " class="hide"></div><div id="Test~Album (x)" class="hide"></div>');
      expect(field({ ...base, albumtitle: '[http://x.example/?a=b Title]' }, 'before')).not.toContain('{{anchor');
    });

    it('uses the whole title when it starts with the cut character, like the old {{#sub:}}', () => {
      expect(field({ ...base, albumtitle: '(un)sentimental spica' }, 'before'))
        .toBe('<div id="(un)sentimental spica" class="hide"></div>'.repeat(3) + '\n');
    });

    it('shows the placeholders the old template showed', () => {
      const boxes = field(base, 'boxes');
      expect(boxes).toContain('<default>No streaming media available yet</default>');
      expect(boxes).toContain('<default>No shops available yet</default>');
      expect(boxes).toContain('<default>No downloads available yet</default>');
      expect(value(base, 'crossfade')).toContain('[[File:NoYt.png|link=]][[File:NoNv.png|link=]]');
    });

    it('passes a pasted URL to {{nnd}} as 1= so its "=" survives', () => {
      expect(value({ ...base, crossfadennd: 'http://x/?a=b' }, 'crossfade')).toContain('{{nnd|1=http://x/?a=b}}');
    });

    it('reads every track dialect, with no 30-track cap', () => {
      const o: Record<string, string> = { albumtitle: 'A' };
      for (let i = 1; i <= 35; i++) o[`t${i}title`] = `S${i}`;
      expect(value(o, 'track35title')).toMatch(/^35\. "S35"/);
      expect(field(o, 'boxes')).toContain('<data source="track35title"/>');
      expect(value({ albumtitle: 'A', track1title: 'Old' }, 'track1title')).toMatch(/^1\. "Old"/);
    });

    it('turns disc groups into headers inside the tracklist box', () => {
      const o = { albumtitle: 'A', t1title: 'x', t1group: 'CD', t2title: 'y', t2group: 'DVD' };
      expect(field(o, 'boxes')).toContain('<header>{{{group1}}}</header>');
      expect(value(o, 'group2')).toBe('DVD');
    });

    it('collects alternate covers from both templates\' parameter names', () => {
      const o = { ...base, imagealt: 'a.png', image3: 'b.png', imagealt2: 'c.png' };
      const boxes = field(o, 'boxes');
      expect(boxes).toContain('<header>Alternative CD covers</header>');
      for (const k of ['imagealt', 'image3', 'imagealt2']) expect(boxes).toContain(`<image source="${k}"/>`);
      expect(value(o, 'image3')).toBe('b.png');
    });

    it('is a TOC entry too, like the main design', () => {
      expect(field(base, 'anchor')).toContain('<h3 class="album-anchor">');
    });
  });
});
