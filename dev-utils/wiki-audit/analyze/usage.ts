import type { Manifest } from '../lib/types.ts';

export type UsageTier = 'USED' | 'INTERNAL' | 'DOC-ONLY' | 'UNUSED';

export interface UsageRecord {
  title: string;
  transclusions: number;
  transclusionsCapped: boolean;
  transcludedFrom: string[];
  requiredBy: string[];
  gadgetRefs: string[];
  tier: UsageTier;
  needsManualReview: boolean;
}

export interface ClassifyInput {
  transclusions: number;
  transcludedFrom: string[];
  requiredBy: string[];
  gadgetRefs: string[];
  dynamic: boolean;
}

/**
 * Maps every title to its final redirect target so that usage of a redirect
 * counts as usage of the target. Without this, targets look under-used and
 * redirects look orphaned — the failure mode that would make the whole report
 * untrustworthy.
 */
export function resolveRedirects(m: Manifest): Map<string, string> {
  const target = new Map<string, string>();
  for (const e of m.entries) {
    target.set(e.title, e.redirect && e.redirectTarget ? e.redirectTarget : e.title);
  }

  const out = new Map<string, string>();
  for (const start of target.keys()) {
    let cur = start;
    const seen = new Set<string>([cur]);
    for (;;) {
      const next = target.get(cur);
      if (!next || next === cur) break;
      if (seen.has(next)) break; // cycle — stop where we are rather than spin
      seen.add(next);
      cur = next;
    }
    out.set(start, cur);
  }
  return out;
}

const REQUIRE_RX = /(?:require|mw\.loadData)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

export function extractRequires(lua: string): string[] {
  const out = new Set<string>();
  for (const m of lua.matchAll(REQUIRE_RX)) {
    // Dev:* resolves to the Fandom Dev wiki, not a page on this wiki.
    if (m[1].startsWith('Module:')) out.add(m[1]);
  }
  return [...out];
}

const GADGET_REF_RX = /['"](?:Template|Module):[^'"\n]{1,120}?['"]/g;

export function extractGadgetRefs(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(GADGET_REF_RX)) out.add(m[0].slice(1, -1));
  return [...out];
}

/** Pages whose transclusion of something says nothing about real use. */
const DOCISH = /\/(doc|sandbox|Draft|testcases)$/i;

export function classify(input: ClassifyInput): { tier: UsageTier; needsManualReview: boolean } {
  const { transclusions, transcludedFrom, requiredBy, gadgetRefs, dynamic } = input;

  if (gadgetRefs.length > 0) return { tier: 'USED', needsManualReview: false };

  const real = transcludedFrom.filter((t) => !DOCISH.test(t));
  const contentSpace = real.filter((t) => !/^(Template|Module):/.test(t));

  if (contentSpace.length > 0) return { tier: 'USED', needsManualReview: dynamic };
  // Alive but invisible: used only by other templates/modules. Never a
  // deletion candidate.
  if (requiredBy.length > 0 || real.length > 0) return { tier: 'INTERNAL', needsManualReview: dynamic };
  if (transclusions > 0) return { tier: 'DOC-ONLY', needsManualReview: dynamic };
  return { tier: 'UNUSED', needsManualReview: dynamic };
}
