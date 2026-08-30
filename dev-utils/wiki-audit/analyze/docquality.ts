export type SizeTier = 'none' | 'stub' | 'thin' | 'adequate' | 'rich';

export interface DocScoreInput {
  /**
   * The /doc page wikitext, or undefined when NO /doc PAGE EXISTS.
   * Existence is what `hasDoc` reports — not whether the file could be read,
   * and not whether it has any content. An existing but empty doc is
   * "documented" for coverage purposes and caught by sizeTier/gap instead.
   */
  doc: string | undefined;
  /** The template's own source, used to extract its real parameter set. */
  source: string;
  /** True when a Template:X/styles.css page exists for this template. */
  hasStylesPage: boolean;
}

export interface DocScore {
  hasDoc: boolean;
  sizeTier: SizeTier;
  hasTemplateData: boolean;
  hasHeader: boolean;
  /** True when there is no stylesheet, or there is one and the doc mentions it. */
  mentionsStyles: boolean;
  undocumentedParams: string[];
  /** Priority signal: higher means a bigger documentation gap. */
  gap: number;
}

const PARAM_RX = /\{\{\{\s*([^|{}]+?)\s*[|}]/g;

export function extractParameters(wikitext: string): string[] {
  const out = new Set<string>();
  for (const m of wikitext.matchAll(PARAM_RX)) out.add(m[1].trim());
  return [...out];
}

export function extractDocumentedParameters(doc: string): string[] {
  const out = new Set<string>();

  const td = doc.match(/<templatedata>([\s\S]*?)<\/templatedata>/i);
  if (td) {
    try {
      const parsed = JSON.parse(td[1]);
      for (const k of Object.keys(parsed?.params ?? {})) out.add(k);
    } catch {
      // Malformed TemplateData is itself a finding, not a reason to crash.
    }
  }

  for (const m of doc.matchAll(/<code>\s*([A-Za-z0-9_-]+)\s*=/g)) out.add(m[1]);
  return [...out];
}

function tierOf(len: number): SizeTier {
  if (len === 0) return 'none';
  if (len < 200) return 'stub';
  if (len < 600) return 'thin';
  if (len < 2000) return 'adequate';
  return 'rich';
}

const HEADER_RX = /\{\{Documentation\/Header\}\}/i;

export function scoreDoc(input: DocScoreInput): DocScore {
  const doc = input.doc ?? '';
  const hasDoc = input.doc !== undefined;

  const actual = extractParameters(input.source);
  const documented = new Set(extractDocumentedParameters(doc));
  const undocumentedParams = actual.filter((p) => !documented.has(p));

  const mentionsStyles = !input.hasStylesPage || /styles\.css/i.test(doc);
  const hasHeader = HEADER_RX.test(doc);

  // Missing parameters dominate: a 2 KB doc that omits six parameters is worse
  // than a 400 B doc that covers all three. Doc byte-length deliberately does
  // NOT feed this score. A missing doc is a flat penalty; an unmentioned
  // stylesheet and a missing house header are small nudges.
  const gap =
    undocumentedParams.length * 10 +
    (hasDoc ? 0 : 25) +
    (mentionsStyles ? 0 : 5) +
    (hasDoc && !hasHeader ? 3 : 0);

  return {
    hasDoc,
    sizeTier: tierOf(doc.length),
    hasTemplateData: /<templatedata>/i.test(doc),
    hasHeader,
    mentionsStyles,
    undocumentedParams,
    gap,
  };
}
