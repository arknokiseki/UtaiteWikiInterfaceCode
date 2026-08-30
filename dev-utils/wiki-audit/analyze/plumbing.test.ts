import { findPlumbingIssues } from './plumbing.ts';
import type { Manifest } from '../lib/types.ts';

function m(entries: any[]): Manifest {
  return { fetchedAt: '', apiUrl: '', entries };
}
const kinds = (f: any[]) => f.map((x) => x.kind);

describe('findPlumbingIssues', () => {
  test('flags a /doc redirecting to its own template as circular', () => {
    const f = findPlumbingIssues(
      m([
        { title: 'Template:Cclang', redirect: false },
        { title: 'Template:Cclang/doc', redirect: true, redirectTarget: 'Template:Cclang' },
      ]),
    );
    expect(kinds(f)).toContain('doc-redirect-circular');
  });

  test('flags a /doc redirecting to a template that is not a doc', () => {
    const f = findPlumbingIssues(
      m([
        { title: 'Template:Tabs/doc', redirect: true, redirectTarget: 'Template:CustomTabs' },
        { title: 'Template:CustomTabs', redirect: false },
      ]),
    );
    expect(kinds(f)).toContain('doc-redirect-to-template');
  });

  test('flags documentation living in userspace', () => {
    const f = findPlumbingIssues(
      m([
        {
          title: 'Template:SingerType2/doc',
          redirect: true,
          redirectTarget: 'User:Someone/Sandbox/old/doc',
        },
      ]),
    );
    expect(kinds(f)).toContain('doc-in-userspace');
  });

  test('records deliberate doc-sharing as its own kind, not a fault', () => {
    const f = findPlumbingIssues(
      m([
        { title: 'Template:Singer/doc', redirect: true, redirectTarget: 'Template:Youtaite/doc' },
        { title: 'Template:Youtaite/doc', redirect: false },
      ]),
    );
    expect(kinds(f)).toContain('doc-shared');
    expect(kinds(f)).not.toContain('doc-redirect-to-template');
  });

  test('flags a doc attached to a redirect page', () => {
    const f = findPlumbingIssues(
      m([
        { title: 'Template:Mbox', redirect: true, redirectTarget: 'Template:Ambox' },
        { title: 'Template:Mbox/doc', redirect: false },
        { title: 'Template:Ambox', redirect: false },
      ]),
    );
    expect(kinds(f)).toContain('doc-on-redirect');
  });

  test('flags a doc whose subject page does not exist', () => {
    const f = findPlumbingIssues(m([{ title: 'Template:Main page/doc', redirect: false }]));
    expect(kinds(f)).toContain('doc-subject-missing');
  });

  test('flags a double redirect', () => {
    const f = findPlumbingIssues(
      m([
        { title: 'Template:A', redirect: true, redirectTarget: 'Template:B' },
        { title: 'Template:B', redirect: true, redirectTarget: 'Template:C' },
        { title: 'Template:C', redirect: false },
      ]),
    );
    expect(kinds(f)).toContain('double-redirect');
  });

  test('flags a redirect whose target does not exist', () => {
    const f = findPlumbingIssues(
      m([{ title: 'Template:A', redirect: true, redirectTarget: 'Template:Gone' }]),
    );
    expect(kinds(f)).toContain('redirect-broken');
  });

  test('does not call a cross-namespace redirect target broken', () => {
    const f = findPlumbingIssues(
      m([{ title: 'Template:A', redirect: true, redirectTarget: 'Help:Something' }]),
    );
    expect(kinds(f)).not.toContain('redirect-broken');
  });

  test('every finding carries a title and a detail', () => {
    const f = findPlumbingIssues(
      m([
        { title: 'Template:Cclang', redirect: false },
        { title: 'Template:Cclang/doc', redirect: true, redirectTarget: 'Template:Cclang' },
      ]),
    );
    expect(f[0].title).toBeTruthy();
    expect(f[0].detail).toBeTruthy();
  });

  test('returns nothing for a healthy wiki', () => {
    const f = findPlumbingIssues(
      m([
        { title: 'Template:Uptodate', redirect: false },
        { title: 'Template:Uptodate/doc', redirect: false },
      ]),
    );
    expect(f).toEqual([]);
  });
});
