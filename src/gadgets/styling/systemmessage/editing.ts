/**
 * Edit Page Header Customizer
 * Replaces the default "Editing $1" title
 */

// --- Type Definitions ---

interface ApiPageInfo {
    pageid: number;
    ns: number;
    title: string;
    missing?: string;
}

interface ApiQueryInfoResponse {
    query?: {
        pages?: Record<string, ApiPageInfo>;
    };
}

interface MwApi {
    get: (params: Record<string, unknown>) => JQuery.Promise<ApiQueryInfoResponse>;
}

declare const mw: {
    config: {
        get: <T>(key: string) => T;
    };
    util: {
        getUrl: (title: string) => string;
    };
    loader: {
        using: (modules: string[]) => JQuery.Promise<void>;
    };
    Api: new () => MwApi;
};

declare const mediaWiki: typeof mw;

// --- Implementation ---

(function (mw: typeof mediaWiki, $: JQueryStatic): void {
    'use strict';

    // Ensure API and Util modules are loaded
    mw.loader.using(['mediawiki.api', 'mediawiki.util']).then(function (): void {
        $(function (): void {
            if (mw.config.get<string>('wgAction') !== 'edit') {
                return;
            }

            const targetElement = document.querySelector('.citizen-page-heading');

            if (targetElement) {
                $(targetElement).addClass('edit-header');

                const pageName = mw.config.get<string>('wgPageName');
                // Simple formatting: replace underscores with spaces
                const displayTitle = pageName.replace(/_/g, ' ');

                const api = new mw.Api();
                api.get({
                    action: 'query',
                    prop: 'info',
                    titles: pageName,
                    format: 'json'
                }).then(function (data: ApiQueryInfoResponse): void {
                    if (!data || !data.query || !data.query.pages) {
                        return;
                    }

                    const pages = data.query.pages;
                    const pageId = Object.keys(pages)[0];
                    // Check if page exists: ID is not -1 AND 'missing' property is absent
                    const pageExists = pageId !== '-1' && !Object.prototype.hasOwnProperty.call(pages[pageId], 'missing');

                    const linkUrl = mw.util.getUrl(pageName);
                    
                    let newHtml = '';

                    // Line 1: Label
                    newHtml += '<div style="font-size: 12px; font-weight: 700;"><i class="fa-regular fa-pen-to-square"></i>&nbsp;EDIT PAGE</div>';

                    // Line 2: Title (Linked if exists, Text if new)
                    newHtml += '<div style="font-size:1.15em; font-weight: 700;">';
                    if (pageExists) {
                        newHtml += '<a href="' + linkUrl + '">' + displayTitle + '</a>';
                    } else {
                        newHtml += displayTitle;
                    }
                    newHtml += '</div>';

                    targetElement.innerHTML = newHtml;
                });
            }
        });
    });
})(mediaWiki, jQuery);