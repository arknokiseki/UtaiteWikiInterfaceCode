import { encodeSegment, decodeSegment, titleToPath, pathToTitle, assignPaths } from './titles.ts';

describe('encodeSegment — percent-encodes what NTFS refuses', () => {
  test.each([
    ['?', '%3F'],
    ['*', '%2A'],
    ['Wp:ja', 'Wp%3Aja'],
    ['a<b>c', 'a%3Cb%3Ec'],
    ['pipe|bar', 'pipe%7Cbar'],
    ['quote"mark', 'quote%22mark'],
    ['100%', '100%25'],
  ])('encodes %s -> %s', (raw, want) => {
    expect(encodeSegment(raw)).toBe(want);
  });

  test('encodes a trailing dot', () => {
    expect(encodeSegment('News, Important Topics, etc.')).toBe('News, Important Topics, etc%2E');
  });

  test('encodes a trailing space', () => {
    expect(encodeSegment('trailing ')).toBe('trailing%20');
  });

  test('leaves ordinary segments untouched', () => {
    expect(encodeSegment('Uptodate')).toBe('Uptodate');
    expect(encodeSegment('Time ago')).toBe('Time ago');
  });

  test('encodes % before anything else, so encoding is reversible', () => {
    expect(decodeSegment(encodeSegment('%3F'))).toBe('%3F');
  });
});

describe('decodeSegment — round-trips every encodeSegment output', () => {
  test.each(['?', '*', 'Wp:ja', '100%', 'News, etc.', 'trailing ', 'Uptodate', 'a<b>|c"d'])(
    'round-trips %s',
    (raw) => {
      expect(decodeSegment(encodeSegment(raw))).toBe(raw);
    },
  );
});

describe('titleToPath', () => {
  test('maps a template root to templates/', () => {
    expect(titleToPath('Template:Uptodate', 'wikitext')).toBe('wiki/templates/Uptodate.wikitext');
  });

  test('maps subpages to real directories', () => {
    expect(titleToPath('Template:Uptodate/doc', 'wikitext')).toBe('wiki/templates/Uptodate/doc.wikitext');
  });

  test('maps a module to modules/ with .lua', () => {
    expect(titleToPath('Module:Yesno', 'Scribunto')).toBe('wiki/modules/Yesno.lua');
  });

  test('a module /doc is wikitext, not lua', () => {
    expect(titleToPath('Module:Yesno/doc', 'wikitext')).toBe('wiki/modules/Yesno/doc.wikitext');
  });

  test('sanitized-css becomes .css', () => {
    expect(titleToPath('Template:Infobox/styles.css', 'sanitized-css')).toBe(
      'wiki/templates/Infobox/styles.css.css',
    );
  });

  test('encodes illegal characters per segment', () => {
    expect(titleToPath('Template:?', 'wikitext')).toBe('wiki/templates/%3F.wikitext');
    expect(titleToPath('Template:Wp:ja', 'wikitext')).toBe('wiki/templates/Wp%3Aja.wikitext');
  });

  test('does not encode the subpage separator', () => {
    expect(titleToPath('Template:Time ago/core', 'wikitext')).toBe('wiki/templates/Time ago/core.wikitext');
  });
});

describe('pathToTitle — inverse of titleToPath for non-colliding titles', () => {
  test.each([
    ['Template:Uptodate', 'wikitext' as const],
    ['Template:Uptodate/doc', 'wikitext' as const],
    ['Module:Yesno', 'Scribunto' as const],
    ['Template:?', 'wikitext' as const],
    ['Template:Wp:ja', 'wikitext' as const],
    ['Template:Time ago/core', 'wikitext' as const],
  ])('round-trips %s', (title, model) => {
    expect(pathToTitle(titleToPath(title, model))).toBe(title);
  });
});

describe('assignPaths — resolves case-insensitive collisions deterministically', () => {
  test('gives distinct paths to titles differing only by case', () => {
    const got = assignPaths([
      { title: 'Template:Yt', model: 'wikitext' },
      { title: 'Template:YT', model: 'wikitext' },
    ]);
    expect(got.get('Template:YT')).toBe('wiki/templates/YT.wikitext');
    expect(got.get('Template:Yt')).toBe('wiki/templates/Yt~2.wikitext');
  });

  test('is deterministic regardless of input order', () => {
    const a = assignPaths([
      { title: 'Template:Yt', model: 'wikitext' },
      { title: 'Template:YT', model: 'wikitext' },
    ]);
    const b = assignPaths([
      { title: 'Template:YT', model: 'wikitext' },
      { title: 'Template:Yt', model: 'wikitext' },
    ]);
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
  });

  test('handles a three-way collision', () => {
    const got = assignPaths([
      { title: 'Template:TOCright', model: 'wikitext' },
      { title: 'Template:TOCRight', model: 'wikitext' },
      { title: 'Template:Tocright', model: 'wikitext' },
    ]);
    expect(new Set(got.values()).size).toBe(3);
  });

  test('leaves non-colliding titles unsuffixed', () => {
    const got = assignPaths([
      { title: 'Template:Uptodate', model: 'wikitext' },
      { title: 'Template:Freshness', model: 'wikitext' },
    ]);
    expect(got.get('Template:Uptodate')).toBe('wiki/templates/Uptodate.wikitext');
    expect(got.get('Template:Freshness')).toBe('wiki/templates/Freshness.wikitext');
  });

  test('throws on an exact duplicate title rather than losing a page', () => {
    expect(() =>
      assignPaths([
        { title: 'Template:Uptodate', model: 'wikitext' },
        { title: 'Template:Uptodate', model: 'wikitext' },
      ]),
    ).toThrow(/duplicate/i);
  });
});
