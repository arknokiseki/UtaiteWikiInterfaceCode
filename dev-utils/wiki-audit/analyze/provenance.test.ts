import { parseSourceWiki, describeSource, isUpstream } from './provenance.ts';

describe('parseSourceWiki — the interwiki prefix is the provenance', () => {
  test.each([
    ['mw>ATDT', 'mw'],
    ['wikia>Awesome Aasi', 'wikia'],
    ['mh>PetraMagna', 'mh'],
    ['wp>Someone', 'wp'],
    ['meta>Someone', 'meta'],
    ['wikia:utaite>Default', 'wikia:utaite'],
  ])('reads %s as %s', (user, want) => {
    expect(parseSourceWiki(user)).toBe(want);
  });

  test.each(['Ark', 'Arknomahounorobotto', ''])('treats %s as native', (user) => {
    expect(parseSourceWiki(user)).toBe('');
  });
});

describe('describeSource', () => {
  test.each([
    ['mw', 'mediawiki.org'],
    ['wp', 'Wikipedia'],
    ['meta', 'Meta-Wiki'],
    ['wikia', 'Fandom (wiki not identified)'],
    ['wikia:utaite', 'Fandom — old utaite wiki'],
    ['', 'written on this wiki'],
  ])('labels %s', (prefix, want) => {
    expect(describeSource(prefix)).toBe(want);
  });

  test('falls back to the raw prefix for an unknown wiki', () => {
    expect(describeSource('mh')).toBe('mh');
  });
});

describe('isUpstream — drives the write-vs-source split', () => {
  test('an imported page is upstream', () => {
    expect(isUpstream({ user: 'mw>ATDT', timestamp: '', comment: '', sourceWiki: 'mw' })).toBe(true);
  });

  test('a native page is not upstream', () => {
    expect(isUpstream({ user: 'Ark', timestamp: '', comment: '', sourceWiki: '' })).toBe(false);
  });

  test('unknown provenance is not assumed upstream', () => {
    expect(isUpstream(undefined)).toBe(false);
  });
});
