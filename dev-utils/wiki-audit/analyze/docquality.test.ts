import { extractParameters, extractDocumentedParameters, scoreDoc } from './docquality.ts';

describe("extractParameters — the template's real parameter set", () => {
  test('finds named parameters with defaults', () => {
    expect(extractParameters('{{{date|}}} and {{{bordercolor|#fff}}}').sort()).toEqual([
      'bordercolor',
      'date',
    ]);
  });

  test('finds a parameter with no default', () => {
    expect(extractParameters('{{{name}}}')).toEqual(['name']);
  });

  test('finds numbered parameters', () => {
    expect(extractParameters('{{{1|}}} {{{2|}}}').sort()).toEqual(['1', '2']);
  });

  test('de-duplicates repeated uses', () => {
    expect(extractParameters('{{{date|}}} {{{date|}}}')).toEqual(['date']);
  });

  test('does not mistake a template call for a parameter', () => {
    expect(extractParameters('{{Foo|bar=baz}}')).toEqual([]);
  });

  test('trims whitespace in the parameter name', () => {
    expect(extractParameters('{{{ date | }}}')).toEqual(['date']);
  });

  test('returns empty for source with no parameters', () => {
    expect(extractParameters("''just text''")).toEqual([]);
  });
});

describe('extractDocumentedParameters', () => {
  test('reads names out of a templatedata block', () => {
    const doc = `<templatedata>{"params":{"date":{},"bordercolor":{}}}</templatedata>`;
    expect(extractDocumentedParameters(doc).sort()).toEqual(['bordercolor', 'date']);
  });

  test('reads names mentioned in prose as code', () => {
    expect(extractDocumentedParameters('use <code>force-uptodate=yes</code>')).toEqual(['force-uptodate']);
  });

  test('survives malformed templatedata without throwing', () => {
    expect(() => extractDocumentedParameters('<templatedata>{not json}</templatedata>')).not.toThrow();
  });

  test('returns empty for an empty doc', () => {
    expect(extractDocumentedParameters('')).toEqual([]);
  });

  test('combines templatedata and prose mentions', () => {
    const doc = `<templatedata>{"params":{"date":{}}}</templatedata> also <code>color=</code>`;
    expect(extractDocumentedParameters(doc).sort()).toEqual(['color', 'date']);
  });
});

describe('scoreDoc', () => {
  const base = { doc: undefined as string | undefined, source: '', hasStylesPage: false };

  test('marks a missing doc', () => {
    const s = scoreDoc(base);
    expect(s.hasDoc).toBe(false);
    expect(s.sizeTier).toBe('none');
  });

  test('tiers doc size', () => {
    expect(scoreDoc({ ...base, doc: 'x'.repeat(100) }).sizeTier).toBe('stub');
    expect(scoreDoc({ ...base, doc: 'x'.repeat(400) }).sizeTier).toBe('thin');
    expect(scoreDoc({ ...base, doc: 'x'.repeat(1000) }).sizeTier).toBe('adequate');
    expect(scoreDoc({ ...base, doc: 'x'.repeat(3000) }).sizeTier).toBe('rich');
  });

  test('detects templatedata and the house header', () => {
    const s = scoreDoc({ ...base, doc: '{{Documentation/Header}} <templatedata>{}</templatedata>' });
    expect(s.hasTemplateData).toBe(true);
    expect(s.hasHeader).toBe(true);
  });

  test('flags a stylesheet the doc never mentions', () => {
    const s = scoreDoc({ ...base, doc: 'nothing about styling', hasStylesPage: true });
    expect(s.mentionsStyles).toBe(false);
  });

  test('accepts a doc that does mention its stylesheet', () => {
    const s = scoreDoc({ ...base, doc: 'styling lives in /styles.css', hasStylesPage: true });
    expect(s.mentionsStyles).toBe(true);
  });

  test('a template with no stylesheet is never faulted for not mentioning one', () => {
    expect(scoreDoc({ ...base, doc: 'anything', hasStylesPage: false }).mentionsStyles).toBe(true);
  });

  test('counts undocumented parameters', () => {
    const s = scoreDoc({
      ...base,
      source: '{{{date|}}} {{{color|}}} {{{size|}}}',
      doc: 'only <code>date=</code> here',
    });
    expect(s.undocumentedParams.sort()).toEqual(['color', 'size']);
  });

  test('gap is higher for a rich doc missing many params than a short complete one', () => {
    const missingMany = scoreDoc({ ...base, source: '{{{a|}}}{{{b|}}}{{{c|}}}{{{d|}}}', doc: 'x'.repeat(3000) });
    const shortComplete = scoreDoc({ ...base, source: '{{{a|}}}', doc: 'covers <code>a=</code>' });
    expect(missingMany.gap).toBeGreaterThan(shortComplete.gap);
  });

  test('a missing doc scores a worse gap than a complete one', () => {
    const none = scoreDoc({ ...base, source: '{{{a|}}}' });
    const complete = scoreDoc({ ...base, source: '{{{a|}}}', doc: 'covers <code>a=</code>' });
    expect(none.gap).toBeGreaterThan(complete.gap);
  });

  test('a fully documented page with the house header scores gap 0', () => {
    const s = scoreDoc({
      ...base,
      source: '{{{a|}}}',
      doc: '{{Documentation/Header}} covers <code>a=</code>',
    });
    expect(s.gap).toBe(0);
  });
});
