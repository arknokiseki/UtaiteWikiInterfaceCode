import {
  normalizeTemplateName,
  findUptodateCall,
  applyEdits
} from './uptodate-params.js';

// Real shapes surveyed from live /Songs pages (spec §4).
const LIVE_SHAPES = [
  '{{Uptodate|February 6, 2026}}',
  '{{uptodate|February 6, 2026}}',
  '{{Uptodate|October 31, 2023|||bordercolor=#A97A3F}}',
  '{{Uptodate|March 3, 2024|nocat=true}}',
  '{{Uptodate|May 1, 2022|||12:30|nocat=true}}',
  '{{Uptodate|May 1, 2022|||12:30|bordercolor=#fff|nocat=true}}',
  '{{Uptodate|June 9, 2021|bordercolor=#abcdef|utdcolor=#000}}',
  '{{Uptodate | July 4, 2020 | bordercolor = #123456 }}',
  '{{Uptodate|August 2, 2019|discography=yes}}',
  '{{Uptodate|2021-05-04}}',
  '{{Uptodate|2021年5月4日}}'
];

describe('normalizeTemplateName', () => {
  test('uppercases only the first character', () => {
    expect(normalizeTemplateName('uptodate')).toBe('Uptodate');
    expect(normalizeTemplateName('Uptodate')).toBe('Uptodate');
  });

  test('does not fold interior case', () => {
    expect(normalizeTemplateName('UpToDate')).toBe('UpToDate');
  });

  test('treats underscores as spaces and trims', () => {
    expect(normalizeTemplateName('  status_templates ')).toBe('Status templates');
  });

  test('strips a Template: prefix and leading colon', () => {
    expect(normalizeTemplateName(':Template:uptodate')).toBe('Uptodate');
  });

  // Live infoboxes are written as `{{Utaite\n<!--Basic Information-->\n|cat=...}}`,
  // so the name slice up to the first pipe really does contain a comment.
  test('strips an HTML comment from the name slice', () => {
    expect(normalizeTemplateName('Utaite\n<!--Basic Information Section-->\n')).toBe('Utaite');
  });
});

describe('findUptodateCall', () => {
  test('finds a bare call', () => {
    const call = findUptodateCall('{{Uptodate|February 6, 2026}}');
    expect(call).not.toBeNull();
    expect(call!.params).toHaveLength(1);
    expect(call!.params[0].index).toBe(1);
    expect(call!.params[0].value).toBe('February 6, 2026');
  });

  test('matches a lowercase first character', () => {
    expect(findUptodateCall('{{uptodate|X}}')).not.toBeNull();
  });

  test('does not match Uptodate/sync', () => {
    expect(findUptodateCall('{{Uptodate/sync}}')).toBeNull();
  });

  test('does not match the legacy Outdated template', () => {
    expect(findUptodateCall('{{Outdated|May 1, 2020}}')).toBeNull();
  });

  test('does not match an interior case variant', () => {
    expect(findUptodateCall('{{UpToDate|X}}')).toBeNull();
  });

  test('separates positional from named parameters', () => {
    const call = findUptodateCall('{{Uptodate|D|||12:30|bordercolor=#fff|nocat=true}}')!;
    const positional = call.params.filter(p => p.index !== null);
    const named = call.params.filter(p => p.name !== null);
    expect(positional.map(p => p.index)).toEqual([1, 2, 3, 4]);
    expect(named.map(p => p.name)).toEqual(['bordercolor', 'nocat']);
    expect(named[1].value).toBe('true');
  });

  test('does not split on a pipe nested inside a template', () => {
    const call = findUptodateCall('{{Uptodate|{{#if:x|a|b}}|nocat=true}}')!;
    expect(call.params).toHaveLength(2);
    expect(call.params[0].value).toBe('{{#if:x|a|b}}');
  });

  test('does not split on a pipe nested inside a wikilink', () => {
    const call = findUptodateCall('{{Uptodate|D|reason=see [[A|B]] please}}')!;
    expect(call.params).toHaveLength(2);
    expect(call.params[1].value).toBe('see [[A|B]] please');
  });

  test('does not split on a pipe inside an HTML comment', () => {
    const call = findUptodateCall('{{Uptodate|D<!-- a|b -->|nocat=true}}')!;
    expect(call.params).toHaveLength(2);
  });

  test('matches when a comment precedes the first pipe', () => {
    const call = findUptodateCall('{{Uptodate<!-- note -->|February 6, 2026}}');
    expect(call).not.toBeNull();
    expect(call!.params[0].value).toBe('February 6, 2026');
  });

  test('preserves a name-slice comment through a round-trip', () => {
    const input = '{{Uptodate<!-- note -->|Old}}';
    expect(applyEdits(input, {})).toBe(input);
    expect(applyEdits(input, { date: 'New' })).toBe('{{Uptodate<!-- note -->|New}}');
  });

  test('reports offsets that bound the call', () => {
    const text = 'lead\n{{Uptodate|D}}\ntail';
    const call = findUptodateCall(text)!;
    expect(text.slice(call.start, call.end)).toBe('{{Uptodate|D}}');
  });
});

