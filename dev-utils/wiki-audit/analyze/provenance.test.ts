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

  test.each([
    ['utaite>Someone', 'wikia:utaite'],
    ['wikia:utaite>Default', 'wikia:utaite'],
    [':wikia:utaite>Someone', 'wikia:utaite'],
  ])('folds the old utaite wiki variant %s into one source', (user, want) => {
    expect(parseSourceWiki(user)).toBe(want);
  });

  test('strips a leading colon from any prefix', () => {
    expect(parseSourceWiki(':mw>ATDT')).toBe('mw');
  });
});

describe('describeSource', () => {
  test.each([
    ['mw', 'mediawiki.org'],
    ['wp', 'Wikipedia'],
    ['meta', 'Meta-Wiki'],
    ['wikia', 'Fandom (wiki not identified)'],
    ['wikia:utaite', 'Fandom — old utaite wiki'],
    ['mh', 'Miraheze'],
    ['mh:dev', 'Miraheze Dev'],
    ['dev', 'Fandom Dev wiki'],
    ['wikia:vocaloidlyrics', 'Fandom — Vocaloid Lyrics wiki'],
    ['', 'written on this wiki'],
  ])('labels %s', (prefix, want) => {
    expect(describeSource(prefix)).toBe(want);
  });

  test('falls back to the raw prefix for an unknown wiki', () => {
    expect(describeSource('exttest')).toBe('exttest');
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
