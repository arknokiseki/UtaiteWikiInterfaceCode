import { resolveRedirects, extractRequires, extractGadgetRefs, classify } from './usage.ts';
import type { Manifest } from '../lib/types.ts';

function manifest(entries: any[]): Manifest {
  return { fetchedAt: '', apiUrl: '', entries };
}

describe('resolveRedirects — usage must count toward the target', () => {
  test('maps a redirect to its target', () => {
    const m = manifest([
      { title: 'Template:YT', redirect: true, redirectTarget: 'Template:Yt' },
      { title: 'Template:Yt', redirect: false },
    ]);
    expect(resolveRedirects(m).get('Template:YT')).toBe('Template:Yt');
  });

  test('follows a two-hop chain to the final target', () => {
    const m = manifest([
      { title: 'Template:A', redirect: true, redirectTarget: 'Template:B' },
      { title: 'Template:B', redirect: true, redirectTarget: 'Template:C' },
      { title: 'Template:C', redirect: false },
    ]);
    expect(resolveRedirects(m).get('Template:A')).toBe('Template:C');
  });

  test('does not loop forever on a cycle', () => {
    const m = manifest([
      { title: 'Template:A', redirect: true, redirectTarget: 'Template:B' },
      { title: 'Template:B', redirect: true, redirectTarget: 'Template:A' },
    ]);
    expect(() => resolveRedirects(m)).not.toThrow();
  });

  test('leaves non-redirects mapping to themselves', () => {
    const m = manifest([{ title: 'Template:Yt', redirect: false }]);
    expect(resolveRedirects(m).get('Template:Yt')).toBe('Template:Yt');
  });

  test('keeps a redirect to a page outside the manifest as that target', () => {
    const m = manifest([{ title: 'Template:A', redirect: true, redirectTarget: 'Template:Gone' }]);
    expect(resolveRedirects(m).get('Template:A')).toBe('Template:Gone');
  });
});

describe('extractRequires — module-to-module edges', () => {
  test('finds a single-quoted require', () => {
    expect(extractRequires("local y = require('Module:Yesno')")).toEqual(['Module:Yesno']);
  });

  test('finds a double-quoted require', () => {
    expect(extractRequires('require("Module:TableTools")')).toEqual(['Module:TableTools']);
  });

  test('finds mw.loadData', () => {
    expect(extractRequires("mw.loadData('Module:Utaite/data')")).toEqual(['Module:Utaite/data']);
  });

  test('finds several and de-duplicates', () => {
    const lua = "require('Module:Yesno') require('Module:Yesno') require('Module:Args')";
    expect(extractRequires(lua).sort()).toEqual(['Module:Args', 'Module:Yesno']);
  });

  test('ignores a Dev: require, which is not a local module', () => {
    expect(extractRequires("require('Dev:Documentation')")).toEqual([]);
  });

  test('returns empty for lua with no requires', () => {
    expect(extractRequires('local p = {} return p')).toEqual([]);
  });

  test('tolerates whitespace inside the call', () => {
    expect(extractRequires("require( 'Module:Yesno' )")).toEqual(['Module:Yesno']);
  });
});

describe('extractGadgetRefs — templates a gadget writes at runtime', () => {
  test('finds a Template: string in JS', () => {
    expect(extractGadgetRefs("api.edit('Template:Uptodate', ...)")).toEqual(['Template:Uptodate']);
  });

  test('finds a Module: string', () => {
    expect(extractGadgetRefs('var m = "Module:Freshness";')).toEqual(['Module:Freshness']);
  });

  test('de-duplicates repeated references', () => {
    expect(extractGadgetRefs("'Template:Uptodate' 'Template:Uptodate'")).toEqual(['Template:Uptodate']);
  });

  test('returns empty when there are none', () => {
    expect(extractGadgetRefs('function foo() { return 1; }')).toEqual([]);
  });
});

describe('classify — tiers, not a boolean', () => {
  const base = {
    transclusions: 0,
    transcludedFrom: [] as string[],
    requiredBy: [] as string[],
    gadgetRefs: [] as string[],
    dynamic: false,
  };

  test('mainspace transclusion is USED', () => {
    expect(classify({ ...base, transclusions: 12, transcludedFrom: ['Some Article'] }).tier).toBe('USED');
  });

  test('a gadget reference alone is USED', () => {
    expect(classify({ ...base, gadgetRefs: ['Gadget-UptodateEditor.js'] }).tier).toBe('USED');
  });

  test('required by another module is INTERNAL, not a deletion candidate', () => {
    expect(classify({ ...base, requiredBy: ['Module:Documentation'] }).tier).toBe('INTERNAL');
  });

  test('transcluded only from other templates is INTERNAL', () => {
    expect(
      classify({ ...base, transclusions: 3, transcludedFrom: ['Template:Foo', 'Module:Bar'] }).tier,
    ).toBe('INTERNAL');
  });

  test('used only from doc and sandbox pages is DOC-ONLY', () => {
    expect(
      classify({
        ...base,
        transclusions: 2,
        transcludedFrom: ['Template:Foo/doc', 'Template:Bar/sandbox'],
      }).tier,
    ).toBe('DOC-ONLY');
  });

  test('no edges at all is UNUSED', () => {
    expect(classify(base).tier).toBe('UNUSED');
  });

  test('a dynamic invocation is never reported as confidently dead', () => {
    const got = classify({ ...base, dynamic: true });
    expect(got.tier).toBe('UNUSED');
    expect(got.needsManualReview).toBe(true);
  });

  test('a plainly used page does not need manual review', () => {
    expect(classify({ ...base, transclusions: 40, transcludedFrom: ['Article'] }).needsManualReview).toBe(
      false,
    );
  });

  test('a User: page counts as real use, not doc-only', () => {
    expect(classify({ ...base, transclusions: 1, transcludedFrom: ['User:Someone'] }).tier).toBe('USED');
  });
});