describe('applyEdits round-trip', () => {
  test.each(LIVE_SHAPES)('no-op edit is byte-identical: %s', (shape) => {
    expect(applyEdits(shape, {})).toBe(shape);
  });

  test('returns null when there is no call', () => {
    expect(applyEdits('no template here', { date: 'X' })).toBeNull();
  });
});

describe('applyEdits mutations', () => {
  test('replaces the date in place', () => {
    expect(applyEdits('{{Uptodate|February 6, 2026}}', { date: 'March 1, 2026' }))
      .toBe('{{Uptodate|March 1, 2026}}');
  });

  test('preserves legacy empty positionals when editing the date', () => {
    expect(applyEdits('{{Uptodate|Old|||12:30|nocat=true}}', { date: 'New' }))
      .toBe('{{Uptodate|New|||12:30|nocat=true}}');
  });

  test('preserves the dead utdcolor parameter', () => {
    const input = '{{Uptodate|Old|bordercolor=#abcdef|utdcolor=#000}}';
    expect(applyEdits(input, { date: 'New' }))
      .toBe('{{Uptodate|New|bordercolor=#abcdef|utdcolor=#000}}');
  });

  test('preserves whitespace around a replaced named value', () => {
    expect(applyEdits('{{Uptodate | D | bordercolor = #123456 }}', { bordercolor: '#ffffff' }))
      .toBe('{{Uptodate | D | bordercolor = #ffffff }}');
  });

  test('appends a named parameter that is not present', () => {
    expect(applyEdits('{{Uptodate|D}}', { 'force-uptodate': 'yes' }))
      .toBe('{{Uptodate|D|force-uptodate=yes}}');
  });

  test('updates an existing named parameter rather than appending', () => {
    expect(applyEdits('{{Uptodate|D|nocat=true}}', { nocat: 'false' }))
      .toBe('{{Uptodate|D|nocat=false}}');
  });

  test('removes a named parameter when the edit value is null', () => {
    expect(applyEdits('{{Uptodate|D|force-uptodate=yes|nocat=true}}', { 'force-uptodate': null }))
      .toBe('{{Uptodate|D|nocat=true}}');
  });

  test('removing an absent parameter is a no-op', () => {
    expect(applyEdits('{{Uptodate|D}}', { 'force-uptodate': null }))
      .toBe('{{Uptodate|D}}');
  });

  test('prefers a named updated-at over positional 1 for the date', () => {
    expect(applyEdits('{{Uptodate|updated-at=Old|nocat=true}}', { date: 'New' }))
      .toBe('{{Uptodate|updated-at=New|nocat=true}}');
  });

  test('edits only the call, leaving surrounding wikitext untouched', () => {
    const input = '{{Uptodate|Old}}\n== Songs ==\ntext';
    expect(applyEdits(input, { date: 'New' }))
      .toBe('{{Uptodate|New}}\n== Songs ==\ntext');
  });
});
