export type ContentModel = 'wikitext' | 'Scribunto' | 'sanitized-css' | 'json' | 'text';

export interface FirstRevision {
  user: string;
  timestamp: string;
  comment: string;
  /** Interwiki prefix without '>', e.g. 'mw', 'wikia', 'mh', 'wp', 'meta'. Empty string = native. */
  sourceWiki: string;
}

export interface ManifestEntry {
  title: string;
  /** Repo-relative, POSIX separators, e.g. 'wiki/templates/Uptodate/doc.wikitext'. */
  path: string;
  ns: 10 | 828;
  model: ContentModel;
  length: number;
  sha1: string;
  revid: number;
  timestamp: string;
  redirect: boolean;
  redirectTarget?: string;
  firstRevision?: FirstRevision;
}

export interface Manifest {
  fetchedAt: string;
  apiUrl: string;
  entries: ManifestEntry[];
}
