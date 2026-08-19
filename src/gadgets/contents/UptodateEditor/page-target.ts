/**
 * Resolves which page actually holds the {{Uptodate}} wikitext, and performs
 * the read/write against the MediaWiki API.
 *
 * The freshness box renders on both the article and its /Songs subpage, but
 * the editable source lives in exactly one of them.
 */

import { findUptodateCall } from './uptodate-params.js';

/** Narrow view of mw.Api — narrow enough to stub in tests. */
export interface WikiApi {
    get(params: Record<string, unknown>): Promise<Record<string, any>>;
    postWithToken(token: string, params: Record<string, unknown>): Promise<Record<string, any>>;
}

export interface PageTarget {
    /** Page whose wikitext contains the {{Uptodate}} call. */
    editTitle: string;
    /** Root article carrying the infobox `status` parameter. */
    rootTitle: string;
}

export interface FetchedPage {
    title: string;
    content: string;
    /** Revision timestamp, used for edit-conflict detection. */
    timestamp: string;
}

const SONGS_SUFFIX = '/Songs';

/** Decides which page to edit and which article carries the infobox. */
export function resolveTarget(pageName: string, wikitext: string): PageTarget {
    if (pageName.endsWith(SONGS_SUFFIX)) {
        return {
            editTitle: pageName,
            rootTitle: pageName.slice(0, -SONGS_SUFFIX.length)
        };
    }
    if (findUptodateCall(wikitext)) {
        return { editTitle: pageName, rootTitle: pageName };
    }
    return { editTitle: pageName + SONGS_SUFFIX, rootTitle: pageName };
}

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Formats a date as "Month D, YYYY" in JST. The wiki's templates use the
 * CURRENTJST* magic words throughout, so dates are Japan-time by convention.
 */
export function formatJstDate(now: Date): string {
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return MONTHS[jst.getUTCMonth()] + ' ' + jst.getUTCDate() + ', ' + jst.getUTCFullYear();
}

/** Reads a page's current wikitext, or null when it does not exist. */
export async function fetchPage(api: WikiApi, title: string): Promise<FetchedPage | null> {
    const data = await api.get({
        action: 'query',
        prop: 'revisions',
        rvprop: 'content|timestamp',
        rvslots: 'main',
        titles: title,
        formatversion: 2
    });

    const pages = data && data.query && data.query.pages;
    if (!pages || !pages.length) return null;

    const page = pages[0];
    if (page.missing || !page.revisions || !page.revisions.length) return null;

    const revision = page.revisions[0];
    return {
        title: page.title,
        content: revision.slots.main.content,
        timestamp: revision.timestamp
    };
}

/**
 * Writes new wikitext. `basetimestamp`/`starttimestamp` make the API reject
 * the edit if someone else saved in the meantime, rather than clobbering them.
 */
export async function savePage(
    api: WikiApi,
    page: FetchedPage,
    text: string,
    summary: string
): Promise<void> {
    await api.postWithToken('csrf', {
        action: 'edit',
        title: page.title,
        text: text,
        summary: summary,
        basetimestamp: page.timestamp,
        starttimestamp: page.timestamp,
        nocreate: 1,
        formatversion: 2
    });
}
