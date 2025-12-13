interface MwApi {
    post: (params: Record<string, unknown>) => JQuery.Promise<PurgeResponse, ApiError>;
}

interface PurgeResponse {
    purge?: Array<{ title: string; purged?: boolean }>;
}

interface ApiError {
    error: {
        info: string;
        code: string;
    };
}

interface MwTitle {
    namespace: number;
    title: string;
}

declare const mw: {
    config: {
        get: (key: string) => string | number | null;
    };
    util: {
        getUrl: (page: string) => string;
    };
    Api: new () => MwApi;
    Title: new (title: string) => MwTitle;
};

declare global {
    interface Window {
        quickPurgeLoaded?: boolean;
    }
}

(function (): void {
    'use strict';

    if (window.quickPurgeLoaded) return;
    window.quickPurgeLoaded = true;

    let purging = false;
    const indexPath = mw.config.get('wgScript') as string;

    function purgePage(page: string): void {
        new mw.Api()
            .post({
                action: 'purge',
                forcelinkupdate: true,
                titles: page
            })
            .then(
                function (res: PurgeResponse): void {
                    console.log(page);
                    console.log('Purge Result:', res);
                    location.replace(mw.util.getUrl(page));
                },
                function (_: unknown, e: ApiError): void {
                    console.warn(
                        'API Error in purging the page "' + page + '":',
                        e.error.info
                    );
                }
            );
    }

    $(function (): void {
        const wgAction = mw.config.get('wgAction') as string;
        const wgCanonicalSpecialPageName = mw.config.get('wgCanonicalSpecialPageName') as string | null;

        if (wgAction === 'purge' || wgCanonicalSpecialPageName === 'Purge') {
            let page = mw.config.get('wgPageName') as string;
            const link = new URL(location.href);

            if ((mw.config.get('wgNamespaceNumber') as number) === -1) {
                if (page.split('/').length > 1) {
                    page = page.split('/').slice(1).join('/');
                } else if (link.searchParams.get('page')) {
                    page = link.searchParams.get('page') as string;
                }
            }

            purgePage(page);
        }
    });

    $(document.body).on(
        'click',
        'a[href*="action=purge"], a[href*="action=Purge"], a[href*="Special:Purge"], a[href*="special:Purge"], a[href*="Special:purge"]',
        function (e: JQuery.ClickEvent): void {
            console.log(e);

            // Don't activate if meta keys are used
            if (e.ctrlKey || e.altKey || e.shiftKey) return;

            // Don't activate if already purging
            if (purging) return;

            purging = true;

            const target = e.target as HTMLAnchorElement;
            const link = new URL(target.href);
            let page: string | null = null;

            // Support all formats described at: https://www.mediawiki.org/wiki/Special:MyLanguage/Manual:Short_URL
            if (link.pathname === indexPath) {
                page = decodeURIComponent(link.searchParams.get('title') || '');
            } else if (link.pathname.startsWith(indexPath + '/')) {
                page = decodeURIComponent(link.pathname).substring(indexPath.length + 1);
            } else {
                const articlePath = mw.config.get('wgArticlePath') as string;
                page = decodeURIComponent(link.pathname).replace(
                    articlePath.replace(/\$1/, ''),
                    ''
                );
                const title = new mw.Title(page);

                // If title is `Special:Purge` remove it from the title
                if (title.namespace === -1) {
                    if (title.title.split('/').length > 1) {
                        page = title.title.split('/').slice(1).join('/');
                    } else if (link.searchParams.get('page')) {
                        page = link.searchParams.get('page');
                    }
                }
            }

            if (typeof page !== 'string' || page === '') {
                console.error('Failed to find page for "' + link.href + '"', link);
                purging = false;
                return;
            }

            e.preventDefault();
            e.stopImmediatePropagation();

            purgePage(page);
        }
    );
})();