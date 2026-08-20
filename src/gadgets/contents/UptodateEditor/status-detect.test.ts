import { extractStatusParam, detectStatus } from './status-detect.js';

const infobox = (status: string, name = 'Utaite'): string =>
  `{{${name}\n|officialjapname=OO\n|gender=male\n|status=${status}\n|years=2010-\n}}\n\nBody text.`;

describe('extractStatusParam', () => {
  test('reads status from {{Utaite}}', () => {
    expect(extractStatusParam(infobox('{{Active}}'))).toBe('{{Active}}');
  });

  test('reads status from {{Youtaite}}', () => {
    expect(extractStatusParam(infobox('{{Inactive}}', 'Youtaite'))).toBe('{{Inactive}}');
  });

  test('reads status from {{Singer}}, the Youtaite redirect', () => {
    expect(extractStatusParam(infobox('{{Active}}', 'Singer'))).toBe('{{Active}}');
  });

  test('matches a lowercase template first character', () => {
    expect(extractStatusParam(infobox('{{Active}}', 'utaite'))).toBe('{{Active}}');
  });

  test('keeps a multi-line status value intact', () => {
    const raw = extractStatusParam(infobox('{{Graduated}} as Utaite<br/>\n{{Active}} as pro'));
    expect(raw).toBe('{{Graduated}} as Utaite<br/>\n{{Active}} as pro');
  });

  // Real live articles (Chomaiyo, Moldio, Tsukimi) open the infobox with a
  // section comment before the first parameter.
  test('reads status when a comment precedes the first parameter', () => {
    const text = '{{Utaite\n<!--Basic Information Section-->\n|cat = Utaite\n|status = {{Active}}\n}}';
    expect(extractStatusParam(text)).toBe('{{Active}}');
  });

  test('returns null when there is no status parameter', () => {
    expect(extractStatusParam('{{Utaite\n|gender=male\n}}')).toBeNull();
  });

  test('returns null when there is no infobox', () => {
    expect(extractStatusParam('Just prose.')).toBeNull();
  });
});

describe('detectStatus — confident template cases', () => {
  test('single {{Active}} does not suggest pinning', () => {
    const d = detectStatus(infobox('{{Active}}'));
    expect(d.activity).toBe('active');
    expect(d.confidence).toBe('confident');
    expect(d.suggestPin).toBe(false);
  });

  test('single {{Inactive}} suggests pinning', () => {
    const d = detectStatus(infobox('{{Inactive}}'));
    expect(d.activity).toBe('inactive');
    expect(d.confidence).toBe('confident');
    expect(d.suggestPin).toBe(true);
  });

  test('single {{Graduated}} suggests pinning', () => {
    const d = detectStatus(infobox('{{Graduated}}'));
    expect(d.activity).toBe('graduated');
    expect(d.suggestPin).toBe(true);
  });

  test('{{Hiatus}} is confident but does NOT suggest pinning', () => {
    const d = detectStatus(infobox('{{Hiatus}}'));
    expect(d.activity).toBe('hiatus');
    expect(d.confidence).toBe('confident');
    expect(d.suggestPin).toBe(false);
  });

  test('ignores {{cite}} noise alongside a status template', () => {
    const d = detectStatus(infobox('{{Inactive}}{{cite}}'));
    expect(d.activity).toBe('inactive');
    expect(d.confidence).toBe('confident');
  });

  test('ignores a <ref> alongside a status template', () => {
    const d = detectStatus(infobox('{{Inactive}}<ref>[https://x.example y]</ref>'));
    expect(d.activity).toBe('inactive');
    expect(d.confidence).toBe('confident');
  });
});

describe('detectStatus — multi-template cases', () => {
  test('mixed active and inactive is ambiguous', () => {
    const d = detectStatus(infobox('{{Graduated}} as Utaite<br/>{{Active}} as pro singer'));
    expect(d.confidence).toBe('ambiguous');
    expect(d.suggestPin).toBe(false);
    expect(d.raw).toContain('{{Graduated}}');
  });

  test('several inactive-ish templates stay confident', () => {
    const d = detectStatus(infobox('{{Graduated}} and {{Inactive}}'));
    expect(d.confidence).toBe('confident');
    expect(d.suggestPin).toBe(true);
  });
});

describe('detectStatus — bare text', () => {
  test.each([
    ['Active', 'active', false],
    ['Inactive', 'inactive', true],
    ['inactive', 'inactive', true],
    ['Deceased', 'deceased', true],
    ['Retired', 'retired', true],
    ['Graduated', 'graduated', true],
    ['Hiatus', 'hiatus', false]
  ])('recognises %s', (text, activity, pin) => {
    const d = detectStatus(infobox(text as string));
    expect(d.activity).toBe(activity);
    expect(d.confidence).toBe('confident');
    expect(d.suggestPin).toBe(pin);
  });
});

describe('detectStatus — the unreadable tail', () => {
  test.each([
    'Semi-active',
    'Active (on hiatus)',
    'Inctive',
    'active occasionally',
    'Revived'
  ])('%s is unknown and never pins', (text) => {
    const d = detectStatus(infobox(text));
    expect(d.confidence).toBe('unknown');
    expect(d.suggestPin).toBe(false);
    expect(d.raw).toBe(text);
  });

  test('a missing status parameter is unknown with null raw', () => {
    const d = detectStatus('{{Utaite\n|gender=male\n}}');
    expect(d.confidence).toBe('unknown');
    expect(d.raw).toBeNull();
    expect(d.suggestPin).toBe(false);
  });

  test('every result carries non-empty evidence text', () => {
    for (const text of ['{{Active}}', 'Semi-active', '{{Graduated}} and {{Active}}']) {
      expect(detectStatus(infobox(text)).evidence.length).toBeGreaterThan(0);
    }
  });
});
