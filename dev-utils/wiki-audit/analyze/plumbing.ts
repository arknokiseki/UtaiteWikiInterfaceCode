import type { Manifest } from '../lib/types.ts';

export type PlumbingKind =
  | 'doc-redirect-circular'
  | 'doc-redirect-to-template'
  | 'doc-in-userspace'
  | 'doc-shared'
  | 'doc-on-redirect'
  | 'doc-subject-missing'
  | 'double-redirect'
  | 'redirect-broken';

export interface Finding {
  kind: PlumbingKind;
  title: string;
  detail: string;
}

const isDoc = (t: string) => t.endsWith('/doc');
const subjectOf = (t: string) => t.slice(0, -'/doc'.length);

export function findPlumbingIssues(m: Manifest): Finding[] {
  const out: Finding[] = [];
  const byTitle = new Map(m.entries.map((e) => [e.title, e]));

  for (const e of m.entries) {
    // A /doc page that is itself a redirect.
    if (isDoc(e.title) && e.redirect && e.redirectTarget) {
      const target = e.redirectTarget;
      if (target === subjectOf(e.title)) {
        out.push({
          kind: 'doc-redirect-circular',
          title: e.title,
          detail: `redirects to its own subject ${target}`,
        });
      } else if (/^User:/.test(target)) {
        out.push({
          kind: 'doc-in-userspace',
          title: e.title,
          detail: `documentation lives at ${target}`,
        });
      } else if (isDoc(target)) {
        // Legitimate: one template deliberately reusing another's doc.
        out.push({ kind: 'doc-shared', title: e.title, detail: `shares documentation with ${target}` });
      } else {
        out.push({
          kind: 'doc-redirect-to-template',
          title: e.title,
          detail: `points at ${target}, which is not a /doc page`,
        });
      }
    }

    // A /doc whose subject is missing, or is itself a redirect.
    if (isDoc(e.title) && !e.redirect) {
      const subject = byTitle.get(subjectOf(e.title));
      if (!subject) {
        out.push({
          kind: 'doc-subject-missing',
          title: e.title,
          detail: `${subjectOf(e.title)} does not exist`,
        });
      } else if (subject.redirect) {
        out.push({
          kind: 'doc-on-redirect',
          title: e.title,
          detail: `${subject.title} is a redirect to ${subject.redirectTarget}`,
        });
      }
    }

    // Redirect health.
    if (e.redirect && e.redirectTarget) {
      const target = byTitle.get(e.redirectTarget);
      if (!target) {
        // Only Template:/Module: targets are in the mirror, so a missing target
        // elsewhere means "not audited", not "broken".
        if (/^(Template|Module):/.test(e.redirectTarget)) {
          out.push({
            kind: 'redirect-broken',
            title: e.title,
            detail: `target ${e.redirectTarget} does not exist`,
          });
        }
      } else if (target.redirect) {
        out.push({
          kind: 'double-redirect',
          title: e.title,
          detail: `${e.redirectTarget} is itself a redirect to ${target.redirectTarget}`,
        });
      }
    }
  }

  return out;
}
